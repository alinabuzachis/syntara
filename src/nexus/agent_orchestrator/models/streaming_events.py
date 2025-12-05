"""Streaming event data models.

This module contains typed models for streaming event data payloads,
conforming to the AsyncAPI specification for WebSocket events.
"""

from typing import Any, ClassVar

from pydantic import ConfigDict, Field
from sqlmodel import SQLModel


class DeltaEventData(SQLModel):
    """Data payload for delta streaming events.

    Represents individual content chunks delivered during LLM response generation.

    Attributes:
        delta: The actual delta content chunk

    """

    delta: str = Field(
        description="The actual delta content chunk",
        min_length=1,
        examples=["Hello", " world", "!"],
    )

    model_config: ClassVar[ConfigDict] = ConfigDict(
        from_attributes=True,
        validate_by_name=True,
        json_schema_extra={
            "examples": [
                {"delta": "Hello"},
                {"delta": " world"},
                {"delta": "!"},
            ]
        },
    )  # type: ignore[assignment]

    def to_dict(self) -> dict[str, Any]:
        """Convert DeltaEventData to dictionary for API/WebSocket response body.

        Returns:
            Dict representation with all fields

        """
        return self.model_dump()


class CancelledEventData(SQLModel):
    """Data payload for streaming cancellation events.

    Indicates that streaming was cancelled before completion.

    Attributes:
        reason: Why the streaming was cancelled

    """

    reason: str = Field(
        description="Why the streaming was cancelled",
        min_length=1,
        max_length=200,
        examples=["user_cancelled", "timeout", "server_shutdown", "llm_error"],
    )

    model_config: ClassVar[ConfigDict] = ConfigDict(
        from_attributes=True,
        validate_by_name=True,
        json_schema_extra={
            "examples": [
                {"reason": "user_cancelled"},
                {"reason": "timeout"},
                {"reason": "server_shutdown"},
                {"reason": "llm_error"},
            ]
        },
    )  # type: ignore[assignment]

    def to_dict(self) -> dict[str, Any]:
        """Convert CancelledEventData to dictionary for API/WebSocket response body.

        Returns:
            Dict representation with all fields

        """
        return self.model_dump()


class CompletionEventData(SQLModel):
    """Data payload for streaming completion events.

    Empty object - the event_type itself indicates successful completion.
    Defined as a class for consistency and type safety.

    """

    model_config: ClassVar[ConfigDict] = ConfigDict(
        from_attributes=True,
        validate_by_name=True,
        json_schema_extra={
            "examples": [
                {},
            ]
        },
    )  # type: ignore[assignment]

    def to_dict(self) -> dict[str, Any]:
        """Convert CompletionEventData to dictionary for API/WebSocket response body.

        Returns:
            Empty dict as per spec

        """
        return {}
