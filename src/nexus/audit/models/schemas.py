"""Structured data schemas for audit events."""

from typing import Any

from sqlmodel import Field, SQLModel


class BaseAuditData(SQLModel):
    """Base schema for all audit event structured data."""

    error_type: str | None = Field(default=None, description="Type of error if an error occurred")
    error_message: str | None = Field(default=None, description="Detailed error message if an error occurred")


class FunctionData(BaseAuditData):
    """Structured data for function decoration audit events."""

    function_args: dict[str, Any] | None = Field(default=None, description="Function arguments that were passed")
    function_result: Any = Field(default=None, description="Function return value or result")


class AuditContextData(BaseAuditData):
    """Structured data for general audit context operations."""

    # Additional context-specific fields can be added here
    # Context data is typically passed via **context_data in the context manager

    model_config = {"extra": "allow"}


class RequestCompletedData(BaseAuditData):
    """Structured data for HTTP request completion audit events from middleware."""

    method: str = Field(description="HTTP method of the request")
    path: str = Field(description="Normalized request path")
    status_code: int = Field(description="HTTP response status code")
    query_params: dict[str, Any] | None = Field(default=None, description="Parsed query parameters")
    user_role: str | None = Field(default=None, description="Authenticated user role if available")
