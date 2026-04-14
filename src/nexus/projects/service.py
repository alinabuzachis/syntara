"""Project service for business logic."""

from typing import Any
from uuid import UUID

import structlog
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.engine import AllowedProjectsResult, assign_authenticated_group_project_user, assign_project_admin
from nexus.authz.models.assignments import GroupRoleAssignment, UserRoleAssignment
from nexus.authz.models.project import Project
from nexus.authz.models.role import Role
from nexus.core.exceptions import SafeValueError
from nexus.core.models import User
from nexus.core.models.group import Group

logger = structlog.stdlib.get_logger(__name__)

# Roles that can be assigned within a project
ASSIGNABLE_PROJECT_ROLES = {"project-admin", "project-user", "project-auditor"}


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
            msg = f"Project {project_id} not found"
            raise SafeValueError(msg)
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
        """Soft-delete a project.

        Args:
            project_id: Project UUID.

        Raises:
            SafeValueError: If project not found.

        """
        project = await self.get_project(project_id)
        project.soft_delete(self.user.id)
        self.session.add(project)
        await self.session.commit()

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
        if role_name not in ASSIGNABLE_PROJECT_ROLES:
            msg = f"Invalid project role '{role_name}'. Must be one of: {', '.join(sorted(ASSIGNABLE_PROJECT_ROLES))}"
            raise SafeValueError(msg)

        # Verify project exists
        await self.get_project(project_id)

        # Look up the role
        role_result = await self.session.exec(select(Role).where(Role.name == role_name))
        role = role_result.first()
        if not role:
            msg = f"Role '{role_name}' not found"
            raise SafeValueError(msg)

        # Check for duplicate
        existing = await self.session.exec(
            select(UserRoleAssignment).where(
                UserRoleAssignment.user_id == user_id,
                UserRoleAssignment.project_id == project_id,
                UserRoleAssignment.role_id == role.id,
            )
        )
        if existing.first():
            msg = f"Role '{role_name}' is already assigned to user in this project"
            raise SafeValueError(msg)

        assignment = UserRoleAssignment(
            user_id=user_id,
            project_id=project_id,
            role_id=role.id,
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
    ) -> list[dict[str, Any]]:
        """List all role assignments for a project.

        Args:
            project_id: Project UUID.

        Returns:
            List of assignment dicts with role_name included.

        """
        # Verify project exists
        await self.get_project(project_id)

        result = await self.session.exec(
            select(UserRoleAssignment, Role, User).where(
                UserRoleAssignment.project_id == project_id,
                UserRoleAssignment.role_id == Role.id,
                UserRoleAssignment.user_id == User.id,
            )
        )
        return [
            {
                "id": assignment.id,
                "user_id": assignment.user_id,
                "username": user.username,
                "project_id": assignment.project_id,
                "role_id": assignment.role_id,
                "role_name": role.name,
                "created_at": assignment.created_at,
            }
            for assignment, role, user in result.all()
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
        if role_name not in ASSIGNABLE_PROJECT_ROLES:
            msg = f"Invalid project role '{role_name}'. Must be one of: {', '.join(sorted(ASSIGNABLE_PROJECT_ROLES))}"
            raise SafeValueError(msg)

        await self.get_project(project_id)

        role_result = await self.session.exec(select(Role).where(Role.name == role_name))
        role = role_result.first()
        if not role:
            msg = f"Role '{role_name}' not found"
            raise SafeValueError(msg)

        # Check for duplicate
        existing = await self.session.exec(
            select(GroupRoleAssignment).where(
                GroupRoleAssignment.group_id == group_id,
                GroupRoleAssignment.project_id == project_id,
                GroupRoleAssignment.role_id == role.id,
            )
        )
        if existing.first():
            msg = f"Role '{role_name}' is already assigned to group in this project"
            raise SafeValueError(msg)

        assignment = GroupRoleAssignment(
            group_id=group_id,
            project_id=project_id,
            role_id=role.id,
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
    ) -> list[dict[str, Any]]:
        """List all group role assignments for a project.

        Args:
            project_id: Project UUID.

        Returns:
            List of assignment dicts with role_name included.

        """
        await self.get_project(project_id)

        result = await self.session.exec(
            select(GroupRoleAssignment, Role, Group).where(
                GroupRoleAssignment.project_id == project_id,
                GroupRoleAssignment.role_id == Role.id,
                GroupRoleAssignment.group_id == Group.id,
            )
        )
        return [
            {
                "id": assignment.id,
                "group_id": assignment.group_id,
                "group_name": group.name,
                "project_id": assignment.project_id,
                "role_id": assignment.role_id,
                "role_name": role.name,
                "created_at": assignment.created_at,
            }
            for assignment, role, group in result.all()
        ]
