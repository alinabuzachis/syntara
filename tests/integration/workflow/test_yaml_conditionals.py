"""Integration tests for conditional branching in workflows."""

from collections.abc import Awaitable, Callable
from typing import Any

import pytest

from nexus.api.workflows.models.workflow_definition import WorkflowDefinition


@pytest.mark.integration
@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("workflow_file", "input_value", "expected_branch", "expected_output", "skipped_branches"),
    [
        # Test positive-negative-zero workflow
        (
            "examples/conditionals/positive-negative-zero.yaml",
            {"number": 10},
            "positive_branch",
            "Value is positive",
            ["negative_branch", "zero_branch"],
        ),
        (
            "examples/conditionals/positive-negative-zero.yaml",
            {"number": -5},
            "negative_branch",
            "Value is negative",
            ["positive_branch", "zero_branch"],
        ),
        (
            "examples/conditionals/positive-negative-zero.yaml",
            {"number": 0},
            "zero_branch",
            "Value is zero",
            ["positive_branch", "negative_branch"],
        ),
        # Test conditional-demo workflow (temperature-based)
        (
            "examples/basic/conditional-demo.yaml",
            {"temperature": 10},
            "cold_weather",
            "Cold weather detected",
            ["hot_weather", "mild_weather"],
        ),
        (
            "examples/basic/conditional-demo.yaml",
            {"temperature": 35},
            "hot_weather",
            "Hot weather detected",
            ["cold_weather"],  # mild_weather also runs (>= 15)
        ),
        (
            "examples/basic/conditional-demo.yaml",
            {"temperature": 22},
            "mild_weather",
            "Pleasant weather conditions",  # Actual output text
            ["cold_weather", "hot_weather"],
        ),
    ],
)
async def test_conditional_branching(
    run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    workflow_file: str,
    input_value: dict[str, int],
    expected_branch: str,
    expected_output: str,
    skipped_branches: list[str],
) -> None:
    """Test conditional branching with various inputs.

    This parameterized test verifies:
    - Conditions are evaluated correctly
    - Correct branch is executed based on condition
    - Activities in non-executed branches are skipped
    """
    result = await run_workflow_from_file(workflow_file, inputs=input_value)

    # Verify workflow completed
    assert result["status"] == "completed"

    # Verify expected branch executed
    assert expected_branch in result["activity_outputs"]
    branch_output = result["activity_outputs"][expected_branch]
    assert branch_output.get("skipped") is not True
    assert expected_output in branch_output["stdout"]

    # Verify other branches were skipped
    for skipped_branch in skipped_branches:
        assert result["activity_outputs"][skipped_branch].get("skipped") is True


@pytest.mark.integration
@pytest.mark.asyncio
async def test_conditional_structure(load_workflow: Callable[[str], WorkflowDefinition]) -> None:
    """Test conditional structure is parsed correctly."""
    workflow_def = load_workflow("examples/conditionals/positive-negative-zero.yaml")

    assert len(workflow_def.workflow.activities) == 4
    # First activity sets the value, then 3 conditional branches
    assert all(activity.condition is not None for activity in workflow_def.workflow.activities[1:])


@pytest.mark.integration
@pytest.mark.asyncio
async def test_nested_conditionals(
    run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]], load_workflow: Callable[[str], WorkflowDefinition]
) -> None:
    """Test nested conditional logic."""
    # Verify structure
    workflow_def = load_workflow("examples/conditionals/nested-conditions.yaml")
    assert workflow_def.workflow.activities[1].condition is not None

    # Run workflow
    result = await run_workflow_from_file("examples/conditionals/nested-conditions.yaml", inputs={"value": 25})

    # Verify workflow completed
    assert result["status"] == "completed"
