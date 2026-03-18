"""Contract tests for telemetry event schemas.

Validates that Pydantic models produce valid events and consistent JSON schemas.
"""

import json

import jsonschema

from nexus.telemetry.events.activity_execution import ActivityExecutionEvent
from nexus.telemetry.events.workflow_execution import (
    WorkflowExecutionCompletedEvent,
    WorkflowExecutionStartEvent,
)

# Import shared test data from unit telemetry conftest
from tests.unit.telemetry.conftest import (
    VALID_ACTIVITY_HASH,
    VALID_WORKFLOW_EXECUTION_ID,
)


class TestWorkflowExecutionStartEventSchema:
    """Contract tests for WorkflowExecutionStartEvent JSON schema."""

    def test_model_generates_valid_json_schema(self):
        schema = WorkflowExecutionStartEvent.model_json_schema()
        assert schema["type"] == "object"
        assert "workflow_execution_id" in schema["properties"]

    def test_valid_event_conforms_to_schema(self):
        schema = WorkflowExecutionStartEvent.model_json_schema()
        event = WorkflowExecutionStartEvent(
            workflow_execution_id=VALID_WORKFLOW_EXECUTION_ID,
            entitlement_id="",
        )
        event_dict = event.model_dump()
        jsonschema.validate(instance=event_dict, schema=schema)
        # Segment event must be JSON-serializable
        assert json.dumps(event.to_segment_event())


class TestWorkflowExecutionCompletedEventSchema:
    """Contract tests for WorkflowExecutionCompletedEvent JSON schema."""

    def test_model_generates_valid_json_schema(self):
        schema = WorkflowExecutionCompletedEvent.model_json_schema()
        assert schema["type"] == "object"
        assert "status" in schema["properties"]
        assert "duration_ms" in schema["properties"]
        assert "activity_count" in schema["properties"]
        assert "error_count" in schema["properties"]

    def test_valid_event_conforms_to_schema(self):
        schema = WorkflowExecutionCompletedEvent.model_json_schema()
        event = WorkflowExecutionCompletedEvent(
            workflow_execution_id=VALID_WORKFLOW_EXECUTION_ID,
            status="completed",
            duration_ms=12500,
            activity_count=8,
            error_count=0,
            error_type=None,
            entitlement_id="",
        )
        event_dict = event.model_dump()
        jsonschema.validate(instance=event_dict, schema=schema)
        # Segment event must be JSON-serializable
        assert json.dumps(event.to_segment_event())


class TestActivityExecutionEventSchema:
    """Contract tests for ActivityExecutionEvent JSON schema."""

    def test_model_generates_valid_json_schema(self):
        schema = ActivityExecutionEvent.model_json_schema()
        assert schema["type"] == "object"
        assert "activity_type" in schema["properties"]
        assert "activity_hash" in schema["properties"]
        assert "status" in schema["properties"]

    def test_valid_event_conforms_to_schema(self):
        schema = ActivityExecutionEvent.model_json_schema()
        event = ActivityExecutionEvent(
            workflow_execution_id=VALID_WORKFLOW_EXECUTION_ID,
            activity_type="task",
            activity_hash=VALID_ACTIVITY_HASH,
            status="completed",
            error_type=None,
            entitlement_id="",
        )
        event_dict = event.model_dump()
        jsonschema.validate(instance=event_dict, schema=schema)
        # Segment event must be JSON-serializable
        assert json.dumps(event.to_segment_event())

    def test_all_activity_types_valid_against_schema(self):
        schema = ActivityExecutionEvent.model_json_schema()
        for activity_type in ["task", "parallel", "sequence", "condition", "loop", "converge", "approval"]:
            event = ActivityExecutionEvent(
                workflow_execution_id=VALID_WORKFLOW_EXECUTION_ID,
                activity_type=activity_type,
                activity_hash=VALID_ACTIVITY_HASH,
                status="completed",
                entitlement_id="",
            )
            event_dict = event.model_dump()
            jsonschema.validate(instance=event_dict, schema=schema)
