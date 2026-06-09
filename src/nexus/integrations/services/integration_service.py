"""Integration Service for database operations and business logic."""

from collections.abc import Iterable
from datetime import UTC, datetime
from typing import NoReturn
from uuid import UUID

import structlog
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.attributes import flag_modified
from sqlmodel import col, delete, select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.engine import AllowedProjectsResult
from nexus.core.models import User
from nexus.core.services import BaseService
from nexus.core.services.secret_service import SecretService
from nexus.credentials.lib.injector_resolver import InjectorResolver
from nexus.credentials.models.credential import Credential
from nexus.credentials.models.credential_type import CredentialType
from nexus.integrations.adapters.factory import create_health_check_adapter
from nexus.integrations.adapters.protocol import HealthCheckResult
from nexus.integrations.exceptions import (
    IntegrationCredentialNotFoundError,
    IntegrationCredentialRequiredError,
    IntegrationCredentialTypeMismatchError,
    IntegrationNameConflictError,
    IntegrationNotFoundError,
)
from nexus.integrations.models.integration import (
    Integration,
    IntegrationCreate,
    IntegrationListResponse,
    IntegrationPatch,
    IntegrationProjectAssignment,
    IntegrationRead,
    IntegrationScope,
    IntegrationStatus,
    IntegrationSystemUpdate,
    IntegrationTestConnection,
    IntegrationType,
)
from nexus.integrations.models.integration_configuration import (
    MCPServerConfiguration,
    MCPServerConfigurationInput,
)
from nexus.settings.cache.settings_cache import get_runtime_settings

logger = structlog.stdlib.get_logger(__name__)

ALLOWED_CREDENTIAL_TYPES: dict[IntegrationType, frozenset[str]] = {
    IntegrationType.MCP_SERVER: frozenset({"HTTP Bearer Token"}),
    IntegrationType.LLM_PROVIDER: frozenset({"LLM Provider"}),
    IntegrationType.AAP_GATEWAY: frozenset({"Ansible Automation Platform"}),
}


