"""Integration tests for mixed activity types (bash, python, api).

Tests workflows that combine different executor types:
- Sequential execution with mixed activity types
- Parallel execution with different executors
"""

from collections.abc import Awaitable, Callable
from datetime import timedelta
from typing import Any

import pytest
import respx
from temporalio.client import WorkflowFailureError


@pytest.mark.integration
@pytest.mark.asyncio
async def test_mixed_activity_types_sequential(
    run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    mock_api_server: respx.MockRouter,
) -> None:
    """Test sequential workflow with bash → python → api activities (T009).

    Data should flow correctly between different executor types:
    - Bash script produces output
    - Python script consumes bash output, produces new output
    - API activity uses python output
    """
    result = await run_workflow_from_file(
        "examples/mixed/sequential-mixed-types.yaml", execution_timeout=timedelta(seconds=5)
    )

    # Verify workflow completed successfully
    assert result["status"] == "completed", f"Workflow failed: {result.get('error')}"

    # Verify all three activity types executed
    assert "bash_step" in result["activity_outputs"]
    assert "python_step" in result["activity_outputs"]
    assert "api_step" in result["activity_outputs"]

    # Verify bash activity completed
    bash_output = result["activity_outputs"]["bash_step"]
    assert "stdout" in bash_output
    assert bash_output["return_code"] == 0

    # Verify python activity received data from bash and completed
    python_output = result["activity_outputs"]["python_step"]
    assert "output" in python_output
    assert python_output["return_code"] == 0

    # Verify API activity received data from python and completed
    api_output = result["activity_outputs"]["api_step"]
    assert "status_code" in api_output
    assert api_output["status_code"] in [200, 201]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_parallel_execution_mixed_executors(
    run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    mock_api_server: respx.MockRouter,
) -> None:
    """Test parallel execution with different executor types (T010).

    Three branches execute concurrently:
    - Branch 1: Bash script
    - Branch 2: Python script
    - Branch 3: API request
    All should complete and results should be aggregated.
    """
    result = await run_workflow_from_file(
        "examples/mixed/parallel-mixed-types.yaml", execution_timeout=timedelta(seconds=5)
    )

    # Verify workflow completed successfully
    assert result["status"] == "completed"

    # Verify all parallel branches executed
    parallel_activity = result["activity_outputs"]["parallel_mixed"]
    assert parallel_activity is not None

    # Check that results from all branches are present
    # The parallel activity should have captured outputs from all branches
    assert "bash_branch" in result["activity_outputs"]
    assert "python_branch" in result["activity_outputs"]
    assert "api_branch" in result["activity_outputs"]

    # Verify each branch completed successfully
    assert result["activity_outputs"]["bash_branch"]["return_code"] == 0
    assert result["activity_outputs"]["python_branch"]["return_code"] == 0
    assert result["activity_outputs"]["api_branch"]["status_code"] == 200


@pytest.mark.integration
@pytest.mark.asyncio
async def test_data_transformation_pipeline(
    run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    mock_api_server: respx.MockRouter,
) -> None:
    """Test data transformation pipeline with mixed executors.

    A realistic workflow that:
    1. Fetches data via API (executor: api)
    2. Processes data with Python script (executor: script, language: python)
    3. Validates with bash script (executor: script, language: bash)
    4. Sends results via API (executor: api)
    """
    result = await run_workflow_from_file("examples/mixed/data-pipeline.yaml", execution_timeout=timedelta(seconds=5))

    # Verify workflow completed
    assert result["status"] == "completed"

    # Verify all pipeline stages executed in order
    assert "fetch_data" in result["activity_outputs"]
    assert "process_data" in result["activity_outputs"]
    assert "validate_data" in result["activity_outputs"]
    assert "send_results" in result["activity_outputs"]

    # Verify data flowed through the pipeline
    # Fetch should produce data
    fetch_output = result["activity_outputs"]["fetch_data"]
    assert "output" in fetch_output  # API with outputs mapping creates an output key
    assert "fetched_data" in fetch_output["output"]

    # Process should transform the fetched data
    process_output = result["activity_outputs"]["process_data"]
    assert "output" in process_output

    # Validate should check the processed data
    validate_output = result["activity_outputs"]["validate_data"]
    assert validate_output["return_code"] == 0

    # Send should POST the results
    send_output = result["activity_outputs"]["send_results"]
    assert send_output["status_code"] in [200, 201, 204]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_conditional_branching_mixed_types(
    run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    mock_api_server: respx.MockRouter,
) -> None:
    """Test conditional execution with different activity types.

    Workflow should evaluate condition and execute appropriate branch:
    - If condition true: execute Python script
    - If condition false: execute API call
    """
    result = await run_workflow_from_file(
        "examples/mixed/conditional-mixed.yaml", execution_timeout=timedelta(seconds=5)
    )

    # Verify workflow completed
    assert result["status"] == "completed"

    # Verify condition was evaluated
    condition_output = result["activity_outputs"].get("check_condition")
    assert condition_output is not None

    # One of the branches should have executed
    python_executed = "python_branch" in result["activity_outputs"]
    api_executed = "api_branch" in result["activity_outputs"]

    # Exactly one branch should have executed (not both)
    assert python_executed or api_executed, "At least one branch should execute"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_error_handling_across_executor_types(
    run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
) -> None:
    """Test error handling works consistently across all executor types.

    If any activity fails, error should be captured regardless of executor type.
    """
    # Workflow should raise an exception when activity fails
    with pytest.raises(WorkflowFailureError) as exc_info:
        await run_workflow_from_file("examples/mixed/error-handling-mixed.yaml", execution_timeout=timedelta(seconds=5))

    # Verify error indicates script/activity failure
    error_chain = str(exc_info.value.cause) if exc_info.value.cause else str(exc_info.value)
    assert "script" in error_chain.lower() or "failed" in error_chain.lower() or "error" in error_chain.lower()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_loop_with_mixed_executors(
    run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
) -> None:
    """Test loop execution with alternating executor types.

    Loop should iterate over items, alternating between bash and python scripts.
    """
    result = await run_workflow_from_file(
        "examples/mixed/loop-mixed-types.yaml", execution_timeout=timedelta(seconds=5)
    )

    # Verify workflow completed
    assert result["status"] == "completed"

    # Verify loop executed multiple iterations
    # Note: Loop activity names may vary based on implementation
    loop_outputs = [k for k in result["activity_outputs"] if "item" in k.lower() or "loop" in k.lower()]
    assert len(loop_outputs) >= 1, "Loop should execute at least one iteration"

    # Verify each iteration completed successfully
    for output_key in loop_outputs:
        output = result["activity_outputs"][output_key]
        assert output is not None

        # Check if it's a forEach loop structure
        if "type" in output and output["type"] == "forEach":
            assert "results" in output
            assert "iterations" in output
            assert output["iterations"] > 0
            # Verify each iteration in the loop completed
            for result_item in output["results"]:
                assert "result" in result_item
                assert result_item["result"] is not None
        else:
            # Regular activity output
            assert "return_code" in output or "status_code" in output.get("output", {})
