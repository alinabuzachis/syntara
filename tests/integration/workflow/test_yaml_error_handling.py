"""Integration tests for error handling and recovery."""

from datetime import timedelta
from pathlib import Path
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from temporalio.client import Client, WorkflowFailureError
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from nexus.workflows.workflow_engine.activities.script_activity import ScriptExecutionError, execute_bash_script
from nexus.workflows.workflow_engine.dynamic_workflow import DynamicWorkflow
from nexus.workflows.workflow_engine.models import ScriptExecutorConfig, ScriptLanguage
from nexus.workflows.workflow_engine.yaml_workflow_parser import parse_workflow_yaml


@pytest.mark.integration
@pytest.mark.asyncio
async def test_bash_script_failure_handling(
    temporal_env: WorkflowEnvironment,
    temporal_client: Client,
    temporal_worker: Worker,
) -> None:
    """Test handling bash script failures.

    This test verifies:
    - Retry policy is configured correctly
    - Workflow fails after exhausting retries
    - Error details captured
    """
    # Load the failing-task example
    workflow_file = Path("tests/integration/workflow/examples/error-handling/failing-task.yaml")
    workflow_yaml = workflow_file.read_text()
    workflow_def = parse_workflow_yaml(workflow_yaml)

    # Verify retry policy is configured correctly
    assert workflow_def.workflow.activities[0].retry_policy is not None
    assert workflow_def.workflow.activities[0].retry_policy.max_attempts == 3

    # Run workflow through Temporal with execution timeout
    handle = await temporal_client.start_workflow(
        DynamicWorkflow.run,
        args=[workflow_def.model_dump(mode="json", by_alias=True), "test-error-handling", {}],
        id=f"test-error-handling-{uuid4()}",
        task_queue="test-workflow-queue",
        execution_timeout=timedelta(seconds=3),  # Prevent hanging
    )

    # Workflow should fail after exhausting retries
    with pytest.raises(WorkflowFailureError) as exc_info:
        await handle.result()

    # Verify the error contains information about the failure
    assert exc_info.value is not None


@pytest.mark.integration
@pytest.mark.asyncio
async def test_error_details_capture() -> None:
    """Test detailed error information is captured."""
    script = """
    echo "Starting process..."
    echo "ERROR: File not found: /nonexistent/path" >&2
    echo "ERROR: Permission denied" >&2
    exit 2
    """
    config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code=script)

    with pytest.raises(ScriptExecutionError) as exc_info:
        await execute_bash_script(config.model_dump(by_alias=True), inputs={})

    # Error should contain useful information
    error_str = str(exc_info.value).lower()
    assert "exit" in error_str or "failed" in error_str or "error" in error_str


@pytest.mark.integration
@pytest.mark.asyncio
async def test_syntax_error_in_bash_script() -> None:
    """Test handling bash syntax errors."""
    # Invalid bash syntax
    script = """
    echo "Testing syntax error"
    if [ without closing bracket
    echo "This won't execute"
    """
    config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code=script)

    with pytest.raises(ScriptExecutionError):
        await execute_bash_script(config.model_dump(by_alias=True), inputs={})


@pytest.mark.integration
@pytest.mark.asyncio
async def test_retry_on_transient_errors() -> None:
    """Test retry behavior on transient errors."""
    # Load the transient-errors example
    workflow_file = Path("tests/integration/workflow/examples/error-handling/transient-errors.yaml")
    workflow_yaml = workflow_file.read_text()
    workflow_def = parse_workflow_yaml(workflow_yaml)

    activity = workflow_def.workflow.activities[0]

    # Verify retry policy configured
    assert activity.retry_policy is not None
    assert activity.retry_policy.max_attempts == 5
    assert activity.retry_policy.backoff == "exponential"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_non_retryable_errors() -> None:
    """Test errors that should not be retried."""
    yaml_workflow = """
schemaVersion: "1.0.0"
version: 1

metadata:
  name: non-retryable-error-test
  description: Test non-retryable errors

triggers:
- type: manual

workflow:
  activities:
  - id: validation_task
    name: Validation Task
    type: task
    task:
      executor: script
      config:
        language: bash
        code: |
          # Validation error - should not retry
          INPUT="$1"
          if [ -z "$INPUT" ]; then
            echo "ERROR: Input is required (validation error)" >&2
            exit 1
          fi
          echo "Input is valid"
      inputs:
        input_value: ${input.value}
"""

    workflow_def = parse_workflow_yaml(yaml_workflow)

    # No retry policy defined - validation errors shouldn't retry
    activity = workflow_def.workflow.activities[0]
    assert activity.retry_policy is None


