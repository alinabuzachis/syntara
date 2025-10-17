"""Pydantic schemas for invocation request/response validation."""

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class InvocationStatus(str, Enum):
    """Status enum for invocation lifecycle."""

    RUNNING = "running"
    PAUSED = "paused"
    CANCELLED = "cancelled"
    COMPLETED = "completed"
    FAILED = "failed"


class InvokeRequest(BaseModel):
    """Request model for POST /v1/invocations endpoint."""

    prompt: str = Field(
        ...,
        min_length=1,
        max_length=10000,
        description="Natural language request describing desired automation task",
    )
    user_id: str = Field(
        ...,
        description="User identifier for authentication and policy evaluation",
    )
    session_id: str = Field(
        ...,
        description="Session identifier for multi-tenant conversation isolation",
    )
    context: dict[str, Any] = Field(
        default_factory=dict,
        description="Optional additional context for the request",
    )
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Client-specific metadata for tracking and audit",
    )

    @field_validator("prompt")
    @classmethod
    def validate_prompt_not_empty(cls, value: str) -> str:
        """Validate prompt is not just whitespace.

        Args:
            value: Prompt string

        Returns:
            Validated prompt

        Raises:
            ValueError: If prompt is empty or whitespace

        """
        if not value.strip():
            error_msg = "Prompt cannot be empty or whitespace only"
            raise ValueError(error_msg)
        return value.strip()

    @field_validator("user_id")
    @classmethod
    def validate_user_id_not_empty(cls, value: str) -> str:
        """Validate user_id is not empty.

        Args:
            value: User ID string

        Returns:
            Validated user ID

        Raises:
            ValueError: If user_id is empty

        """
        if not value.strip():
            error_msg = "User ID cannot be empty"
            raise ValueError(error_msg)
        return value.strip()

    @field_validator("session_id")
    @classmethod
    def validate_session_id_not_empty(cls, value: str) -> str:
        """Validate session_id is not empty.

        Args:
            value: Session ID string

        Returns:
            Validated session ID

        Raises:
            ValueError: If session_id is empty

        """
        if not value.strip():
            error_msg = "Session ID cannot be empty"
            raise ValueError(error_msg)
        return value.strip()


class InvokeResponse(BaseModel):
    """Response model for POST /v1/invocations endpoint."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID = Field(
        ...,
        serialization_alias="invocation_id",
        description="Unique identifier for this invocation",
    )
    status: InvocationStatus = Field(
        ...,
        description="Current invocation status",
    )
    created_at: datetime = Field(
        ...,
        description="When invocation was created",
    )
    ws_url: str | None = Field(
        default=None,
        description="WebSocket URL for progress and results (future use)",
    )


class InvocationResponse(BaseModel):
    """Schema for full invocation details (for list/get endpoints)."""

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID = Field(serialization_alias="invocation_id")
    prompt: str
    user_id: str
    session_id: str
    status: InvocationStatus
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    updated_at: datetime
    context_data: dict[str, Any] = Field(default_factory=dict)
    result: dict[str, Any] | None = None
    error_message: str | None = None
    checkpoint_data: dict[str, Any] | None = None


class InvocationListResponse(BaseModel):
    """Response model for GET /v1/invocations endpoint."""

    model_config = ConfigDict(from_attributes=True)

    invocations: list[InvokeResponse] = Field(
        ...,
        description="List of invocations",
    )
    total: int = Field(
        ...,
        description="Total number of invocations matching filter",
    )
