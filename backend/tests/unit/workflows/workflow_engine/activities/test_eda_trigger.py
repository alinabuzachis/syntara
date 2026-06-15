"""Tests for eda_trigger activity.

eda_trigger delegates to webhook_trigger, so only a smoke test is needed
to verify the delegation. Behavioral coverage lives in test_webhook_trigger.py.
"""

from typing import Any

import pytest

from nexus.workflows.workflow_engine.activities.eda_trigger import eda_trigger


@pytest.mark.asyncio
async def test_eda_trigger_delegates_to_webhook_trigger() -> None:
    """EDA trigger produces the same result as webhook_trigger."""
    inputs: dict[str, Any] = {
        "payload": {"branch": "main", "commit": "abc123"},
    }
    result = await eda_trigger(inputs, None)

    assert result == {
        "output": {
            "payload": {"branch": "main", "commit": "abc123"},
        }
    }
