"""Integration SQLModel definitions.

This module contains the Integration model and associated schemas.
An Integration represents an external service connection (MCP server,
LLM provider, or AAP Gateway) that workflows can use.
"""

from datetime import datetime
from enum import StrEnum
from typing import ClassVar
from uuid import UUID, uuid4

from pydantic import ConfigDict, model_validator
from sqlalchemy import Index, Text, UniqueConstraint, text
from sqlmodel import DateTime, Field, SQLModel

from nexus.core.constants import FieldLimits
from nexus.core.models.base import Resource
from nexus.core.models.pagination import ResourcesResponse
from nexus.core.utils.sqlmodel import DiscriminatedJSONB, postgres_enum_column
from nexus.integrations.models.integration_configuration import (
    IntegrationConfiguration,
    IntegrationConfigurationInputTypes,
    IntegrationConfigurationTypes,
)

_ENABLED_DESCRIPTION = "Whether the integration is active"
_CONFIGURATION_DESCRIPTION = "Integration-specific configuration"


class IntegrationType(StrEnum):
    """Type of external integration."""

    MCP_SERVER = "mcp_server"
    LLM_PROVIDER = "llm_provider"
    AAP_GATEWAY = "aap_gateway"


class IntegrationStatus(StrEnum):
    """Current status of an integration."""

    VALIDATING = "validating"
    AVAILABLE = "available"
    ERROR = "error"


class IntegrationScope(StrEnum):
    """Visibility scope of an integration."""

    GLOBAL = "global"
    PROJECT = "project"


