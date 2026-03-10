"""Unit tests for telemetry event models and builders."""

import pytest
from pydantic import ValidationError

from nexus.telemetry.events.activity_execution import (
    ActivityExecutionEvent,
    ActivityExecutionEventBuilder,
)
from nexus.telemetry.events.base import BaseTelemetryEvent
from nexus.telemetry.events.workflow_execution import (
    WorkflowExecutionCompletedEvent,
    WorkflowExecutionEventBuilder,
    WorkflowExecutionStartEvent,
)

# Import shared test data from conftest
from tests.unit.telemetry.conftest import (
    VALID_ACTIVITY_HASH,
    VALID_WORKFLOW_EXECUTION_ID,
)

# =============================================================================
# BaseTelemetryEvent Tests
# =============================================================================


class TestBaseTelemetryEventName:
    """Tests for BaseTelemetryEvent._get_event_name method."""

    def test_get_event_name_derives_from_class_name(self):
        """Test that event name is derived from class name when _segment_event_name is not set."""

        class MyCustomEvent(BaseTelemetryEvent):
            pass

        assert MyCustomEvent._get_event_name() == "my_custom"

    def test_get_event_name_removes_event_suffix(self):
        """Test that 'Event' suffix is removed from derived name."""

        class SomeActionEvent(BaseTelemetryEvent):
            pass

        assert SomeActionEvent._get_event_name() == "some_action"

    def test_get_event_name_handles_acronyms(self):
        """Test that consecutive uppercase letters (acronyms) are kept together."""

        class APICallEvent(BaseTelemetryEvent):
            pass

        assert APICallEvent._get_event_name() == "api_call"

    def test_get_event_name_handles_acronym_at_end(self):
        """Test acronym at the end of the class name."""

        class CallAPIEvent(BaseTelemetryEvent):
            pass

        assert CallAPIEvent._get_event_name() == "call_api"

    def test_get_event_name_handles_acronym_before_regular_word(self):
        """Test acronym followed by a regular CamelCase word."""

        class HTMLParserEvent(BaseTelemetryEvent):
            pass

        assert HTMLParserEvent._get_event_name() == "html_parser"


# =============================================================================
# WorkflowExecutionStartEvent Tests (T019-TEST)
# =============================================================================


class TestWorkflowExecutionStartEvent:
    """Tests for WorkflowExecutionStartEvent Pydantic model."""

    def test_valid_event_creation(self):
        event = WorkflowExecutionStartEvent(
            workflow_execution_id=VALID_WORKFLOW_EXECUTION_ID,
        )
        assert event.workflow_execution_id == VALID_WORKFLOW_EXECUTION_ID

    def test_to_segment_event(self):
        event = WorkflowExecutionStartEvent(
            workflow_execution_id=VALID_WORKFLOW_EXECUTION_ID,
        )
        segment_event = event.to_segment_event()
        assert segment_event["event"] == "workflow_execution_start"
        assert "properties" in segment_event
        props = segment_event["properties"]
        assert props["workflow_execution_id"] == VALID_WORKFLOW_EXECUTION_ID


# =============================================================================
# WorkflowExecutionCompletedEvent Tests (T020-TEST)
# =============================================================================


class TestWorkflowExecutionCompletedEvent:
    """Tests for WorkflowExecutionCompletedEvent Pydantic model."""

    @pytest.mark.parametrize(
        ("status", "error_count", "error_type"),
        [
            ("completed", 0, None),
            ("failed", 1, "ActivityExecutionError"),
        ],
    )
    def test_event_creation(self, status, error_count, error_type):
        event = WorkflowExecutionCompletedEvent(
            workflow_execution_id=VALID_WORKFLOW_EXECUTION_ID,
            status=status,
            duration_ms=12500,
            activity_count=8,
            error_count=error_count,
            error_type=error_type,
        )
        assert event.status == status
        assert event.duration_ms == 12500
        assert event.activity_count == 8
        assert event.error_count == error_count
        assert event.error_type == error_type

    def test_invalid_status(self):
        with pytest.raises(ValidationError):
            WorkflowExecutionCompletedEvent(
                workflow_execution_id=VALID_WORKFLOW_EXECUTION_ID,
                status="unknown",
                duration_ms=100,
                activity_count=1,
                error_count=0,
            )

    def test_to_segment_event(self):
        event = WorkflowExecutionCompletedEvent(
            workflow_execution_id=VALID_WORKFLOW_EXECUTION_ID,
            status="completed",
            duration_ms=12500,
            activity_count=8,
            error_count=0,
        )
        segment_event = event.to_segment_event()
        assert segment_event["event"] == "workflow_execution_completed"
        props = segment_event["properties"]
        assert props["status"] == "completed"
        assert props["duration_ms"] == 12500
        assert props["activity_count"] == 8
        assert props["error_count"] == 0


