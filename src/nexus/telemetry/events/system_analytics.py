"""Periodic system analytics event and query result models.

All models are stateless snapshots of current database state.
Sent to Segment at fixed intervals by the PeriodicCollector.
"""

from pydantic import Field
from sqlmodel import SQLModel

from nexus.telemetry.events.base import BaseTelemetryEvent


class WorkflowCounts(SQLModel):
    """Current workflow counts from database."""

    total: int = Field(default=0, description="Total workflows")
    enabled: int = Field(default=0, description="Enabled workflows")
    disabled: int = Field(default=0, description="Disabled workflows")


class ExecutionCounts(SQLModel):
    """Current execution counts from database."""

    total: int = Field(default=0, description="Total executions")
    completed: int = Field(default=0, description="Completed executions")
    failed: int = Field(default=0, description="Failed executions")
    cancelled: int = Field(default=0, description="Cancelled executions")
    running: int = Field(default=0, description="Currently running executions")
    pending: int = Field(default=0, description="Pending executions")
    paused: int = Field(default=0, description="Paused executions")
    avg_duration_seconds: float = Field(
        default=0.0,
        description="Average execution duration in seconds",
    )


class CredentialCounts(SQLModel):
    """Aggregated tool provider counts from database."""

    total: int = Field(default=0, description="Total tool providers configured")


class ModelUsage(SQLModel):
    """Aggregated token usage for a single LLM model."""

    model: str = Field(description="LLM model name")
    total_prompt_tokens: int = Field(default=0, description="Total prompt tokens")
    total_completion_tokens: int = Field(default=0, description="Total completion tokens")
    total_tokens: int = Field(default=0, description="Total tokens (prompt + completion)")
    invocation_count: int = Field(default=0, description="Number of invocations")


class ConfigInfo(SQLModel):
    """Configuration information for analytics."""

    feature_flags_enabled: list[str] = Field(
        default_factory=list,
        description="List of enabled feature flags",
    )


class SystemAnalyticsEvent(BaseTelemetryEvent):
    """Stateless system analytics event sent to Segment.

    Extends BaseTelemetryEvent for consistency with all other telemetry events.

    Each event is a self-contained snapshot of current DB state.
    No delta tracking or "since last report" logic.
    Timestamp is set automatically by the Segment SDK.
    """

    workflows: WorkflowCounts = Field(..., description="Workflow aggregates")
    credentials: CredentialCounts = Field(..., description="Credential aggregates")
    executions: ExecutionCounts = Field(..., description="Execution aggregates")
    config: ConfigInfo = Field(..., description="Configuration info")
    model_usage: list[ModelUsage] = Field(
        default_factory=list,
        description="Aggregated token usage per LLM model",
    )
