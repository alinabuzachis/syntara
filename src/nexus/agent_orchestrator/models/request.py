"""Request schemas for invocation API endpoints.

Defines Pydantic models for API request validation with proper field aliasing
to support camelCase API contracts while maintaining snake_case internally.
"""

from enum import Enum

from pydantic import AliasChoices, Field
from sqlmodel import SQLModel


class CancellationResult(Enum):
    """Result enum for invocation cancellation operations."""

    SUCCESS = "success"
    NOT_FOUND = "not_found"
    NOT_CANCELLABLE = "not_cancellable"


class InvocationCreateRequest(SQLModel, populate_by_name=True):
    """Request schema for creating a new invocation.

    Supports multiple field name formats:
    - camelCase (API contract): sessionId, contextData
    - snake_case (internal): session_id, context_data

    Note: created_by is automatically set from authenticated user context.
    """

    prompt: str = Field(
        min_length=1,
        max_length=10000,
        description="Natural language request describing desired automation task",
    )

    session_id: str = Field(
        validation_alias=AliasChoices("sessionId", "session_id"),
        serialization_alias="sessionId",
        description="Session identifier for grouping related invocations",
    )

    context_data: dict[str, object] = Field(
        default_factory=dict,
        validation_alias=AliasChoices("contextData", "context_data"),
        serialization_alias="contextData",
        description="Optional additional context for the request",
    )


class InvocationCancelRequest(SQLModel, populate_by_name=True):
    """Request schema for cancelling an invocation.

    Supports multiple field name formats:
    - camelCase (API contract): reason
    - snake_case (internal): reason
    """

    reason: str = Field(
        default="User cancelled",
        max_length=500,
        description="Optional reason for cancellation",
    )


class InvocationCancelResponse(SQLModel, populate_by_name=True):
    """Response schema for invocation cancellation.

    Indicates whether the cancellation was successful or failed.
    """

    success: bool = Field(description="True if cancellation was successful, False otherwise")

    message: str = Field(description="Human-readable message describing the cancellation result")
