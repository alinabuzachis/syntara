"""Project service for business logic."""

from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import structlog
from sqlalchemy import delete, update
from sqlmodel import or_, select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.engine import AllowedProjectsResult, assign_authenticated_group_project_user, assign_project_admin
from nexus.authz.models.assignments import GroupRoleAssignment, UserRoleAssignment
from nexus.authz.models.project import Project
from nexus.authz.role_conventions import get_builtin_role
from nexus.core.exceptions import SafeValueError
from nexus.core.models import User
from nexus.core.models.group import Group

logger = structlog.stdlib.get_logger(__name__)


class ProjectService:
    """Service for project CRUD and role management."""

    def __init__(self, session: AsyncSession, user: User) -> None:
        """Initialize with database session and current user."""
        self.session = session
        self.user = user

    async def create_project(
        self,
        name: str,
        description: str | None = None,
        labels: dict[str, Any] | None = None,
    ) -> Project:
        """Create a project and assign the creator as project-admin.

        Args:
            name: Project name (must be unique).
            description: Optional description.
            labels: Optional key-value labels.

        Returns:
            The created project.

        """
        project = Project(
            name=name,
            description=description,
            labels=labels or {},
        )
        self.session.add(project)
        await self.session.flush()

        # Auto-assign creator as project-admin
        await assign_project_admin(self.session, self.user.id, project.id)

        # If this is a default project, grant all authenticated users access
        if project.is_default:
            await assign_authenticated_group_project_user(self.session, project.id)

        await self.session.commit()
        await self.session.refresh(project)
        return project

    async def get_project(self, project_id: UUID) -> Project:
        """Get a project by ID.

        Args:
            project_id: Project UUID.

        Returns:
            The project.

        Raises:
            SafeValueError: If project not found or deleted.

        """
        result = await self.session.exec(
            select(Project).where(
                Project.id == project_id,
                Project.deleted_at.is_(None),  # type: ignore[union-attr]
            )
        )
        project = result.first()
        if not project:
            from nexus.authz.exceptions import ProjectNotFoundError  # noqa: PLC0415

            msg = f"Project {project_id} not found"
            raise ProjectNotFoundError(msg)
        return project

    async def list_projects(
        self,
        allowed_projects: AllowedProjectsResult | None = None,
    ) -> list[Project]:
        """List non-deleted projects, filtered by authorization.

        Args:
            allowed_projects: When provided, filters to only projects the user
                can access. If all_projects is True, no filtering is applied.

        Returns:
            List of projects.

        """
        query = select(Project).where(
            Project.deleted_at.is_(None),  # type: ignore[union-attr]
        )

        if allowed_projects is not None and not allowed_projects.all_projects:
            if not allowed_projects.project_ids:
                return []
            query = query.where(Project.id.in_(allowed_projects.project_ids))  # type: ignore[attr-defined]

        result = await self.session.exec(query)
        return list(result.all())

    async def update_project(
        self,
        project_id: UUID,
        name: str | None = None,
        description: str | None = None,
        labels: dict[str, Any] | None = None,
    ) -> Project:
        """Update a project.

        Args:
            project_id: Project UUID.
            name: New name (optional).
            description: New description (optional).
            labels: New labels (optional).

        Returns:
            The updated project.

        Raises:
            SafeValueError: If project not found.

        """
        project = await self.get_project(project_id)
        if name is not None:
            project.name = name
        if description is not None:
            project.description = description
        if labels is not None:
            project.labels = labels
        self.session.add(project)
        await self.session.commit()
        await self.session.refresh(project)
        return project

    async def delete_project(self, project_id: UUID) -> None:
        """Soft-delete a project and cascade-clean all project-scoped resources.

        Args:
            project_id: Project UUID.

        Raises:
            SafeValueError: If project not found.

        """
        project = await self.get_project(project_id)
        await self._cascade_cleanup_project_resources(project_id)
        project.soft_delete(self.user.id)
        self.session.add(project)
        await self.session.commit()

    async def _cascade_cleanup_project_resources(self, project_id: UUID) -> None:
        """Remove all project-scoped resources before soft-deleting the project.

        Uses bulk SQL for efficiency. Ordering respects FK constraints.
        Soft-deletable resources are soft-deleted; others are hard-deleted.
        """
        from nexus.approvals.models.approval_request import ApprovalRequest  # noqa: PLC0415
        from nexus.authz.models.policy import Policy  # noqa: PLC0415
        from nexus.authz.models.role import Role  # noqa: PLC0415
        from nexus.core.models.secret import EncryptedSecret, Secret  # noqa: PLC0415
        from nexus.credentials.models.credential import Credential  # noqa: PLC0415
        from nexus.workflows.models.execution import Execution  # noqa: PLC0415
        from nexus.workflows.models.workflow import Workflow  # noqa: PLC0415
        from nexus.workflows.models.workflow_version import WorkflowVersion  # noqa: PLC0415

        now = datetime.now(UTC)
        user_id = self.user.id

        # Step 1: Hard-delete approval requests
        await self.session.execute(
            delete(ApprovalRequest).where(ApprovalRequest.project_id == project_id)  # type: ignore[arg-type]
        )

        # Step 2: Soft-delete executions
        await self.session.execute(
            update(Execution)
            .where(
                Execution.project_id == project_id,  # type: ignore[arg-type]
                Execution.deleted_at.is_(None),  # type: ignore[union-attr]
            )
            .values(deleted_at=now, deleted_by=user_id)
        )

        # Step 3: Soft-delete workflow versions (no direct project_id, found via workflow)
        workflow_ids_subq = select(Workflow.id).where(Workflow.project_id == project_id).scalar_subquery()
        await self.session.execute(
            update(WorkflowVersion)
            .where(
                WorkflowVersion.workflow_id.in_(workflow_ids_subq),  # type: ignore[attr-defined]
                WorkflowVersion.deleted_at.is_(None),  # type: ignore[union-attr]
            )
            .values(deleted_at=now, deleted_by=user_id)
        )

        # Step 4: Soft-delete workflows
        await self.session.execute(
            update(Workflow)
            .where(
                Workflow.project_id == project_id,  # type: ignore[arg-type]
                Workflow.deleted_at.is_(None),  # type: ignore[union-attr]
            )
            .values(deleted_at=now, deleted_by=user_id)
        )

        # Step 5: Collect secret IDs, null FK, then delete secrets and soft-delete credentials
        secret_ids_result = await self.session.execute(
            select(Credential.secret_id).where(
                Credential.project_id == project_id,
                Credential.secret_id.isnot(None),  # type: ignore[union-attr]
            )
        )
        secret_ids = [row[0] for row in secret_ids_result.all()]

        # Null secret_id and soft-delete credentials (breaks FK before secret deletion)
        await self.session.execute(
            update(Credential)
            .where(Credential.project_id == project_id)  # type: ignore[arg-type]
            .values(secret_id=None, deleted_at=now, deleted_by=user_id)
        )

        # Now safe to delete secrets
        if secret_ids:
            await self.session.execute(
                delete(EncryptedSecret).where(
                    EncryptedSecret.secret_id.in_(secret_ids)  # type: ignore[attr-defined]
                )
            )
            await self.session.execute(
                delete(Secret).where(Secret.id.in_(secret_ids))  # type: ignore[attr-defined]
            )

        # Step 6: Hard-delete role assignments
        await self.session.execute(
            delete(UserRoleAssignment).where(UserRoleAssignment.project_id == project_id)  # type: ignore[arg-type]
        )
        await self.session.execute(
            delete(GroupRoleAssignment).where(GroupRoleAssignment.project_id == project_id)  # type: ignore[arg-type]
        )

        # Step 7: Hard-delete custom roles
        await self.session.execute(
            delete(Role).where(Role.project_id == project_id)  # type: ignore[arg-type]
        )

        # Step 8: Hard-delete custom policies
        await self.session.execute(
            delete(Policy).where(Policy.project_id == project_id)  # type: ignore[arg-type]
        )

        logger.info("Cascade-cleaned project resources", project_id=str(project_id))

    async def assign_role(
        self,
        project_id: UUID,
        user_id: UUID,
        role_name: str,
    ) -> UserRoleAssignment:
        """Assign a project-scoped role to a user.

        Args:
            project_id: Project UUID.
            user_id: User to assign the role to.
            role_name: One of: project-admin, project-user, project-auditor.

        Returns:
            The created assignment.

        Raises:
            SafeValueError: If role_name is not an assignable project role,
                or if the role/project doesn't exist.

        """
        await self.get_project(project_id)
        await self._validate_project_role(role_name, project_id)

        existing = await self.session.exec(
            select(UserRoleAssignment).where(
                UserRoleAssignment.user_id == user_id,
                UserRoleAssignment.project_id == project_id,
                UserRoleAssignment.role_name == role_name,
            )
        )
        if existing.first():
            msg = f"Role '{role_name}' is already assigned to user in this project"
            raise SafeValueError(msg)

        assignment = UserRoleAssignment(
            user_id=user_id,
            project_id=project_id,
            role_name=role_name,
        )
        self.session.add(assignment)
        await self.session.commit()
        await self.session.refresh(assignment)

        logger.info(
            "Assigned project role",
            project_id=str(project_id),
            user_id=str(user_id),
            role_name=role_name,
        )
        return assignment

    async def revoke_role(
        self,
        project_id: UUID,
        assignment_id: UUID,
    ) -> None:
        """Remove a project role assignment.

        Args:
            project_id: Project UUID.
            assignment_id: Assignment UUID to remove.

        Raises:
            SafeValueError: If assignment not found.

        """
        result = await self.session.exec(
            select(UserRoleAssignment).where(
                UserRoleAssignment.id == assignment_id,
                UserRoleAssignment.project_id == project_id,
            )
        )
        assignment = result.first()
        if not assignment:
            msg = f"Assignment {assignment_id} not found in project {project_id}"
            raise SafeValueError(msg)

        await self.session.delete(assignment)
        await self.session.commit()

    async def list_role_assignments(
        self,
        project_id: UUID,
        *,
        user_id: UUID | None = None,
    ) -> list[dict[str, Any]]:
        """List role assignments for a project.

        Args:
            project_id: Project UUID.
            user_id: If provided, only return assignments for this user.

        Returns:
            List of assignment dicts with role_name included.

        """
        await self.get_project(project_id)

        stmt = select(UserRoleAssignment, User).where(
            UserRoleAssignment.project_id == project_id,
            UserRoleAssignment.user_id == User.id,
        )
        if user_id is not None:
            stmt = stmt.where(UserRoleAssignment.user_id == user_id)
        result = await self.session.exec(stmt)
        return [
            {
                "id": assignment.id,
                "user_id": assignment.user_id,
                "username": user.username,
                "project_id": assignment.project_id,
                "role_name": assignment.role_name,
                "created_at": assignment.created_at,
            }
            for assignment, user in result.all()
        ]

    async def assign_group_role(
        self,
        project_id: UUID,
        group_id: UUID,
        role_name: str,
    ) -> GroupRoleAssignment:
        """Assign a project-scoped role to a group.

        Args:
            project_id: Project UUID.
            group_id: Group to assign the role to.
            role_name: One of: project-admin, project-user, project-auditor.

        Returns:
            The created assignment.

        Raises:
            SafeValueError: If role_name is invalid or role/project/group not found.

        """
        await self.get_project(project_id)
        await self._validate_project_role(role_name, project_id)

        existing = await self.session.exec(
            select(GroupRoleAssignment).where(
                GroupRoleAssignment.group_id == group_id,
                GroupRoleAssignment.project_id == project_id,
                GroupRoleAssignment.role_name == role_name,
            )
        )
        if existing.first():
            msg = f"Role '{role_name}' is already assigned to group in this project"
            raise SafeValueError(msg)

        assignment = GroupRoleAssignment(
            group_id=group_id,
            project_id=project_id,
            role_name=role_name,
        )
        self.session.add(assignment)
        await self.session.commit()
        await self.session.refresh(assignment)

        logger.info(
            "Assigned project group role",
            project_id=str(project_id),
            group_id=str(group_id),
            role_name=role_name,
        )
        return assignment

    async def revoke_group_role(
        self,
        project_id: UUID,
        assignment_id: UUID,
    ) -> None:
        """Remove a project group role assignment.

        Args:
            project_id: Project UUID.
            assignment_id: Assignment UUID to remove.

        Raises:
            SafeValueError: If assignment not found.

        """
        result = await self.session.exec(
            select(GroupRoleAssignment).where(
                GroupRoleAssignment.id == assignment_id,
                GroupRoleAssignment.project_id == project_id,
            )
        )
        assignment = result.first()
        if not assignment:
            msg = f"Group assignment {assignment_id} not found in project {project_id}"
            raise SafeValueError(msg)

        await self.session.delete(assignment)
        await self.session.commit()

    async def list_group_role_assignments(
        self,
        project_id: UUID,
        *,
        group_ids: list[UUID] | None = None,
    ) -> list[dict[str, Any]]:
        """List group role assignments for a project.

        Args:
            project_id: Project UUID.
            group_ids: If provided, only return assignments for these groups.

        Returns:
            List of assignment dicts with role_name included.

        """
        await self.get_project(project_id)

        stmt = select(GroupRoleAssignment, Group).where(
            GroupRoleAssignment.project_id == project_id,
            GroupRoleAssignment.group_id == Group.id,
        )
        if group_ids is not None:
            stmt = stmt.where(GroupRoleAssignment.group_id.in_(group_ids))  # type: ignore[attr-defined]
        result = await self.session.exec(stmt)
        return [
            {
                "id": assignment.id,
                "group_id": assignment.group_id,
                "group_name": group.name,
                "project_id": assignment.project_id,
                "role_name": assignment.role_name,
                "created_at": assignment.created_at,
            }
            for assignment, group in result.all()
        ]

    async def _validate_project_role(self, role_name: str, project_id: UUID) -> None:
        """Validate that role_name is a known role (builtin or custom)."""
        if get_builtin_role(role_name):
            return

        from nexus.authz.models.role import Role  # noqa: PLC0415

        result = await self.session.exec(
            select(Role).where(
                Role.name == role_name,
                or_(Role.project_id == project_id, Role.project_id.is_(None)),  # type: ignore[union-attr]
            )
        )
        if result.first():
            return

        msg = f"Role '{role_name}' not found"
        raise SafeValueError(msg)
