"""SQLModel schemas for context management.

Defines data models for context packages and related components.
"""

from typing import Any
from uuid import UUID, uuid4

from sqlmodel import Field, SQLModel


def generate_uuid() -> str:
    """Generate a UUID string."""
    return str(uuid4())


class ContextPackage(SQLModel):
    """Context package returned by the Context Manager.

    Represents the final assembled context with all metadata
    and grounding information for LLM consumption.
    """

    id: str = Field(
        default_factory=generate_uuid,
        description="Unique identifier for this context package",
    )
    correlation_id: str = Field(
        ...,
        index=True,
        description="Correlation identifier for distributed tracing and cross-service correlation",
    )
    invocation_id: UUID | None = Field(
        default=None,
        foreign_key="invocations.id",
        description="Foreign key reference to the agent invocation that requested this context",
    )
    payload: dict[str, Any] = Field(
        default_factory=dict,
        description="Assembled context sections and content",
    )
    grounding_score: float = Field(
        default=0.0,
        description="Score from 0-1 indicating the degree of factual accuracy and the reduction of hallucinations",
        ge=0.0,
        le=1.0,
    )
    citations: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Source citations for content traceability",
    )
    package_metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Additional metadata including timing, token counts, tenant info",
    )

    def __init__(self, **data: Any) -> None:  # noqa: ANN401
        """Initialize ContextPackage.

        Args:
            **data: Model field data

        """
        super().__init__(**data)
        # Initialize package_metadata if not provided
        if "package_metadata" not in data or not data["package_metadata"]:
            self.package_metadata = {}
