"""Simple integration test for activity config resolution."""

from collections.abc import Awaitable, Callable
from typing import Any

import pytest


@pytest.mark.integration
@pytest.mark.asyncio
async def test_simple_config_resolution(
    run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
) -> None:
    """Test that activity config can be resolved from previous activity output."""
    result = await run_workflow_from_file("fixtures/config-resolution-simple.yaml")

    # Verify workflow completed successfully
    assert result["status"] == "completed", f"Workflow failed with status: {result['status']}"

    # Verify both activities executed
    assert "generate_timeout" in result["activity_outputs"]
    assert "use_timeout" in result["activity_outputs"]

    # Verify first activity generated the timeout value
    generate_output = result["activity_outputs"]["generate_timeout"]
    assert "output" in generate_output
    assert generate_output["output"]["config"]["timeout_value"] == 120

    # Verify second activity used the timeout and succeeded
    use_timeout_output = result["activity_outputs"]["use_timeout"]
    assert "output" in use_timeout_output
    assert "result" in use_timeout_output["output"]
    assert use_timeout_output["output"]["result"]["success"] is True
