"""Error response SQLModel definition.

This module contains the Error SQLModel class for standardized error responses.
"""

from typing import ClassVar

from pydantic import ConfigDict
from sqlmodel import Field, SQLModel

from nexus.core.constants import FieldLimits


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
