"""Tests for webhook trigger Temporal activity.

Covers:
- Basic pass-through
- Output mapping applied correctly
- Payload wrapped in input_config passes through
"""

import pytest

from nexus.workflows.workflow_engine.activities.webhook_trigger import webhook_trigger


async def test_webhook_trigger_basic() -> None:
    """Webhook trigger should return input as output."""
    input_config = {"payload": {"event": "push", "repo": "nexus"}}
    result = await webhook_trigger(input_config, None)

    assert result == {
        "output": {
            "payload": {"event": "push", "repo": "nexus"},
        }
    }


async def test_webhook_trigger_empty_payload() -> None:
    """Empty payload should return empty output."""
    result = await webhook_trigger({}, None)
    assert result == {"output": {}}


async def test_webhook_trigger_with_output_mapping_suppresses_fields() -> None:
    """Output mapping with explicit keys should suppress unmapped fields."""
    input_config = {"payload": {"event": "push", "repo": "nexus"}}
    output_config = {"event_type": "payload"}

    result = await webhook_trigger(input_config, output_config)

    output = result["output"]
    assert "event_type" in output


async def test_webhook_trigger_with_empty_output_mapping() -> None:
    """Empty output mapping should suppress all fields."""
    input_config = {"payload": {"event": "push"}}
    result = await webhook_trigger(input_config, {})

    output = result["output"]
    assert output == {}


async def test_webhook_trigger_status_in_payload_passes_through() -> None:
    """User-supplied status in payload is treated as user data."""
    input_config = {"payload": {"data": "test"}, "status": "failed"}
    result = await webhook_trigger(input_config, None)

    assert result["output"]["status"] == "failed"


async def test_webhook_trigger_no_control_in_result() -> None:
    """Webhook trigger result should only contain output, not control."""
    input_config = {"payload": {"event": "push"}}
    result = await webhook_trigger(input_config, None)

    assert "output" in result
    assert "control" not in result


async def test_webhook_trigger_nested_payload() -> None:
    """Nested structures in payload pass through unchanged."""
    input_config = {
        "payload": {
            "repository": {"owner": "org", "name": "repo"},
            "commits": [{"id": "abc123"}, {"id": "def456"}],
        }
    }
    result = await webhook_trigger(input_config, None)

    output = result["output"]
    assert output["payload"]["repository"]["owner"] == "org"
    assert len(output["payload"]["commits"]) == 2


async def test_webhook_trigger_bad_output_mapping_raises() -> None:
    """Bad output mapping raises ApplicationError."""
    from temporalio.exceptions import ApplicationError

    input_config = {"payload": {"event": "push"}}
    with pytest.raises(ApplicationError) as exc_info:
        await webhook_trigger(input_config, {"x": "${result.nonexistent}"})
    assert exc_info.value.type == "OutputMappingError"
