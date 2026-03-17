"""Unit tests for SystemAnalyticsEvent."""

from typing import Any

import pytest

from nexus.telemetry.events.system_analytics import (
    ConfigInfo,
    CredentialCounts,
    ExecutionCounts,
    SystemAnalyticsEvent,
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

    def test_to_segment_event_no_timestamp(self, sample_event: SystemAnalyticsEvent):
        """Segment SDK handles timestamps — payload must not include one."""
        segment_event = sample_event.to_segment_event()
        assert "timestamp" not in segment_event
        assert "timestamp" not in segment_event.get("properties", {})  # type: ignore[operator]
