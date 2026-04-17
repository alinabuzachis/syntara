"""Structured data schemas for audit events."""

from typing import Annotated, Any, Literal

from pydantic import Field as PydanticField
from sqlmodel import Field, SQLModel


class BaseAuditData(SQLModel):
    """Base schema for audit event structured data with no additional fields."""

    data_type: Literal["base"] = Field(default="base", description="Discriminator for the structured data variant")
    error_type: str | None = Field(default=None, description="Type of error if an error occurred")
    error_message: str | None = Field(default=None, description="Detailed error message if an error occurred")


class FunctionData(BaseAuditData):
    """Structured data for function decoration audit events."""

    data_type: Literal["function"] = Field(  # type: ignore[assignment]
        default="function", description="Discriminator for the structured data variant"
    )
    function_args: dict[str, Any] | None = Field(default=None, description="Function arguments that were passed")
    function_result: Any = Field(default=None, description="Function return value or result")


class AuditContextData(BaseAuditData):
    """Structured data for general audit context operations.

    Accepts arbitrary extra fields via ``extra="allow"`` so callers may pass ad-hoc
    context through ``**context_data`` in the context manager.
    """

    data_type: Literal["context"] = Field(  # type: ignore[assignment]
        default="context", description="Discriminator for the structured data variant"
    )

    model_config = {"extra": "allow"}


class RequestCompletedData(BaseAuditData):
    """Structured data for HTTP request completion audit events from middleware."""

    data_type: Literal["request_completed"] = Field(  # type: ignore[assignment]
        default="request_completed", description="Discriminator for the structured data variant"
    )
    method: str = Field(description="HTTP method of the request")
    path: str = Field(description="Normalized request path")
    status_code: int = Field(description="HTTP response status code")
    query_params: dict[str, Any] | None = Field(default=None, description="Parsed query parameters")
    user_role: str | None = Field(default=None, description="Authenticated user role if available")


# Raw union of all audit data variants (used as a Python type hint on SQLModel
# table fields, where ``Annotated[..., Field(discriminator=...)]`` conflicts with
# SQLModel's own Field inspection).
AuditDataTypes = FunctionData | AuditContextData | RequestCompletedData | BaseAuditData

# Discriminated union (used for Pydantic validation on non-table models and for
# the ``DiscriminatedJSONB`` TypeAdapter on the persistence layer).
AuditDataUnion = Annotated[AuditDataTypes, PydanticField(discriminator="data_type")]
