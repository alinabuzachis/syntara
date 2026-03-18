"""Metric types, models, and query parameters for the metrics subsystem.

This module defines:
- MetricType: Enum categorizing all metric types recorded by Nexus
- MetricRecord: Individual metric data point (extends BaseResource)
- MetricsQuery: Query parameters for the metrics REST API
- MetricsSummary: Summary response model for quick health checks
"""

from datetime import UTC, datetime
from enum import StrEnum
from typing import ClassVar
from uuid import UUID, uuid4

from pydantic import ConfigDict, field_validator
from sqlmodel import Field, SQLModel

from nexus.core.constants import ValidationMessages
from nexus.core.exceptions import SafeValueError
from nexus.core.models.base.query_params import BaseListParams


class MetricType(StrEnum):
    """Categories of metrics recorded by Nexus.

    Each value corresponds to a specific measurable quantity exposed via the
    metrics REST API and (where applicable) Prometheus endpoint.
    """

    # LLM Metrics (FR-005 to FR-010)
    LLM_DURATION = "llm_duration_ms"
    LLM_TOKENS_INPUT = "llm_tokens_input"
    LLM_TOKENS_OUTPUT = "llm_tokens_output"
    LLM_TTFT = "llm_ttft_ms"
    LLM_STATUS = "llm_status"

    # Cache Metrics (FR-011 to FR-013)
    CACHE_HIT = "cache_hit"
    CACHE_MISS = "cache_miss"
    CACHE_LOOKUP_DURATION = "cache_lookup_ms"
    CACHE_UTILIZATION = "cache_utilization_ratio"

    # Workflow Metrics (FR-014 to FR-017)
    WORKFLOW_DURATION = "workflow_duration_ms"
    WORKFLOW_STATUS = "workflow_status"
    ACTIVITY_DURATION = "activity_duration_ms"

    # Agent Metrics (FR-018 to FR-020)
    AGENT_ROUTING_DURATION = "agent_routing_ms"
    AGENT_INVOCATION_DURATION = "agent_invocation_ms"
    AGENT_STATUS = "agent_status"

    # System Overhead Metrics (FR-021 to FR-023)
    REQUEST_DURATION = "request_duration_ms"
    COMPONENT_DURATION = "component_duration_ms"

    # Error Metrics (FR-024 to FR-025)
    ERROR = "error"


class MetricsCategoryType(StrEnum):
    """Metric category names used to group :class:`MetricType` members."""

    LLM = "llm"
    CACHE = "cache"
    WORKFLOW = "workflow"
    AGENT = "agent"
    ERROR = "error"


METRIC_CATEGORIES: dict[MetricsCategoryType, list[MetricType]] = {
    MetricsCategoryType.LLM: [
        MetricType.LLM_DURATION,
        MetricType.LLM_TOKENS_INPUT,
        MetricType.LLM_TOKENS_OUTPUT,
        MetricType.LLM_TTFT,
        MetricType.LLM_STATUS,
    ],
    MetricsCategoryType.CACHE: [
        MetricType.CACHE_HIT,
        MetricType.CACHE_MISS,
        MetricType.CACHE_LOOKUP_DURATION,
        MetricType.CACHE_UTILIZATION,
    ],
    MetricsCategoryType.WORKFLOW: [
        MetricType.WORKFLOW_DURATION,
        MetricType.WORKFLOW_STATUS,
        MetricType.ACTIVITY_DURATION,
    ],
    MetricsCategoryType.AGENT: [
        MetricType.AGENT_ROUTING_DURATION,
        MetricType.AGENT_INVOCATION_DURATION,
        MetricType.AGENT_STATUS,
    ],
    MetricsCategoryType.ERROR: [
        MetricType.ERROR,
    ],
}


def _utc_now() -> datetime:
    """Generate UTC timestamp for field defaults."""
    return datetime.now(UTC)


