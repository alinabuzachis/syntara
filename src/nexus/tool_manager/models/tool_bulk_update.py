"""Tool bulk update request models."""

from typing import ClassVar
from uuid import UUID

from pydantic import ConfigDict, Field, field_validator
from sqlmodel import SQLModel

MAX_BULK_UPDATES: int = 50


class ToolBulkUpdate(SQLModel):
    """Request model for bulk updating tool status.

    Attributes:
        tool_ids: List of tool UUIDs to update (max 50)
        enabled: Enable or disable the Tool.

    """

    tool_ids: list[UUID] = Field(
        max_length=MAX_BULK_UPDATES, description=f"List of tool UUIDs to update (max {MAX_BULK_UPDATES})"
    )

    enabled: bool = Field(description="Enable/disable the Tool")

    @field_validator("tool_ids")
    @classmethod
    def validate_tool_ids(cls, v: list[UUID]) -> list[UUID]:
        """Validate tool_ids list is not empty and within limits."""
        if not v:
            msg = "tool_ids cannot be empty"
            raise ValueError(msg)
        if len(v) > MAX_BULK_UPDATES:
            msg = f"Cannot update more than {MAX_BULK_UPDATES} tools at once"
            raise ValueError(msg)
        return v

    model_config: ClassVar[ConfigDict] = ConfigDict(
        extra="forbid",  # Reject unknown fields
    )  # type: ignore[assignment]
