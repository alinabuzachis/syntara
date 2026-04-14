"""Unit tests for SystemAnalyticsEvent."""

from typing import Any

import pytest

from nexus.telemetry.events.system_analytics import (
    ConfigInfo,
    CredentialCounts,
    ExecutionCounts,
    SystemAnalyticsEvent,
    ToolCounts,
    WorkflowCounts,
)


class TestSystemAnalyticsEvent:
    """Tests for SystemAnalyticsEvent model."""

    @pytest.fixture
    def sample_event(self) -> SystemAnalyticsEvent:
        return SystemAnalyticsEvent(
            entitlement_id="ent-abc123",
            workflows=WorkflowCounts(total=10, enabled=7, disabled=3),
            credentials=CredentialCounts(total=5),
            executions=ExecutionCounts(
                total=50, completed=40, failed=5, cancelled=3, running=2, pending=0, paused=0, avg_duration_seconds=60.5
            ),
            config=ConfigInfo(feature_flags_enabled=["flag_a"]),
            tools=ToolCounts(success_count=8, error_count=1, timeout_count=1, distinct_tools=3),
        )

    def test_to_segment_event_name(self, sample_event: SystemAnalyticsEvent):
        segment_event = sample_event.to_segment_event()
        assert segment_event["event"] == "system_analytics"

    def test_to_segment_event_properties_structure(self, sample_event: SystemAnalyticsEvent) -> None:
        segment_event = sample_event.to_segment_event()
        props: Any = segment_event["properties"]
        assert props["entitlement_id"] == "ent-abc123"
        assert props["workflows"]["total"] == 10
        assert props["credentials"]["total"] == 5
        assert props["executions"]["avg_duration_seconds"] == 60.5
        assert props["config"]["feature_flags_enabled"] == ["flag_a"]

    def test_tools_in_segment_properties(self, sample_event: SystemAnalyticsEvent) -> None:
        props: Any = sample_event.to_segment_event()["properties"]
        assert props["tools"]["success_count"] == 8
        assert props["tools"]["error_count"] == 1
        assert props["tools"]["timeout_count"] == 1
        assert props["tools"]["distinct_tools"] == 3
        assert props["tools"]["total_executions"] == 10

    def test_to_segment_event_no_timestamp(self, sample_event: SystemAnalyticsEvent):
        """Segment SDK handles timestamps — payload must not include one."""
        segment_event = sample_event.to_segment_event()
        assert "timestamp" not in segment_event
        assert "timestamp" not in segment_event.get("properties", {})  # type: ignore[operator]


class TestToolCounts:
    """Tests for ToolCounts model."""

    def test_defaults_to_zeros(self):
        counts = ToolCounts()
        assert counts.success_count == 0
        assert counts.error_count == 0
        assert counts.timeout_count == 0
        assert counts.distinct_tools == 0
        assert counts.total_executions == 0

    def test_construction_with_values(self):
        counts = ToolCounts(success_count=5, error_count=2, timeout_count=1, distinct_tools=3)
        assert counts.success_count == 5
        assert counts.error_count == 2
        assert counts.timeout_count == 1
        assert counts.distinct_tools == 3

    def test_total_executions_computed(self):
        counts = ToolCounts(success_count=8, error_count=1, timeout_count=1)
        assert counts.total_executions == 10

    def test_serialization_includes_total_executions(self):
        counts = ToolCounts(success_count=3, error_count=1, timeout_count=0)
        data = counts.model_dump()
        assert data["total_executions"] == 4
        assert data["success_count"] == 3