# =============================================================================
# ActivityExecutionEvent Tests (T021-TEST)
# =============================================================================


class TestActivityExecutionEvent:
    """Tests for ActivityExecutionEvent Pydantic model."""

    def test_valid_success_event(self):
        event = ActivityExecutionEvent(
            workflow_execution_id=VALID_WORKFLOW_EXECUTION_ID,
            activity_type="task",
            activity_hash=VALID_ACTIVITY_HASH,
            status="completed",
            error_type=None,
        )
        assert event.activity_type == "task"
        assert event.status == "completed"
        assert event.error_type is None

    def test_invalid_activity_type(self):
        with pytest.raises(ValidationError):
            ActivityExecutionEvent(
                workflow_execution_id=VALID_WORKFLOW_EXECUTION_ID,
                activity_type="invalid",
                activity_hash=VALID_ACTIVITY_HASH,
                status="completed",
            )

    def test_to_segment_event(self):
        event = ActivityExecutionEvent(
            workflow_execution_id=VALID_WORKFLOW_EXECUTION_ID,
            activity_type="task",
            activity_hash=VALID_ACTIVITY_HASH,
            status="completed",
            action_type="api_call",
        )
        segment_event = event.to_segment_event()
        assert segment_event["event"] == "activity_execution"
        props = segment_event["properties"]
        assert props["activity_type"] == "task"
        assert props["action_type"] == "api_call"


# =============================================================================
# WorkflowExecutionEventBuilder Tests (T022-TEST, T024-TEST)
# =============================================================================


class TestWorkflowExecutionEventBuilder:
    """Tests for WorkflowExecutionEventBuilder."""

    def test_build_start_event(self):
        builder = WorkflowExecutionEventBuilder()
        event = builder.build_start_event(
            workflow_execution_id=VALID_WORKFLOW_EXECUTION_ID,
        )
        assert isinstance(event, WorkflowExecutionStartEvent)
        assert event.workflow_execution_id == VALID_WORKFLOW_EXECUTION_ID

    def test_build_completed_event_success(self):
        builder = WorkflowExecutionEventBuilder()
        event = builder.build_completed_event(
            workflow_execution_id=VALID_WORKFLOW_EXECUTION_ID,
            status="completed",
            duration_ms=12500,
            activity_count=8,
            error_count=0,
        )
        assert isinstance(event, WorkflowExecutionCompletedEvent)
        assert event.status == "completed"
        assert event.duration_ms == 12500
        assert event.error_type is None


# =============================================================================
# ActivityExecutionEventBuilder Tests (T023-TEST)
# =============================================================================


class TestActivityExecutionEventBuilder:
    """Tests for ActivityExecutionEventBuilder."""

    def test_build_event(self):
        builder = ActivityExecutionEventBuilder()

        # Build event and verify basic properties
        event = builder.build_event(
            workflow_execution_id=VALID_WORKFLOW_EXECUTION_ID,
            activity_type="task",
            activity_def={"a": 1, "b": 2},
            status="completed",
        )
        assert isinstance(event, ActivityExecutionEvent)
        assert event.status == "completed"
        assert len(event.activity_hash) == 64

        # Verify hash is deterministic and key-order independent
        event_same = builder.build_event(
            workflow_execution_id=VALID_WORKFLOW_EXECUTION_ID,
            activity_type="task",
            activity_def={"b": 2, "a": 1},
            status="completed",
        )
        assert event.activity_hash == event_same.activity_hash
