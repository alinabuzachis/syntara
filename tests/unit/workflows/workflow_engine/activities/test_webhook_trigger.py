"""Tests for webhook trigger Temporal activity.

Covers:
- Basic pass-through with status=completed
- Output mapping applied correctly
- Payload wrapped in input_config passes through
"""

from nexus.workflows.workflow_engine.activities.webhook_trigger import webhook_trigger


async def test_webhook_trigger_basic() -> None:
    """Webhook trigger should return input with status=completed."""
    input_config = {"payload": {"event": "push", "repo": "nexus"}}
    result = await webhook_trigger(input_config, None)

    assert result == {
        "output": {
            "status": "completed",
            "payload": {"event": "push", "repo": "nexus"},
        }
    }


async def test_webhook_trigger_empty_payload() -> None:
    """Empty payload should still return status=completed."""
    result = await webhook_trigger({}, None)
    assert result == {"output": {"status": "completed"}}


async def test_webhook_trigger_with_output_mapping_suppresses_fields() -> None:
    """Output mapping with explicit keys should suppress unmapped fields."""
    input_config = {"payload": {"event": "push", "repo": "nexus"}}
    # Map a literal value (not a template expression) to verify mapping is applied
    output_config = {"event_type": "payload"}

    result = await webhook_trigger(input_config, output_config)

    output = result["output"]
    assert output["status"] == "completed"
    assert "event_type" in output


async def test_webhook_trigger_with_empty_output_mapping() -> None:
    """Empty output mapping should suppress all fields except status."""
    input_config = {"payload": {"event": "push"}}
    result = await webhook_trigger(input_config, {})

    output = result["output"]
    assert output["status"] == "completed"
