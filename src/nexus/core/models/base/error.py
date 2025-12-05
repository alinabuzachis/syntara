"""Error response SQLModel definition.

This module contains the Error SQLModel class for standardized error responses,
and ErrorData for RFC 9457 Problem Details format used in streaming events.
"""

from typing import Any, ClassVar

from pydantic import ConfigDict
from pydantic import Field as PydanticField
from sqlmodel import Field, SQLModel

from nexus.core.constants import FieldLimits

# Example invocation path used in error response examples
_EXAMPLE_INVOCATION_PATH = "/invocations/550e8400-e29b-41d4-a716-446655440000"


class Error(SQLModel):
    """Standardized error response SQLModel.

    This model defines the structure for all error responses across the API,
    providing consistent error information to clients.

    Attributes:
        error: Error category/code in snake_case format (required)
        message: Human-readable error message (required, max 500 chars)
        details: Optional additional error details or context (max 2000 chars)

    """

    error: str = Field(
        description="Error category/code in snake_case format",
        min_length=1,
        max_length=FieldLimits.ERROR_CODE_MAX_LENGTH,
    )

    message: str = Field(
        description="Human-readable error message", min_length=1, max_length=FieldLimits.ERROR_MESSAGE_MAX_LENGTH
    )

    details: str | None = Field(
        default=None, max_length=FieldLimits.DESCRIPTION_MAX_LENGTH, description="Additional error details or context"
    )

    model_config: ClassVar[ConfigDict] = ConfigDict(
        from_attributes=True,
        validate_by_name=True,
        json_schema_extra={
            "examples": [
                {
                    "error": "validation_error",
                    "message": "The request is invalid",
                    "details": "Field 'name' is required",
                },
                {
                    "error": "not_found",
                    "message": "Resource not found",
                    "details": "No resource exists with id '550e8400-e29b-41d4-a716-446655440000'",
                },
                {"error": "internal_error", "message": "An unexpected error occurred", "details": None},
            ]
        },
    )  # type: ignore[assignment]


class ErrorData(SQLModel):
    """RFC 9457 Problem Details format for error event data.

    This model is used for streaming error events and follows the RFC 9457
    Problem Details specification. It provides machine-readable and human-readable
    error information with consistent structure.

    Will eventually replace the Error class above which does not conform to RFC 9457.

    Attributes:
        type: URI reference identifying the problem type
        title: Short, human-readable summary of the problem
        detail: Human-readable explanation specific to this occurrence
        code: Machine-readable error code for programmatic handling
        retryable: Whether this error can be retried by creating a new invocation
        instance: Optional URI reference identifying the specific occurrence

    """

    type: str = PydanticField(
        description="URI reference identifying the problem type",
        min_length=1,
        max_length=500,
        examples=["https://api.nexus.com/errors/llm-error"],
    )

    title: str = PydanticField(
        description="Short, human-readable summary of the problem",
        min_length=1,
        max_length=200,
        examples=["LLM Service Unavailable"],
    )

    detail: str = PydanticField(
        description="Human-readable explanation specific to this occurrence",
        min_length=1,
        max_length=FieldLimits.DESCRIPTION_MAX_LENGTH,
        examples=["OpenRouter API returned error: rate limit exceeded. Please try again in a few moments."],
    )

    code: str = PydanticField(
        description="Machine-readable error code for programmatic handling",
        min_length=1,
        max_length=100,
        examples=["RATE_LIMIT_EXCEEDED"],
    )

    retryable: bool = PydanticField(
        description="Whether this error can be retried by creating a new invocation",
        examples=[True],
    )

    instance: str | None = PydanticField(
        default=None,
        max_length=500,
        description="Optional URI reference identifying the specific occurrence",
        examples=[_EXAMPLE_INVOCATION_PATH],
    )

    model_config: ClassVar[ConfigDict] = ConfigDict(
        from_attributes=True,
        validate_by_name=True,
        json_schema_extra={
            "examples": [
                {
                    "type": "https://api.nexus.com/errors/llm-error",
                    "title": "LLM Rate Limit Exceeded",
                    "detail": "OpenRouter API rate limit exceeded. Please try again in a few moments.",
                    "code": "RATE_LIMIT_EXCEEDED",
                    "retryable": True,
                    "instance": _EXAMPLE_INVOCATION_PATH,
                },
                {
                    "type": "https://api.nexus.com/errors/timeout-error",
                    "title": "Streaming Timeout",
                    "detail": "LLM streaming timed out after 30 seconds",
                    "code": "STREAM_TIMEOUT",
                    "retryable": True,
                    "instance": _EXAMPLE_INVOCATION_PATH,
                },
            ]
        },
    )  # type: ignore[assignment]

    def to_dict(self) -> dict[str, Any]:
        """Convert ErrorData to dictionary for API/WebSocket response body.

        Returns:
            Dict representation with all fields, excluding None values

        """
        return self.model_dump(exclude_none=True)
