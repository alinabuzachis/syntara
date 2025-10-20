"""Integration tests for loop execution (repeat/forEach)."""

from collections.abc import Awaitable, Callable
from typing import Any

import pytest

from nexus.workflows.activities.script_activity import execute_bash_script
from nexus.workflows.models.workflow_definition import WorkflowDefinition


@pytest.mark.integration
@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("workflow_file", "expected_iterations", "expected_items"),
    [
        ("examples/loops/foreach-items.yaml", 3, ["apple", "banana", "cherry"]),
        ("examples/basic/loop-demo.yaml", 3, ["apple", "banana", "cherry"]),
    ],
)
async def test_foreach_loop_with_defaults(
    run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    workflow_file: str,
    expected_iterations: int,
    expected_items: list[str],
) -> None:
    """Test forEach loop execution with default items.

    This parameterized test verifies:
    - forEach loops iterate over default collections
    - Each iteration executes successfully
    - Loop variables accessible in activity inputs
    - Iteration outputs tracked correctly
    """
    result = await run_workflow_from_file(workflow_file)

    # Verify workflow completed
    assert result["status"] == "completed"

    # Verify loop executed
    assert "process_items" in result["activity_outputs"]

    # Get loop output
    loop_output = result["activity_outputs"]["process_items"]
    assert loop_output.get("type") == "forEach"
    assert loop_output.get("iterations") == expected_iterations

    # Verify each iteration processed expected items
    loop_results = loop_output.get("results", [])
    all_stdout = "".join([r["result"].get("stdout", "") for r in loop_results])
    for item in expected_items:
        assert item in all_stdout, f"Expected to find '{item}' in loop output"


@pytest.mark.integration
@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("workflow_file", "custom_items"),
    [
        ("examples/basic/loop-demo.yaml", ["apple", "banana", "cherry", "date"]),
        ("examples/basic/loop-demo.yaml", ["task1", "task2"]),
        ("examples/basic/loop-demo.yaml", ["x", "y", "z", "w"]),
    ],
)
async def test_foreach_loop_with_custom_items(
    run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]], workflow_file: str, custom_items: list[str]
) -> None:
    """Test forEach loop with custom input items.

    This parameterized test verifies the loop works with user-provided inputs
    and processes the exact items provided.
    """
    result = await run_workflow_from_file(workflow_file, inputs={"items": custom_items})

    # Verify workflow completed
    assert result["status"] == "completed"

    # Verify loop executed
    assert "process_items" in result["activity_outputs"]

    # Get loop output
    loop_output = result["activity_outputs"]["process_items"]
    assert loop_output.get("type") == "forEach"

    # Verify the correct number of iterations matches our custom items
    assert loop_output.get("iterations") == len(custom_items)

    # Verify each custom item was processed
    loop_results = loop_output.get("results", [])
    assert len(loop_results) == len(custom_items)

    # Check that ALL custom items were processed
    all_stdout = "".join([r["result"].get("stdout", "") for r in loop_results])
    for item in custom_items:
        assert item in all_stdout, f"Expected to find '{item}' in loop output"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_foreach_loop_structure(load_workflow: Callable[[str], WorkflowDefinition]) -> None:
    """Test forEach loop structure is parsed correctly."""
    workflow_def = load_workflow("examples/loops/foreach-items.yaml")

    assert len(workflow_def.workflow.activities) == 1
    activity = workflow_def.workflow.activities[0]
    assert activity.loop is not None
    assert activity.loop.type == "forEach"
    assert activity.loop.item_variable == "item"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_foreach_with_output_aggregation() -> None:
    """Test forEach loop with output aggregation."""
    script = """
    ITEM="$1"
    echo "Processed: $ITEM"
    echo "{\"item\": \"$ITEM\", \"status\": \"done\"}"
    """

    items = ["task1", "task2", "task3"]
    outputs = []

    for item in items:
        result = await execute_bash_script(script=script, inputs={"item": item})
        outputs.append(result)

    # Verify all outputs collected
    assert len(outputs) == 3
    assert all("Processed:" in o["stdout"] for o in outputs)
