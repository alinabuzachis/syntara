"""Tests for WebhookTrigger model and WebhookTriggerRead schema.

Covers:
- Model instantiation with valid fields
- Field constraints and defaults
"""

from uuid import uuid4

from nexus.workflows.models.webhook_trigger import WebhookTrigger, WebhookTriggerRead


async def test_webhook_trigger_creation() -> None:
    """WebhookTrigger should be creatable with required fields."""
    workflow_id = uuid4()
    trigger = WebhookTrigger(
        webhook_path="my-webhook",
        workflow_id=workflow_id,
        trigger_node_id="trigger_webhook_1",
    )

    assert trigger.webhook_path == "my-webhook"
    assert trigger.workflow_id == workflow_id
    assert trigger.trigger_node_id == "trigger_webhook_1"
    assert trigger.is_enabled is True
    assert trigger.input_schema is None


async def test_webhook_trigger_with_input_schema() -> None:
    """WebhookTrigger should accept input_schema."""
    schema = {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "type": "object",
        "properties": {"event": {"type": "string"}},
    }
    trigger = WebhookTrigger(
        webhook_path="validated-hook",
        workflow_id=uuid4(),
        trigger_node_id="trigger_1",
        input_schema=schema,
    )

    assert trigger.input_schema == schema


async def test_webhook_trigger_read() -> None:
    """WebhookTriggerRead should validate from a WebhookTrigger."""
    trigger = WebhookTrigger(
        webhook_path="test-path",
        workflow_id=uuid4(),
        trigger_node_id="trigger_1",
    )

    read = WebhookTriggerRead.model_validate(trigger)
    assert read.webhook_path == "test-path"


async def test_webhook_trigger_disabled() -> None:
    """WebhookTrigger should support disabled state."""
    trigger = WebhookTrigger(
        webhook_path="disabled-hook",
        workflow_id=uuid4(),
        trigger_node_id="trigger_1",
        is_enabled=False,
    )
    assert trigger.is_enabled is False
