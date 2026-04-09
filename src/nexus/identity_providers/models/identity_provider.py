"""IdentityProvider SQLModel definition for database storage.

This module contains the IdentityProvider SQLModel class that extends the Resource base class
with identity provider specific fields as defined in the OpenAPI specification.
"""

from typing import ClassVar

from pydantic import ConfigDict
from sqlalchemy import Index, String, text
from sqlmodel import Field, SQLModel

from nexus.core.constants import FieldLimits
from nexus.core.models.base import Resource
from nexus.core.models.pagination import ResourcesResponse
from nexus.core.utils.sqlmodel import DiscriminatedJSONB
from nexus.identity_providers.models.identity_provider_configuration import (
    IdentityProviderConfiguration,
    IdentityProviderConfigurationPatch,
    IdentityProviderConfigurationResponseTypes,
    IdentityProviderConfigurationTypes,
)


class IdentityProviderBase(Resource):
    """IdentityProvider base model.

    Represents an external identity provider for authentication.
    Extends the Resource base class with provider-specific fields.
    """

    name: str = Field(
        min_length=1,
        max_length=FieldLimits.NAME_MAX_LENGTH,
        sa_type=String(FieldLimits.NAME_MAX_LENGTH),  # type: ignore[call-overload]
        description="Human-readable provider name",
        index=True,
    )

    enabled: bool = Field(default=True, description="Enable/disable the identity provider", index=True)


class IdentityProvider(IdentityProviderBase, table=True):
    """IdentityProvider database model."""

    __tablename__ = "identity_providers"

    __filterable_fields__: ClassVar[list[str]] = [
        *Resource.__filterable_fields__,
        "enabled",
        "provider_type",
        "configuration.provider_type",
    ]

    __sortable_fields__: ClassVar[list[str]] = [
        *Resource.__sortable_fields__,
        "enabled",
    ]

    configuration: IdentityProviderConfigurationTypes = Field(
        sa_type=DiscriminatedJSONB(IdentityProviderConfiguration),  # type: ignore[call-overload]
        description="Provider-specific configuration",
    )

    __table_args__ = (
        Index(
            "ix_identity_providers_name_unique",
            "name",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index("ix_identity_providers_created_at_id", "created_at", "id"),
    )


# ============================================================================
# API Request/Response Schemas
# ============================================================================


class IdentityProviderResponse(IdentityProviderBase):
    """Schema for IdentityProvider response with configuration details (excludes secrets)."""

    configuration: IdentityProviderConfigurationResponseTypes = Field(
        ..., description="Identity provider configuration"
    )


class IdentityProviderCreate(SQLModel):
    """Schema for creating a new identity provider."""

    name: str = Field(
        min_length=1, max_length=FieldLimits.NAME_MAX_LENGTH, description="Human-readable name for the provider"
    )

    description: str | None = Field(
        default=None, max_length=FieldLimits.DESCRIPTION_MAX_LENGTH, description="Detailed description of the provider"
    )

    configuration: IdentityProviderConfiguration = Field(
        description="Provider configuration", discriminator="provider_type"
    )


class IdentityProviderPatch(SQLModel):
    """Schema for partially updating an identity provider."""

    name: str | None = Field(
        default=None,
        min_length=1,
        max_length=FieldLimits.NAME_MAX_LENGTH,
        description="Human-readable name for the provider",
    )

    description: str | None = Field(
        default=None,
        max_length=FieldLimits.DESCRIPTION_MAX_LENGTH,
        description="Detailed description of the provider",
    )

    configuration: IdentityProviderConfigurationPatch | None = Field(
        default=None,
        description="Provider-specific configuration (client_secret optional — preserves existing if omitted)",
        discriminator="provider_type",
    )

    enabled: bool | None = Field(default=None, description="Enable/disable the provider")

    model_config: ClassVar[ConfigDict] = ConfigDict(
        extra="forbid",
    )  # type: ignore[assignment]


# ============================================================================
# List Response Type Alias
# ============================================================================

IdentityProviderListResponse = ResourcesResponse[IdentityProviderResponse]
