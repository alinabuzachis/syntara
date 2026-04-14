"""Role service for CRUD operations."""

from collections.abc import Iterable
from uuid import UUID

import structlog
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.exceptions import BuiltinProtectionError, RoleNameConflictError, RoleNotFoundError
from nexus.authz.models.assignments import GroupRoleAssignment, UserRoleAssignment
from nexus.authz.models.policy import Policy
from nexus.authz.models.role import Role, RolePolicyLink
from nexus.authz.schemas import RoleListResponse, RoleRead
from nexus.core.exceptions import SafeValueError
from nexus.core.models import User
from nexus.core.services.base import BaseService

logger = structlog.stdlib.get_logger(__name__)


class RoleService(BaseService):
    """Service for role CRUD operations."""

    def __init__(self, session: AsyncSession, user: User) -> None:
        """Initialize with database session and current user."""
        super().__init__(session, user)

    async def _get_policy_names_for_role(self, role_id: UUID) -> list[str]:
        """Load policy names linked to a role via the join table."""
        result = await self.session.exec(
            select(Policy.name)
            .join(RolePolicyLink, RolePolicyLink.policy_id == Policy.id)  # type: ignore[arg-type]
            .where(RolePolicyLink.role_id == role_id)
        )
        return list(result.all())

    async def to_role_read(self, role: Role) -> RoleRead:
        """Convert a Role model to a RoleRead schema, loading policy names."""
        policy_names = await self._get_policy_names_for_role(role.id)
        return RoleRead(
            id=role.id,
            name=role.name,
            description=role.description,
            policies=policy_names,
            is_builtin=role.is_builtin,
            project_id=role.project_id,
            labels=role.labels,
            created_at=role.created_at,
            updated_at=role.updated_at,
        )

    async def create_role(
        self,
        name: str,
        policies: list[str],
        description: str | None = None,
        labels: dict[str, str] | None = None,
        project_id: UUID | None = None,
    ) -> Role:
        """Create a custom role. Validates that all referenced policy names exist."""
        await self._check_name_conflict(name, project_id)
        policy_map = await self._resolve_policies(policies)

        role = Role(
            name=name,
            description=description,
            is_builtin=False,
            project_id=project_id,
            labels=labels or {},
        )
        self.session.add(role)
        await self.session.flush()

        # Create join table rows
        for policy in policy_map.values():
            self.session.add(RolePolicyLink(role_id=role.id, policy_id=policy.id))

        await self.session.commit()
        await self.session.refresh(role)

        logger.info("Created role", role_id=str(role.id), name=name)
        return role

    async def get_role(self, role_id: UUID) -> Role:
        """Get a role by ID."""
        result = await self.session.exec(select(Role).where(Role.id == role_id))
        role = result.first()
        if not role:
            msg = f"Role {role_id} not found"
            raise RoleNotFoundError(msg)
        return role

    async def list_roles(
        self,
        limit: int = 20,
        cursor: str | None = None,
        sort: str | None = None,
        query_params_items: Iterable[tuple[str, str]] | None = None,
        *,
        include_total: bool = False,
    ) -> RoleListResponse:
        """List roles with filtering and pagination."""
        # Batch-load policy names for all roles in the result via post_query_callback,
        # then use a closure converter that reads from the pre-loaded dict.
        policy_names_by_role: dict[UUID, list[str]] = {}

        async def _load_policies(roles: list[Role]) -> None:
            role_ids = [r.id for r in roles]
            if not role_ids:
                return
            links = await self.session.exec(
                select(RolePolicyLink.role_id, Policy.name)
                .join(Policy, Policy.id == RolePolicyLink.policy_id)  # type: ignore[arg-type]
                .where(RolePolicyLink.role_id.in_(role_ids))  # type: ignore[attr-defined]
            )
            for role_id, policy_name in links.all():
                policy_names_by_role.setdefault(role_id, []).append(policy_name)

        def _convert(role: Role) -> RoleRead:
            return RoleRead(
                id=role.id,
                name=role.name,
                description=role.description,
                policies=policy_names_by_role.get(role.id, []),
                is_builtin=role.is_builtin,
                project_id=role.project_id,
                labels=role.labels,
                created_at=role.created_at,
                updated_at=role.updated_at,
            )

        return await self.list_resources(
            model=Role,
            response_type=RoleListResponse,
            response_type_converter=_convert,
            post_query_callback=_load_policies,
            limit=limit,
            cursor=cursor,
            sort=sort,
            query_params_items=query_params_items,
            include_total=include_total,
        )

    async def update_role(
        self,
        role_id: UUID,
        name: str | None = None,
        description: str | None = None,
        policies: list[str] | None = None,
        labels: dict[str, str] | None = None,
    ) -> Role:
        """Update a role. Builtin roles cannot be updated."""
        role = await self.get_role(role_id)
        if role.is_builtin:
            msg = "Cannot modify builtin role"
            raise BuiltinProtectionError(msg)

        if name is not None and name != role.name:
            await self._check_name_conflict(name, role.project_id)
            role.name = name
        if description is not None:
            role.description = description
        if policies is not None:
            policy_map = await self._resolve_policies(policies)
            # Replace join table rows: delete existing, add new
            existing_links = await self.session.exec(select(RolePolicyLink).where(RolePolicyLink.role_id == role.id))
            for link in existing_links.all():
                await self.session.delete(link)
            await self.session.flush()
            for policy in policy_map.values():
                self.session.add(RolePolicyLink(role_id=role.id, policy_id=policy.id))
        if labels is not None:
            role.labels = labels

        self.session.add(role)
        await self.session.commit()
        await self.session.refresh(role)

        logger.info("Updated role", role_id=str(role_id))
        return role

    async def delete_role(self, role_id: UUID) -> None:
        """Delete a role. Builtin roles cannot be deleted."""
        role = await self.get_role(role_id)
        if role.is_builtin:
            msg = "Cannot delete builtin role"
            raise BuiltinProtectionError(msg)

        # Delete all references to this role
        for model in (RolePolicyLink, UserRoleAssignment, GroupRoleAssignment):
            results = await self.session.exec(select(model).where(model.role_id == role.id))
            for row in results.all():
                await self.session.delete(row)

        await self.session.delete(role)
        await self.session.commit()

        logger.info("Deleted role", role_id=str(role_id))

    async def _check_name_conflict(self, name: str, project_id: UUID | None) -> None:
        """Check if a role name already exists in the same scope."""
        query = select(Role).where(Role.name == name)
        if project_id is not None:
            query = query.where(Role.project_id == project_id)
        else:
            query = query.where(Role.project_id.is_(None))  # type: ignore[union-attr]
        result = await self.session.exec(query)
        if result.first():
            scope = f"project {project_id}" if project_id else "global scope"
            msg = f"Role '{name}' already exists in {scope}"
            raise RoleNameConflictError(msg)

    async def _resolve_policies(self, policy_names: list[str]) -> dict[str, Policy]:
        """Validate that all referenced policy names exist and return them.

        Returns:
            Dict mapping policy name → Policy object.

        """
        if not policy_names:
            return {}
        result = await self.session.exec(
            select(Policy).where(Policy.name.in_(policy_names))  # type: ignore[attr-defined]
        )
        found = {p.name: p for p in result.all()}
        missing = set(policy_names) - set(found.keys())
        if missing:
            msg = f"Unknown policies: {', '.join(sorted(missing))}"
            raise SafeValueError(msg)
        return found
