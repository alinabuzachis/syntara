"""WebhookTrigger SQLModel for webhook trigger registration and lookup.

This module provides the WebhookTrigger table model for the operational lookup table
that maps webhook paths to workflows and stores JSON schemas for payload validation.

The webhook trigger configuration (webhook_path, input_schema) is the source of truth
in the workflow definition JSONB. This table is a derived index for fast lookup and
stores operational data (enabled state) not present in the definition.
"""

from datetime import datetime
from typing import Any, ClassVar
from uuid import UUID

from pydantic import ConfigDict
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, Index, SQLModel

from nexus.core.constants import WebhookLimits
from nexus.core.models.base import BaseResource


class WebhookTrigger(BaseResource, table=True):
    """Webhook trigger lookup table for routing incoming webhooks to workflows.

    This table is auto-synced from workflow definitions. When a workflow contains
    a webhook_trigger node, a corresponding row is created/updated here. The row
    is deleted when the workflow is deleted or the trigger node is removed.

    Attributes:
        id: Primary key UUID (from BaseResource)
        webhook_path: Unique URL slug for the webhook endpoint
        workflow_id: FK to the workflow that owns this trigger
        trigger_node_id: The node ID within the workflow definition
        input_schema: Optional JSON Schema (Draft-07) for payload validation
        is_enabled: Whether this webhook trigger is active
        created_at: Timestamp of creation (from BaseResource)
        updated_at: Timestamp of last update (from BaseResource)

    """

    __tablename__ = "webhook_triggers"

    __filterable_fields__: ClassVar[list[str]] = [
        *BaseResource.__filterable_fields__,
        "webhook_path",
        "workflow_id",
        "is_enabled",
    ]

    __sortable_fields__: ClassVar[list[str]] = [
        *BaseResource.__sortable_fields__,
    ]

    # Webhook endpoint configuration
    webhook_path: str = Field(
        max_length=WebhookLimits.PATH_MAX_LENGTH,
        description="Unique URL slug for the webhook endpoint",
    )

    # Workflow association
    workflow_id: UUID = Field(
        foreign_key="workflows.id",
        ondelete="CASCADE",
        description="FK to the workflow that owns this trigger",
        index=True,
    )

    trigger_node_id: str = Field(
        max_length=255,
        description="The node ID within the workflow definition",
    )

    # Optional payload validation schema
    input_schema: dict[str, Any] | None = Field(
        default=None,
        sa_type=JSONB,
        description="Optional JSON Schema (Draft-07) for payload validation",
    )

    # Operational state
    is_enabled: bool = Field(
        default=True,
        description="Whether this webhook trigger is active",
        index=True,
    )

    # Table arguments for indexes and constraints
    __table_args__ = (
        # Unique index on webhook_path (each path maps to exactly one trigger)
        Index("ix_webhook_triggers_webhook_path_unique", "webhook_path", unique=True),
        # Composite index for workflow lookup
        Index("ix_webhook_triggers_workflow_id_enabled", "workflow_id", "is_enabled"),
        # GIN index on labels for JSONB containment queries
        Index(
            "ix_webhook_triggers_labels",
            "labels",
            postgresql_using="gin",
        ),
    )

    def __repr__(self) -> str:
        """Return string representation of WebhookTrigger."""
        return (
            f"<WebhookTrigger(id={self.id}, webhook_path={self.webhook_path}, "
            f"workflow_id={self.workflow_id}, trigger_node_id={self.trigger_node_id})>"
        )


# ============================================================================
# API Response Schemas (Pattern 1: Separate models with table=False)
# ============================================================================


class WebhookTriggerRead(SQLModel):
    """Schema for webhook trigger response.

    Used when returning webhook trigger data in API responses.
    """

    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)  # type: ignore[assignment]

    id: UUID
    webhook_path: str
    workflow_id: UUID
    trigger_node_id: str
    input_schema: dict[str, Any] | None = None
    is_enabled: bool
    created_at: datetime
    updated_at: datetime
