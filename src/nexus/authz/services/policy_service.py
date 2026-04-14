"""Policy service for CRUD operations."""

from collections.abc import Iterable
from typing import Any
from uuid import UUID

import structlog
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.exceptions import BuiltinProtectionError, PolicyNameConflictError, PolicyNotFoundError
from nexus.authz.models.policy import Policy
from nexus.authz.schemas import PolicyListResponse, PolicyRead
from nexus.core.models import User
from nexus.core.services.base import BaseService

logger = structlog.stdlib.get_logger(__name__)


class PolicyService(BaseService):
    """Service for policy CRUD operations."""

    def __init__(self, session: AsyncSession, user: User) -> None:
        """Initialize with database session and current user."""
        super().__init__(session, user)

    async def create_policy(
        self,
        name: str,
        statements: list[dict[str, Any]],
        description: str | None = None,
        labels: dict[str, str] | None = None,
        project_id: UUID | None = None,
    ) -> Policy:
        """Create a custom policy."""
        await self._check_name_conflict(name, project_id)

        policy = Policy(
            name=name,
            description=description,
            statements=statements,
            is_builtin=False,
            project_id=project_id,
            labels=labels or {},
        )
        self.session.add(policy)
        await self.session.commit()
        await self.session.refresh(policy)

        logger.info("Created policy", policy_id=str(policy.id), name=name)
        return policy

    async def get_policy(self, policy_id: UUID) -> Policy:
        """Get a policy by ID."""
        result = await self.session.exec(select(Policy).where(Policy.id == policy_id))
        policy = result.first()
        if not policy:
            msg = f"Policy {policy_id} not found"
            raise PolicyNotFoundError(msg)
        return policy

    async def list_policies(
        self,
        limit: int = 20,
        cursor: str | None = None,
        sort: str | None = None,
        query_params_items: Iterable[tuple[str, str]] | None = None,
        *,
        include_total: bool = False,
    ) -> PolicyListResponse:
        """List policies with filtering and pagination."""
        return await self.list_resources(
            model=Policy,
            response_type=PolicyListResponse,
            response_type_converter=lambda p: PolicyRead.model_validate(p),
            limit=limit,
            cursor=cursor,
            sort=sort,
            query_params_items=query_params_items,
            include_total=include_total,
        )

    async def update_policy(
        self,
        policy_id: UUID,
        name: str | None = None,
        description: str | None = None,
        statements: list[dict[str, Any]] | None = None,
        labels: dict[str, str] | None = None,
    ) -> Policy:
        """Update a policy. Builtin policies cannot be updated."""
        policy = await self.get_policy(policy_id)
        if policy.is_builtin:
            msg = "Cannot modify builtin policy"
            raise BuiltinProtectionError(msg)

        if name is not None and name != policy.name:
            await self._check_name_conflict(name, policy.project_id)
            policy.name = name
        if description is not None:
            policy.description = description
        if statements is not None:
            policy.statements = statements
        if labels is not None:
            policy.labels = labels

        self.session.add(policy)
        await self.session.commit()
        await self.session.refresh(policy)

        logger.info("Updated policy", policy_id=str(policy_id))
        return policy

    async def delete_policy(self, policy_id: UUID) -> None:
        """Delete a policy. Builtin policies cannot be deleted."""
        policy = await self.get_policy(policy_id)
        if policy.is_builtin:
            msg = "Cannot delete builtin policy"
            raise BuiltinProtectionError(msg)

        await self.session.delete(policy)
        await self.session.commit()

        logger.info("Deleted policy", policy_id=str(policy_id))

    async def _check_name_conflict(self, name: str, project_id: UUID | None) -> None:
        """Check if a policy name already exists in the same scope."""
        query = select(Policy).where(Policy.name == name)
        if project_id is not None:
            query = query.where(Policy.project_id == project_id)
        else:
            query = query.where(Policy.project_id.is_(None))  # type: ignore[union-attr]
        result = await self.session.exec(query)
        if result.first():
            scope = f"project {project_id}" if project_id else "global scope"
            msg = f"Policy '{name}' already exists in {scope}"
            raise PolicyNameConflictError(msg)