class IntegrationService(BaseService):
    """Service for Integration CRUD operations."""

    def __init__(
        self,
        session: AsyncSession,
        user: User,
        secret_service: SecretService | None = None,
    ) -> None:
        """Initialize with database session, current user, and optional secret service."""
        super().__init__(session, user)
        self._secret_service = secret_service

    def _is_duplicate_name_error(self, e: IntegrityError) -> bool:
        return "ix_integrations_name_unique" in str(e)

    async def _handle_integrity_error(self, e: IntegrityError, integration_name: str) -> NoReturn:
        if self._is_duplicate_name_error(e):
            raise IntegrationNameConflictError(integration_name) from e
        raise e

    async def _validate_credential_type(
        self,
        integration_type: IntegrationType,
        credential_id: UUID,
    ) -> None:
        """Verify the credential's type is compatible with the integration type."""
        credential = await self.session.get(Credential, credential_id)
        if not credential:
            raise IntegrationCredentialNotFoundError(credential_id)

        cred_type = await self.session.get(CredentialType, credential.credential_type_id)
        if not cred_type:
            raise IntegrationCredentialNotFoundError(credential_id)

        allowed = ALLOWED_CREDENTIAL_TYPES.get(integration_type)
        if allowed and cred_type.name not in allowed:
            raise IntegrationCredentialTypeMismatchError(integration_type.value, cred_type.name, allowed)

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
        if data.management_credential_id is not None:
            await self._validate_credential_type(data.integration_type, data.management_credential_id)

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

    async def get_integration(
        self,
        integration_id: UUID,
        *,
        allowed_projects: AllowedProjectsResult | None = None,
    ) -> IntegrationRead:
        """Get an integration by ID, optionally enforcing project-scoped visibility."""
        integration = await self._get_or_raise(integration_id)
        if allowed_projects is not None:
            await self._enforce_visibility(integration, allowed_projects)
        return IntegrationRead.model_validate(integration)

    async def _enforce_visibility(self, integration: Integration, allowed_projects: AllowedProjectsResult) -> None:
        """Raise IntegrationNotFoundError if the integration is not visible to the caller."""
        if allowed_projects.all_projects:
            return
        visible_ids = await self._resolve_visible_integration_ids(allowed_projects)
        if visible_ids is not None and integration.id not in set(visible_ids):
            raise IntegrationNotFoundError(integration.id)

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

        if not allowed_projects.project_ids:
            result = await self.session.exec(global_query)
            return list(result.all())

        assignment_query = select(IntegrationProjectAssignment.integration_id).where(
            col(IntegrationProjectAssignment.project_id).in_(allowed_projects.project_ids),
        )

        union_result = await self.session.execute(global_query.union(assignment_query))
        return list(union_result.scalars().all())

    async def patch_integration(self, integration_id: UUID, data: IntegrationPatch) -> IntegrationRead:
        """Apply partial updates to an integration."""
        integration = await self._get_or_raise(integration_id)

        if data.configuration is not None and data.configuration.integration_type != integration.integration_type.value:
            msg = (
                f"configuration.integration_type '{data.configuration.integration_type}' "
                f"does not match integration type '{integration.integration_type.value}'"
            )
            raise ValueError(msg)

        if "management_credential_id" in data.model_fields_set and data.management_credential_id is not None:
            await self._validate_credential_type(integration.integration_type, data.management_credential_id)

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

    async def _resolve_credential(self, credential_id: UUID) -> dict[str, object]:
        """Resolve a credential to its extra_vars dict for adapter use.

        Fetches the credential, decrypts its secret, and applies injector
        mappings to produce the resolved variable dict.

        Raises:
            IntegrationCredentialNotFoundError: If the credential or its type is not found.
            RuntimeError: If SecretService is not available.

        """
        if self._secret_service is None:
            msg = "SecretService is required for credential resolution"
            raise RuntimeError(msg)

        credential = await self.session.get(Credential, credential_id)
        if not credential or not credential.secret_id:
            raise IntegrationCredentialNotFoundError(credential_id)

        cred_type = await self.session.get(CredentialType, credential.credential_type_id)
        if not cred_type:
            raise IntegrationCredentialNotFoundError(credential_id)

        decrypted_inputs = await self._secret_service.retrieve_secret(credential.secret_id)
        resolved = InjectorResolver.resolve(cred_type.injectors or {}, decrypted_inputs)
        return resolved.extra_vars

    async def validate_integration(self, integration_id: UUID) -> HealthCheckResult:
        """Run a health check on a saved integration.

        Resolves the management credential, dispatches to the type-specific
        adapter, persists the result (including discovered resources), and
        returns the health check result.

        Status transitions: current → VALIDATING → AVAILABLE or ERROR.
        ``last_validated_at`` is set only after the check completes.
        """
        integration = await self._get_or_raise(integration_id)

        if not integration.management_credential_id:
            raise IntegrationCredentialRequiredError(integration_id)

        resolved_credential = await self._resolve_credential(integration.management_credential_id)

        # Set VALIDATING now that credential resolution succeeded
        integration.status = IntegrationStatus.VALIDATING
        integration.validation_error = None
        await self.session.flush()

        timeout_seconds: int = (
            await get_runtime_settings().get(
                "integrations.connection_test_timeout_seconds",
            )
            or 10
        )

        adapter = create_health_check_adapter(integration.integration_type, integration.configuration)
        result = await adapter.health_check(resolved_credential, timeout_seconds)

        # Persist discovered resources back to the configuration JSONB
        self._persist_discovered_resources(integration, result)

        integration.status = IntegrationStatus.AVAILABLE if result.success else IntegrationStatus.ERROR
        integration.validation_error = result.error

        integration.last_validated_at = datetime.now(UTC)
        await self.session.commit()

        return result

    async def test_connection(self, data: IntegrationTestConnection) -> HealthCheckResult:
        """Test a connection without saving an integration.

        Resolves the credential, creates an adapter from the provided
        configuration, and runs the health check. No database writes.
        """
        resolved_credential = await self._resolve_credential(data.credential_id)

        timeout_seconds: int = (
            await get_runtime_settings().get(
                "integrations.connection_test_timeout_seconds",
            )
            or 10
        )

        configuration = data.configuration
        if isinstance(configuration, MCPServerConfigurationInput):
            configuration = MCPServerConfiguration(
                integration_type=configuration.integration_type,
                base_url=configuration.base_url,
            )

        adapter = create_health_check_adapter(data.integration_type, configuration)
        return await adapter.health_check(resolved_credential, timeout_seconds)

    @staticmethod
    def _persist_discovered_resources(integration: Integration, result: HealthCheckResult) -> None:
        """Write discovered resources from the health check back to the integration's configuration.

        Only updates system-managed discovery fields; admin-managed fields
        (e.g. allowed_model_ids) are preserved.
        """
        if not result.success:
            return

        config = integration.configuration

        if isinstance(config, MCPServerConfiguration) and result.discovered_tools is not None:
            config.discovered_tools = result.discovered_tools
            integration.configuration = config
            flag_modified(integration, "configuration")

    async def delete_integration(self, integration_id: UUID) -> None:
        """Soft-delete an integration and remove project assignments."""
        integration = await self._get_or_raise(integration_id)

        integration.soft_delete(self.user.id)

        stmt = delete(IntegrationProjectAssignment).where(
            IntegrationProjectAssignment.integration_id == integration_id,  # type: ignore[arg-type]
        )
        await self.session.exec(stmt)

        await self.session.flush()
