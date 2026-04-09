"""Identity Provider Service for database operations and business logic."""

from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any, NoReturn
from uuid import UUID

import structlog
from sqlalchemy import Select, text
from sqlalchemy.exc import IntegrityError
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel.sql._expression_select_cls import SelectOfScalar

from nexus.core.models import User
from nexus.core.services import BaseService
from nexus.core.utils.crypto import encrypt_secret
from nexus.core.utils.filters import Filter
from nexus.identity_providers.exceptions import (
    IdentityProviderNameConflictError,
    IdentityProviderNotFoundError,
)
from nexus.identity_providers.models.identity_provider import (
    IdentityProvider,
    IdentityProviderCreate,
    IdentityProviderListResponse,
    IdentityProviderPatch,
    IdentityProviderResponse,
)

SelectIdentityProvider = Select[tuple[IdentityProvider]] | SelectOfScalar[tuple[IdentityProvider]]

logger = structlog.stdlib.get_logger(__name__)


class IdentityProviderService(BaseService):
    """Service for Identity Provider CRUD operations and business logic."""

    def __init__(self, session: AsyncSession, user: User) -> None:
        """Initialize service with database session and current user."""
        super().__init__(session, user)

    def _is_duplicate_name_error(self, e: IntegrityError) -> bool:
        """Check if IntegrityError is due to duplicate provider name."""
        error_str = str(e)
        return (
            "ix_identity_providers_name_unique" in error_str
            or "identity_providers.name" in error_str
            or ("duplicate key" in error_str.lower() and "name" in error_str.lower())
        )

    async def _handle_integrity_error(self, e: IntegrityError, provider_name: str) -> NoReturn:
        """Handle IntegrityError and raise appropriate domain exception."""
        if self._is_duplicate_name_error(e):
            raise IdentityProviderNameConflictError(provider_name) from e
        raise e

    def _get_special_field_handlers(self) -> dict[str, Any]:
        """Get special field handlers for identity provider specific filtering."""

        def handle_provider_type(
            query: SelectIdentityProvider, filter_obj: Filter, _model: type[IdentityProvider]
        ) -> SelectIdentityProvider:
            if filter_obj.operator.value == "eq":
                return query.filter(text("configuration->>'provider_type' = :value")).params(value=filter_obj.value)
            return query

        return {
            "provider_type": handle_provider_type,
            "configuration.provider_type": handle_provider_type,
        }

    async def list_providers(
        self,
        limit: int = 100,
        cursor: str | None = None,
        sort: str | None = None,
        query_params_items: Iterable[tuple[str, str]] | None = None,
        *,
        include_total: bool = False,
    ) -> IdentityProviderListResponse:
        """List identity providers with filtering, sorting, and pagination."""
        special_field_handlers = self._get_special_field_handlers()

        return await self.list_resources(
            model=IdentityProvider,
            response_type=IdentityProviderListResponse,
            limit=limit,
            cursor=cursor,
            sort=sort,
            special_field_handlers=special_field_handlers,
            query_params_items=query_params_items,
            include_total=include_total,
        )

    async def get_provider(self, provider_id: UUID) -> IdentityProviderResponse:
        """Get an identity provider by ID."""
        query = select(IdentityProvider).filter(
            IdentityProvider.id == provider_id,  # type: ignore[arg-type]
            IdentityProvider.deleted_at.is_(None),  # type: ignore[union-attr]
        )

        result = await self.session.exec(query)
        provider = result.one_or_none()

        if not provider:
            msg = f"Identity provider {provider_id} not found"
            raise IdentityProviderNotFoundError(msg)

        return IdentityProviderResponse.model_validate(provider)

    async def create_provider(self, provider_create: IdentityProviderCreate) -> IdentityProviderResponse:
        """Create a new identity provider."""
        # Encrypt client_secret before persisting
        if hasattr(provider_create.configuration, "client_secret") and provider_create.configuration.client_secret:
            provider_create.configuration.client_secret = encrypt_secret(provider_create.configuration.client_secret)

        provider = IdentityProvider(
            name=provider_create.name,
            description=provider_create.description,
            configuration=provider_create.configuration,
            enabled=True,
            created_by=self.user.id,
            updated_by=self.user.id,
        )

        self.session.add(provider)

        try:
            await self.session.flush()
            logger.info("Successfully created identity provider", provider_name=provider.name)
            return IdentityProviderResponse.model_validate(provider)

        except IntegrityError as e:
            await self._handle_integrity_error(e, provider_create.name)

    async def patch_provider(
        self, provider_id: UUID, provider_patch: IdentityProviderPatch
    ) -> IdentityProviderResponse:
        """Patch an identity provider."""
        query = select(IdentityProvider).filter(
            IdentityProvider.id == provider_id,  # type: ignore[arg-type]
            IdentityProvider.deleted_at.is_(None),  # type: ignore[union-attr]
        )

        result = await self.session.exec(query)
        provider = result.one_or_none()

        if not provider:
            msg = f"Identity provider {provider_id} not found"
            raise IdentityProviderNotFoundError(msg)

        provider_name = provider_patch.name if provider_patch.name is not None else provider.name

        if provider_patch.name is not None:
            provider.name = provider_patch.name

        if provider_patch.description is not None:
            provider.description = provider_patch.description

        if provider_patch.enabled is not None:
            provider.enabled = provider_patch.enabled

        if provider_patch.configuration is not None:
            # Preserve existing client_secret if not provided in patch
            if provider_patch.configuration.client_secret is None:
                provider_patch.configuration.client_secret = provider.configuration.client_secret
            else:
                # New secret provided — encrypt before persisting
                provider_patch.configuration.client_secret = encrypt_secret(provider_patch.configuration.client_secret)
            provider.configuration = provider_patch.configuration  # type: ignore[assignment]

        provider.updated_by = self.user.id
        provider.updated_at = datetime.now(UTC)

        try:
            await self.session.flush()
            return await self.get_provider(provider.id)

        except IntegrityError as e:
            await self._handle_integrity_error(e, provider_name)

    async def delete_provider(self, provider_id: UUID) -> None:
        """Soft delete an identity provider."""
        query = select(IdentityProvider).filter(
            IdentityProvider.id == provider_id,  # type: ignore[arg-type]
            IdentityProvider.deleted_at.is_(None),  # type: ignore[union-attr]
        )

        result = await self.session.exec(query)
        provider = result.one_or_none()

        if not provider:
            msg = f"Identity provider {provider_id} not found"
            raise IdentityProviderNotFoundError(msg)

        provider.deleted_at = datetime.now(UTC)
        provider.deleted_by = self.user.id