class Integration(Resource, table=True):
    """Integration database model.

    Represents an external service connection that workflows can use.
    Inherits from Resource which provides: id, name, description,
    created_at, updated_at, labels, created_by, updated_by,
    deleted_at, deleted_by.
    """

    __tablename__ = "integrations"

    integration_type: IntegrationType = Field(
        sa_column=postgres_enum_column(
            IntegrationType,
            "integration_type",
            index=True,
        ),
        description="Type of external integration",
    )

    enabled: bool = Field(default=True, description=_ENABLED_DESCRIPTION, index=True)

    status: IntegrationStatus = Field(
        default=IntegrationStatus.VALIDATING,
        sa_column=postgres_enum_column(
            IntegrationStatus,
            "integration_status",
        ),
        description="Current status of the integration",
    )

    scope: IntegrationScope = Field(
        default=IntegrationScope.GLOBAL,
        sa_column=postgres_enum_column(
            IntegrationScope,
            "integration_scope",
            index=True,
        ),
        description="Visibility scope: global (all projects) or project (assigned projects only)",
    )

    configuration: IntegrationConfigurationTypes = Field(
        sa_type=DiscriminatedJSONB(IntegrationConfiguration),  # type: ignore[arg-type,call-overload]
        description=_CONFIGURATION_DESCRIPTION,
    )

    management_credential_id: UUID | None = Field(
        default=None,
        foreign_key="credentials.id",
        ondelete="SET NULL",
        description="Optional credential for admin operations (validation, tool/model discovery)",
    )

    last_validated_at: datetime | None = Field(
        default=None,
        description="Timestamp of last validation check",
        sa_type=DateTime(timezone=True),  # type: ignore[call-overload]
    )

    validation_error: str | None = Field(
        default=None,
        sa_type=Text(),  # type: ignore[call-overload]
        description="Error message from last validation attempt",
    )

    __filterable_fields__: ClassVar[list[str]] = [
        *Resource.__filterable_fields__,
        "integration_type",
        "status",
        "enabled",
        "scope",
        "management_credential_id",
    ]

    __sortable_fields__: ClassVar[list[str]] = [
        *Resource.__sortable_fields__,
        "status",
        "enabled",
    ]

    __table_args__ = (
        Index(
            "ix_integrations_name_unique",
            "name",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index("ix_integrations_created_at_id", "created_at", "id"),
        Index("ix_integrations_labels", "labels", postgresql_using="gin"),
    )


class IntegrationProjectAssignment(SQLModel, table=True):
    """Junction table mapping project-scoped integrations to projects.

    Only used when Integration.scope == "project". Global integrations
    have no rows in this table and are available to all projects.
    """

    __tablename__ = "integration_project_assignments"

    id: UUID = Field(default_factory=uuid4, primary_key=True)

    integration_id: UUID = Field(
        foreign_key="integrations.id",
        ondelete="CASCADE",
        index=True,
    )

    project_id: UUID = Field(
        foreign_key="projects.id",
        ondelete="CASCADE",
        index=True,
    )

    created_at: datetime = Field(
        sa_type=DateTime(timezone=True),  # type: ignore[call-overload]
        sa_column_kwargs={"server_default": text("now()")},
    )

    __table_args__ = (UniqueConstraint("integration_id", "project_id", name="uq_integration_project"),)


# ============================================================================
# API Request/Response Schemas
# ============================================================================


class IntegrationCreate(SQLModel):
    """Schema for creating a new integration."""

    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")  # type: ignore[assignment]

    name: str = Field(
        min_length=1,
        max_length=FieldLimits.NAME_MAX_LENGTH,
        description="Human-readable name for the integration",
    )

    description: str | None = Field(
        default=None,
        max_length=FieldLimits.DESCRIPTION_MAX_LENGTH,
        description="Detailed description of the integration",
    )

    integration_type: IntegrationType = Field(description="Type of external integration")

    configuration: IntegrationConfigurationInputTypes = Field(
        description=_CONFIGURATION_DESCRIPTION,
        discriminator="integration_type",
    )

    management_credential_id: UUID | None = Field(
        default=None,
        description="Optional credential for admin operations",
    )

    enabled: bool = Field(default=True, description=_ENABLED_DESCRIPTION)

    scope: IntegrationScope = Field(
        default=IntegrationScope.GLOBAL,
        description="Visibility scope: global or project",
    )

    labels: dict[str, str] = Field(default_factory=dict, description="Key-value labels")

    @model_validator(mode="after")
    def validate_type_matches_configuration(self) -> "IntegrationCreate":
        """Ensure integration_type and configuration.integration_type agree."""
        if self.configuration.integration_type != self.integration_type.value:
            msg = (
                f"integration_type '{self.integration_type.value}' does not match "
                f"configuration.integration_type '{self.configuration.integration_type}'"
            )
            raise ValueError(msg)
        return self


class IntegrationRead(Resource):
    """Schema for integration API responses."""

    integration_type: IntegrationType
    enabled: bool = True
    status: IntegrationStatus = IntegrationStatus.VALIDATING
    scope: IntegrationScope = IntegrationScope.GLOBAL
    configuration: IntegrationConfigurationTypes = Field(
        description=_CONFIGURATION_DESCRIPTION, discriminator="integration_type"
    )
    management_credential_id: UUID | None = None
    last_validated_at: datetime | None = None
    validation_error: str | None = None


class IntegrationPatch(SQLModel):
    """Schema for partially updating an integration (user-facing)."""

    name: str | None = Field(
        default=None,
        min_length=1,
        max_length=FieldLimits.NAME_MAX_LENGTH,
        description="Human-readable name for the integration",
    )

    description: str | None = Field(
        default=None,
        max_length=FieldLimits.DESCRIPTION_MAX_LENGTH,
        description="Detailed description of the integration",
    )

    configuration: IntegrationConfigurationInputTypes | None = Field(
        default=None,
        description=_CONFIGURATION_DESCRIPTION,
        discriminator="integration_type",
    )

    management_credential_id: UUID | None = Field(default=None, description="Optional credential for admin operations")

    enabled: bool | None = Field(default=None, description=_ENABLED_DESCRIPTION)

    scope: IntegrationScope | None = Field(default=None, description="Visibility scope: global or project")

    labels: dict[str, str] | None = Field(default=None, description="Key-value labels")

    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")  # type: ignore[assignment]


class IntegrationSystemUpdate(SQLModel):
    """Internal schema for validation worker updates to system-managed fields."""

    status: IntegrationStatus | None = Field(default=None, description="Current status of the integration")

    validation_error: str | None = Field(default=None, description="Error message from last validation attempt")


class IntegrationTestConnection(SQLModel):
    """Schema for testing a connection without saving an integration."""

    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")  # type: ignore[assignment]

    integration_type: IntegrationType = Field(description="Type of external integration")

    configuration: IntegrationConfigurationInputTypes = Field(
        description=_CONFIGURATION_DESCRIPTION,
        discriminator="integration_type",
    )

    credential_id: UUID = Field(description="Credential to use for the connection test")

    @model_validator(mode="after")
    def validate_type_matches_configuration(self) -> "IntegrationTestConnection":
        """Ensure integration_type and configuration.integration_type agree."""
        if self.configuration.integration_type != self.integration_type.value:
            msg = (
                f"integration_type '{self.integration_type.value}' does not match "
                f"configuration.integration_type '{self.configuration.integration_type}'"
            )
            raise ValueError(msg)
        return self


class IntegrationListResponse(ResourcesResponse[IntegrationRead]):
    """Paginated list response for integrations."""