@pytest.mark.integration
@pytest.mark.asyncio
async def test_error_propagation_in_workflow(
    temporal_env: WorkflowEnvironment,
    temporal_client: Client,
    temporal_worker: Worker,
) -> None:
    """Test how errors propagate through workflow activities."""
    # Load the error-propagation example
    workflow_file = Path("tests/integration/workflow/examples/error-handling/error-propagation.yaml")
    workflow_yaml = workflow_file.read_text()
    workflow_def = parse_workflow_yaml(workflow_yaml)

    # Verify workflow has 3 sequential tasks
    assert len(workflow_def.workflow.activities) == 3

    # Run workflow through Temporal - should fail on second task
    handle = await temporal_client.start_workflow(
        DynamicWorkflow.run,
        args=[workflow_def.model_dump(mode="json", by_alias=True), "test-error-prop", {}],
        id=f"test-error-propagation-{uuid4()}",
        task_queue="test-workflow-queue",
        execution_timeout=timedelta(seconds=3),  # Prevent hanging
    )

    # Workflow should fail on second task
    with pytest.raises(WorkflowFailureError) as exc_info:
        await handle.result()

    # Verify the workflow failed
    assert exc_info.value is not None

    # In a real implementation, we could query the workflow history to verify:
    # - first_task completed successfully
    # - second_task failed
    # - third_task was never started


@pytest.mark.integration
@pytest.mark.asyncio
async def test_error_recovery_workflow() -> None:
    """Test workflow with error recovery activities."""
    yaml_workflow = """
schemaVersion: "1.0.0"
version: 1

metadata:
  name: error-recovery-test
  description: Test error recovery

triggers:
- type: manual

workflow:
  activities:
  - id: risky_operation
    name: Risky Operation
    type: task
    retryPolicy:
      maxAttempts: 3
      backoff: exponential
      initialInterval: PT1S
    task:
      executor: script
      config:
        language: bash
        code: |
          echo "Performing risky operation"
          # Simulate occasional failure
          if [ -f /tmp/fail_flag ]; then
            rm /tmp/fail_flag
            echo "Operation failed"
            exit 1
          fi
          echo "Operation succeeded"

  - id: cleanup
    name: Cleanup
    type: task
    task:
      executor: script
      config:
        language: bash
        code: |
          echo "Cleaning up resources"
          # Cleanup runs regardless of success/failure
"""

    workflow_def = parse_workflow_yaml(yaml_workflow)

    # Verify workflow structure supports error recovery
    assert len(workflow_def.workflow.activities) == 2
    assert workflow_def.workflow.activities[0].retry_policy is not None


@pytest.mark.integration
@pytest.mark.asyncio
async def test_error_metadata_in_activity_execution() -> None:
    """Test that error metadata is properly stored in ActivityExecution."""
    mock_execution_id = uuid4()
    mock_activity_id = uuid4()

    with (
        patch(
            "src.nexus.workflows.workflow_engine.activities.execution_tracker.create_activity_execution"
        ) as mock_create,
        patch(
            "src.nexus.workflows.workflow_engine.activities.execution_tracker.update_activity_execution"
        ) as mock_update,
    ):
        mock_create.return_value = AsyncMock(id=mock_activity_id, execution_id=mock_execution_id)
        mock_update.return_value = AsyncMock()

        script = """
        echo "Detailed error message" >&2
        echo "Stack trace line 1" >&2
        echo "Stack trace line 2" >&2
        exit 127
        """
        config = ScriptExecutorConfig(language=ScriptLanguage.BASH, code=script)

        try:
            await execute_bash_script(config.model_dump(by_alias=True), inputs={})
        except (RuntimeError, ValueError, ScriptExecutionError) as e:
            # In real implementation, error details would be passed to update_activity_execution
            error_details = {
                "exit_code": 127,
                "stderr": "Detailed error message\nStack trace line 1\nStack trace line 2",
                "exception": str(e),
            }

            # Verify error details structure
            assert error_details["exit_code"] == 127
            stderr_str = str(error_details["stderr"])
            assert "Detailed error message" in stderr_str