class MetricRecord(SQLModel):
    """Individual metric data point.

    Mirrors the BaseResource field conventions (id, created_at, labels) but is
    stored in-memory rather than PostgreSQL.  Using SQLModel ensures consistent
    validation and serialization with the rest of the Nexus data layer.

    Attributes:
        id: Unique identifier for this metric record.
        created_at: UTC timestamp when the metric was recorded.
        labels: Key-value pairs for filtering and grouping.
        metric_type: Category of the metric.
        value: Numeric value (duration in ms, count, ratio, etc.).
        unit: Unit of measurement (ms, count, ratio, tokens).

    """

    id: UUID = Field(
        default_factory=uuid4,
        description="Unique identifier for the metric record",
    )

    created_at: datetime = Field(
        default_factory=_utc_now,
        description="UTC timestamp when metric was recorded",
    )

    labels: dict[str, str] = Field(
        default_factory=dict,
        description="Key-value pairs for filtering and grouping",
    )

    metric_type: MetricType = Field(
        ...,
        description="Type/category of metric",
    )

    value: float = Field(
        ...,
        description="Metric value (e.g., duration in ms, count)",
    )

    unit: str = Field(
        default="",
        description="Unit of measurement (ms, count, ratio, tokens)",
    )

    @field_validator("labels", mode="before")
    @classmethod
    def validate_labels(cls, v: dict[str, str] | None) -> dict[str, str]:
        """Validate that labels dictionary contains only string values."""
        if v is None:
            return {}

        if not isinstance(v, dict):
            raise SafeValueError(ValidationMessages.LABELS_MUST_BE_DICT)

        for key, value in v.items():
            if not isinstance(key, str):
                msg = ValidationMessages.LABELS_KEY_MUST_BE_STRING.format(key=key, type_name=type(key).__name__)  # type: ignore[unreachable]
                raise SafeValueError(msg)
            if not isinstance(value, str):
                msg = ValidationMessages.LABELS_VALUE_MUST_BE_STRING.format(key=key, type_name=type(value).__name__)  # type: ignore[unreachable]
                raise SafeValueError(msg)

        return v

    model_config: ClassVar[ConfigDict] = ConfigDict(
        from_attributes=True,
        validate_by_name=True,
        validate_assignment=True,
        extra="forbid",
    )  # type: ignore[assignment]


class MetricsQuery(BaseListParams):
    """Query parameters for the metrics REST API with cursor-based pagination.

    Extends BaseListParams to inherit standard pagination parameters
    (limit, cursor, sort, include_total) and adds metrics-specific filters.
    """

    category: MetricsCategoryType | None = Field(
        default=None,
        description="Filter by metric category",
    )

    start_time: datetime | None = Field(
        default=None,
        description="Start of time range (ISO 8601)",
    )

    end_time: datetime | None = Field(
        default=None,
        description="End of time range (ISO 8601)",
    )


class MetricsSummary(SQLModel):
    """Quick summary of metric counts for the /api/v1/metrics/summary endpoint."""

    total_requests: int = Field(default=0, description="Total requests recorded")
    total_errors: int = Field(default=0, description="Total errors recorded")
    cache_hits: int = Field(default=0, description="Cache hit count")
    cache_misses: int = Field(default=0, description="Cache miss count")
    llm_calls: int = Field(default=0, description="Total LLM API calls")
    total_workflows: int = Field(default=0, description="Total workflow executions started")
    active_workflows: int = Field(default=0, description="Currently active workflows")
    period_start: datetime = Field(..., description="Start of metrics retention period")
    period_end: datetime = Field(..., description="End of metrics period (now)")

    @property
    def cache_hit_rate(self) -> float:
        """Calculate cache hit rate (0.0 to 1.0)."""
        total = self.cache_hits + self.cache_misses
        return self.cache_hits / total if total > 0 else 0.0

    @property
    def error_rate(self) -> float:
        """Calculate error rate (0.0 to 1.0)."""
        return self.total_errors / self.total_requests if self.total_requests > 0 else 0.0
