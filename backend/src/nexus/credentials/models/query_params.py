"""Query parameter models for credential list endpoints."""

from uuid import UUID

from sqlmodel import Field

from nexus.core.models.base import BaseListParams


class CredentialListParams(BaseListParams):
    """Query parameters for listing credentials."""

    credential_type_id: UUID | None = Field(default=None, description="Filter by credential type ID")
    enabled: bool | None = Field(default=None, description="Filter by enabled status")
