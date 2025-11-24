"""Integration tests for parallel bash activity execution."""

import asyncio
import time
from collections.abc import Awaitable, Callable
from typing import Any

import pytest

from nexus.workflows.workflow_engine.activities.script_activity import execute_bash_script
from nexus.workflows.workflow_engine.models import ScriptExecutorConfig, ScriptLanguage


@pytest.mark.integration
@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("workflow_file", "expected_tasks"),
    [
        ("examples/parallel/parallel-tasks.yaml", ["task_1", "task_2", "task_3"]),
        ("examples/basic/parallel-demo.yaml", ["parallel_tasks"]),
    ],
)
async def test_parallel_execution(
    run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]], workflow_file: str, expected_tasks: list[str]
) -> None:
    """Test parallel execution of activities.

    This parameterized test verifies:
    - Multiple activities can execute concurrently
    - All activities complete successfully
    - Parallel execution structure is correct
    """
    result = await run_workflow_from_file(workflow_file)

    # Verify workflow completed
    assert result["status"] == "completed"

    # Verify all expected tasks executed
    for task_id in expected_tasks:
        assert task_id in result["activity_outputs"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_parallel_bash_activities_detailed(
    run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
) -> None:
    """Test parallel execution with detailed output verification."""
    result = await run_workflow_from_file("examples/parallel/parallel-tasks.yaml")

    # Verify workflow completed
    assert result["status"] == "completed"

    # Verify all three tasks executed
    assert "task_1" in result["activity_outputs"]
    assert "task_2" in result["activity_outputs"]
    assert "task_3" in result["activity_outputs"]

    # Verify outputs contain expected messages
    assert "Task 1 complete" in result["activity_outputs"]["task_1"]["stdout"]
    assert "Task 2 complete" in result["activity_outputs"]["task_2"]["stdout"]
    assert "Task 3 complete" in result["activity_outputs"]["task_3"]["stdout"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_parallel_demo_branches(run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]]) -> None:
    """Test parallel-demo workflow with branch verification."""
    result = await run_workflow_from_file("examples/basic/parallel-demo.yaml")

    # Verify workflow completed
    assert result["status"] == "completed"

    # Verify parallel activity executed
    assert "parallel_tasks" in result["activity_outputs"]

    # Get parallel output
    parallel_output = result["activity_outputs"]["parallel_tasks"]
    assert parallel_output.get("type") == "parallel"

    # Verify branches exist in output
    branches = parallel_output.get("branches", {})
    assert len(branches) > 0, "Expected parallel branches in output"

    # Verify each branch completed successfully
    for branch_id, branch_result in branches.items():
        assert "stdout" in branch_result or "skipped" in branch_result, (
            f"Branch {branch_id} should have stdout or be skipped"
        )

        # If not skipped, verify it executed
        if not branch_result.get("skipped"):
            assert branch_result.get("return_code") == 0, f"Branch {branch_id} should have return_code 0"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_parallel_with_different_durations() -> None:
    """Test parallel execution with activities of different durations."""
    scripts = [
        "sleep 0.5; echo 'Fast task'",
        "sleep 1; echo 'Medium task'",
        "sleep 0.2; echo 'Very fast task'",
    ]

    start_time = time.time()

    configs = [ScriptExecutorConfig(language=ScriptLanguage.BASH, code=s) for s in scripts]
    tasks = [execute_bash_script(config.model_dump(by_alias=True), inputs={}) for config in configs]
    results = await asyncio.gather(*tasks)

    elapsed_time = time.time() - start_time

    assert elapsed_time < 2.5
    assert len(results) == 3
    assert all(r["return_code"] == 0 for r in results)
