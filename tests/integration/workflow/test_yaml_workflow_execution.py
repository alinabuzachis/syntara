"""Integration tests for basic workflow execution."""

from collections.abc import Awaitable, Callable
from typing import Any

import pytest

from nexus_api.workflows.models.workflow_definition import WorkflowDefinition


@pytest.mark.integration
@pytest.mark.asyncio
async def test_hello_world_workflow(run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]]) -> None:
    """Test basic hello world workflow execution."""
    result = await run_workflow_from_file("examples/basic/hello-world.yaml")

    # Verify workflow completed
    assert result["status"] == "completed"

    # Verify activities executed
    assert "say_hello" in result["activity_outputs"]
    assert "say_goodbye" in result["activity_outputs"]

    # Verify outputs
    assert "Hello, World!" in result["activity_outputs"]["say_hello"]["stdout"]
    assert "Goodbye, World!" in result["activity_outputs"]["say_goodbye"]["stdout"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_workflow_structure(load_workflow: Callable[[str], WorkflowDefinition]) -> None:
    """Test workflow structure is parsed correctly."""
    workflow_def = load_workflow("examples/basic/hello-world.yaml")

    # Verify metadata
    assert workflow_def.metadata.name == "hello-world"
    assert workflow_def.metadata.description is not None

    # Verify activities
    assert len(workflow_def.workflow.activities) == 2
    assert workflow_def.workflow.activities[0].id == "say_hello"
    assert workflow_def.workflow.activities[1].id == "say_goodbye"


@pytest.mark.integration
@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("workflow_file", "expected_activities"),
    [
        ("examples/basic/hello-world.yaml", ["say_hello", "say_goodbye"]),
        ("examples/basic/loop-demo.yaml", ["process_items", "summary"]),
        ("examples/basic/parallel-demo.yaml", ["parallel_tasks", "summary"]),
    ],
)
async def test_workflow_execution(
    run_workflow_from_file: Callable[[str], Awaitable[dict[str, Any]]],
    workflow_file: str,
    expected_activities: list[str],
) -> None:
    """Test various workflows execute successfully.

    This parameterized test verifies:
    - Workflows execute successfully
    - Expected activities are present in output
    """
    result = await run_workflow_from_file(workflow_file)

    # Verify workflow completed
    assert result["status"] == "completed"

    # Verify expected activities executed
    for activity_id in expected_activities:
        assert activity_id in result["activity_outputs"]
