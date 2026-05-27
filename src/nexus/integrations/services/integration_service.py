"""Integration Service for database operations and business logic."""

from collections.abc import Iterable
from datetime import UTC, datetime
from typing import NoReturn
from uuid import UUID

import structlog
from sqlalchemy.exc import IntegrityError
from sqlmodel import col, delete, select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.engine import AllowedProjectsResult
from nexus.core.models import User
from nexus.core.services import BaseService
from nexus.integrations.exceptions import IntegrationNameConflictError, IntegrationNotFoundError
from nexus.integrations.models.integration import (
    Integration,
    IntegrationCreate,
    IntegrationListResponse,
    IntegrationPatch,
    IntegrationProjectAssignment,
    IntegrationRead,
    IntegrationScope,
    IntegrationSystemUpdate,
)

logger = structlog.stdlib.get_logger(__name__)


class IntegrationService(BaseService):
    """Service for Integration CRUD operations."""

    def __init__(self, session: AsyncSession, user: User) -> None:
        """Initialize with database session and current user."""
        super().__init__(session, user)

    def _is_duplicate_name_error(self, e: IntegrityError) -> bool:
        return "ix_integrations_name_unique" in str(e)

    async def _handle_integrity_error(self, e: IntegrityError, integration_name: str) -> NoReturn:
        if self._is_duplicate_name_error(e):
            raise IntegrationNameConflictError(integration_name) from e
        raise e

    async def _get_or_raise(self, integration_id: UUID) -> Integration:
        query = select(Integration).filter(
            Integration.id == integration_id,  # type: ignore[arg-type]
            Integration.deleted_at.is_(None),  # type: ignore[union-attr]
        )
        result = await self.session.exec(query)
        integration = result.one_or_none()

        if not integration:
            raise IntegrationNotFoundError(integration_id)

        return integration

    async def create_integration(self, data: IntegrationCreate) -> IntegrationRead:
        """Create a new integration."""
        integration = Integration(
            name=data.name,
            description=data.description,
            integration_type=data.integration_type,
            configuration=data.configuration,
            management_credential_id=data.management_credential_id,
            enabled=data.enabled,
            scope=data.scope,
            labels=data.labels,
            created_by=self.user.id,
            updated_by=self.user.id,
        )

        self.session.add(integration)

        try:
            await self.session.flush()
            return IntegrationRead.model_validate(integration)
        except IntegrityError as e:
            await self._handle_integrity_error(e, data.name)

    async def get_integration(self, integration_id: UUID) -> IntegrationRead:
        """Get an integration by ID."""
        integration = await self._get_or_raise(integration_id)
        return IntegrationRead.model_validate(integration)

    async def list_integrations(
        self,
        limit: int = 100,
        cursor: str | None = None,
        sort: str | None = None,
        query_params_items: Iterable[tuple[str, str]] | None = None,
        *,
        include_total: bool = False,
        allowed_projects: AllowedProjectsResult | None = None,
    ) -> IntegrationListResponse:
        """List integrations with filtering, sorting, and pagination.

        Scope visibility rules:
        - GLOBAL integrations are visible to all callers.
        - PROJECT integrations are visible only when the caller has access to at least one
          of the projects the integration is assigned to.
        - Pass allowed_projects=None to skip scope filtering (internal/admin callers).
        """
        id_restriction: list[UUID] | None = None
        if allowed_projects is not None:
            id_restriction = await self._resolve_visible_integration_ids(allowed_projects)

        return await self.list_resources(
            model=Integration,
            response_type=IntegrationListResponse,
            limit=limit,
            cursor=cursor,
            sort=sort,
            query_params_items=query_params_items,
            include_total=include_total,
            id_restriction=id_restriction,
        )

    async def _resolve_visible_integration_ids(self, allowed_projects: AllowedProjectsResult) -> list[UUID] | None:
        """Return the set of integration IDs visible to the caller, or None for unrestricted access."""
        if allowed_projects.all_projects:
            return None

        global_query = select(Integration.id).where(
            Integration.scope == IntegrationScope.GLOBAL,
            Integration.deleted_at.is_(None),  # type: ignore[union-attr]
        )
        global_result = await self.session.exec(global_query)
        visible_ids: set[UUID] = set(global_result.all())

        if allowed_projects.project_ids:
            assignment_query = select(IntegrationProjectAssignment.integration_id).where(
                col(IntegrationProjectAssignment.project_id).in_(allowed_projects.project_ids),
            )
            assignment_result = await self.session.exec(assignment_query)
            visible_ids |= set(assignment_result.all())

        return list(visible_ids)

    async def patch_integration(self, integration_id: UUID, data: IntegrationPatch) -> IntegrationRead:
        """Apply partial updates to an integration."""
        integration = await self._get_or_raise(integration_id)

        integration_name = data.name if data.name is not None else integration.name

        for field in data.model_fields_set:
            setattr(integration, field, getattr(data, field))

        integration.updated_by = self.user.id
        integration.updated_at = datetime.now(UTC)

        try:
            await self.session.flush()
            return IntegrationRead.model_validate(integration)
        except IntegrityError as e:
            await self._handle_integrity_error(e, integration_name)

    async def update_validation_status(self, integration_id: UUID, data: IntegrationSystemUpdate) -> IntegrationRead:
        """Apply system-managed validation status updates."""
        integration = await self._get_or_raise(integration_id)

        for field in data.model_fields_set:
            setattr(integration, field, getattr(data, field))

        integration.last_validated_at = datetime.now(UTC)

        await self.session.flush()
        return IntegrationRead.model_validate(integration)

    async def delete_integration(self, integration_id: UUID) -> None:
        """Soft-delete an integration and remove project assignments."""
        integration = await self._get_or_raise(integration_id)

        integration.soft_delete(self.user.id)

        stmt = delete(IntegrationProjectAssignment).where(
            IntegrationProjectAssignment.integration_id == integration_id,  # type: ignore[arg-type]
        )
        await self.session.exec(stmt)

        await self.session.flush()
