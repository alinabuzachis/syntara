"""Tool metrics summary models."""

from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass
class ToolMetricsSummary:
    """Summary of tool usage metrics.

    Attributes:
        total_executions: Total number of tool executions
        success_count: Number of successful executions
        failure_count: Number of failed executions
        avg_duration_ms: Average execution duration in milliseconds
        p95_duration_ms: 95th percentile execution duration in milliseconds
        time_window: Time window for the metrics (hour/day/week/month)
        generated_at: Timestamp when metrics were generated

    """

    total_executions: int
    success_count: int
    failure_count: int
    avg_duration_ms: int
    p95_duration_ms: int
    time_window: str
    generated_at: datetime

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            "total_executions": self.total_executions,
            "success_count": self.success_count,
            "failure_count": self.failure_count,
            "avg_duration_ms": self.avg_duration_ms,
            "p95_duration_ms": self.p95_duration_ms,
            "time_window": self.time_window,
            "generated_at": self.generated_at.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ToolMetricsSummary":
        """Create instance from dictionary."""
        return cls(
            total_executions=data["total_executions"],
            success_count=data["success_count"],
            failure_count=data["failure_count"],
            avg_duration_ms=data["avg_duration_ms"],
            p95_duration_ms=data["p95_duration_ms"],
            time_window=data["time_window"],
            generated_at=datetime.fromisoformat(data["generated_at"]),
        )
