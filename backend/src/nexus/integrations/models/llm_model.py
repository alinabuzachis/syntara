"""LLM Model storage for LLM provider integrations.

Stores models discovered from LLM providers. Mirrors the Tool pattern
used for MCP server integrations, but without soft deletion — models
that disappear from a provider are hard-deleted during refresh.
"""

from datetime import datetime
from typing import ClassVar
from uuid import UUID

from pydantic import ConfigDict, model_validator
from sqlalchemy import Index, UniqueConstraint
from sqlmodel import DateTime, Field, SQLModel

from nexus.core.constants import FieldLimits
from nexus.core.models.base import BaseListParams, BaseResource
from nexus.core.models.pagination import ResourcesResponse


class LLMModel(BaseResource, table=True):
    """An LLM model discovered from a provider integration."""

    __tablename__ = "llm_models"

    __filterable_fields__: ClassVar[list[str]] = [
        *BaseResource.__filterable_fields__,
        "enabled",
        "is_default",
        "integration_id",
        "model_id",
    ]

    __sortable_fields__: ClassVar[list[str]] = [
        *BaseResource.__sortable_fields__,
        "model_id",
        "name",
        "enabled",
    ]

    integration_id: UUID = Field(
        foreign_key="integrations.id",
        index=True,
        ondelete="CASCADE",
        description="Integration this model was discovered from",
    )

    model_id: str = Field(
        max_length=FieldLimits.NAME_MAX_LENGTH,
        description="Provider model identifier (e.g. gpt-4o, claude-opus-4-6)",
    )

    name: str = Field(
        max_length=FieldLimits.NAME_MAX_LENGTH,
        description="Human-readable display name",
    )

    description: str | None = Field(
        default=None,
        max_length=FieldLimits.DESCRIPTION_MAX_LENGTH,
        description="Model description from the provider",
    )

    enabled: bool = Field(default=True, index=True, description="Whether this model is enabled for use")

    is_default: bool = Field(default=False, description="Whether this is the default model for the integration")

    last_refreshed_at: datetime | None = Field(
        default=None,
        sa_type=DateTime(timezone=True),  # type: ignore[call-overload]
        description="Last time this model was synced from the provider",
    )

    __table_args__ = (
        UniqueConstraint("integration_id", "model_id", name="uq_llm_models_integration_model"),
        Index("ix_llm_models_integration_id_created_at_id", "integration_id", "created_at", "id"),
    )

    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid")


# ============================================================================
# API Request/Response Schemas
# ============================================================================


class LLMModelRead(SQLModel):
    """Schema for LLM model API responses."""

    id: UUID
    integration_id: UUID
    model_id: str
    name: str
    description: str | None = None
    enabled: bool = True
    is_default: bool = False
    last_refreshed_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class LLMModelUpdate(SQLModel):
    """Schema for updating an LLM model (enable/disable, set as default)."""

    enabled: bool | None = None
    is_default: bool | None = None

    @model_validator(mode="after")
    def require_at_least_one_field(self) -> "LLMModelUpdate":
        """Reject empty update payloads."""
        if self.enabled is None and self.is_default is None:
            msg = "At least one field must be provided"
            raise ValueError(msg)
        return self


_MAX_BULK_UPDATE_MODELS = 50


class LLMModelBulkUpdate(SQLModel):
    """Schema for bulk-updating LLM models."""

    model_ids: list[UUID] = Field(
        max_length=_MAX_BULK_UPDATE_MODELS,
        description=f"Model IDs to update (max {_MAX_BULK_UPDATE_MODELS})",
    )
    enabled: bool = Field(description="New enabled state")


class LLMModelBulkUpdateResponse(SQLModel):
    """Response for bulk LLM model update."""

    updated_count: int = Field(description="Number of models updated")
    skipped_count: int = Field(description="Number of model IDs not found in integration")


class LLMModelListParams(BaseListParams):
    """Query parameters for LLM model list endpoint."""

    sort: str | None = Field(
        default=None,
        description="Sort parameter (e.g., 'name', '-created_at')",
        schema_extra={"pattern": r"^-?[a-z][a-z0-9_]*$"},
    )


class LLMModelListResponse(ResourcesResponse[LLMModelRead]):
    """Paginated response for LLM models."""
