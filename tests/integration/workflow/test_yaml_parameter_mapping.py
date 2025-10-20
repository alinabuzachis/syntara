"""Integration tests for parameter mapping and data passing between activities."""

from collections.abc import Awaitable, Callable
from typing import Any

import pytest

from nexus.workflows.models.workflow_definition import WorkflowDefinition


@pytest.mark.integration
@pytest.mark.asyncio
async def test_activity_output_to_input_mapping(
    run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
) -> None:
    """Test output from one activity becomes input to next activity."""
    result = await run_workflow_from_file("examples/parameters/activity-chaining.yaml")

    # Verify workflow completed
    assert result["status"] == "completed"

    # Verify the chained parameter mapping worked
    process_output = result["activity_outputs"]["process_data"]["stdout"]
    assert "Processing user: John Doe" in process_output
    assert "ID: 123" in process_output

    finalize_output = result["activity_outputs"]["finalize"]["stdout"]
    assert "Finalization complete" in finalize_output


@pytest.mark.integration
@pytest.mark.asyncio
async def test_output_mapping_structure(load_workflow: Callable[[str], WorkflowDefinition]) -> None:
    """Test output mapping configuration is parsed correctly."""
    workflow_def = load_workflow("examples/parameters/activity-chaining.yaml")

    # Verify first activity has outputs defined
    fetch_activity = workflow_def.workflow.activities[0]
    assert fetch_activity.task is not None
    assert fetch_activity.task.outputs is not None
    assert "user_data" in fetch_activity.task.outputs

    # Verify second activity uses mapped outputs as inputs
    process_activity = workflow_def.workflow.activities[1]
    assert process_activity.task is not None
    assert process_activity.task.inputs is not None
    assert "${fetch_data.output.user_data" in str(process_activity.task.inputs)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_json_output_parsing(run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]]) -> None:
    """Test JSON output parsing and field extraction."""
    result = await run_workflow_from_file("examples/parameters/activity-chaining.yaml")

    # Verify workflow completed
    assert result["status"] == "completed"

    # Verify first activity has output mapping
    first_output = result["activity_outputs"]["fetch_data"]

    # Check that output was mapped
    assert "output" in first_output
    assert "user_data" in first_output["output"]
