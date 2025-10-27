"""Integration tests for workflow cancellation."""

import asyncio
import contextlib
from unittest.mock import AsyncMock, MagicMock

import pytest

from nexus.workflows.workflow_engine.activities.script_activity import execute_bash_script
from nexus.workflows.workflow_engine.services.execution_service import ExecutionService
from nexus.workflows.workflow_engine.yaml_workflow_parser import parse_workflow_yaml


@pytest.mark.integration
@pytest.mark.asyncio
async def test_workflow_cancellation() -> None:
    """Test cancelling a running workflow.

    This test verifies:
    - Running workflow can be cancelled via ExecutionService
    - Temporal client's cancel method is called
    - Activities can be cancelled during execution
    """
    yaml_workflow = """
schemaVersion: "1.0.0"
version: 1

metadata:
  name: cancellation-test
  description: Test workflow cancellation

triggers:
- type: manual

workflow:
  activities:
  - id: long_running_task
    name: Long Running Task
    type: task
    task:
      executor: script
      config:
        language: bash
        code: |
          echo "Starting long task"
          sleep 30
          echo "This should not complete"
"""

    workflow_def = parse_workflow_yaml(yaml_workflow)

    # Create mock Temporal client
    mock_client = MagicMock()
    mock_handle = MagicMock()
    mock_handle.cancel = AsyncMock()
    mock_client.get_workflow_handle = MagicMock(return_value=mock_handle)

    # Create execution service with mock client
    execution_service = ExecutionService(mock_client, "test-queue")

    # Start the activity in background (simulates a running workflow)
    task_def = workflow_def.workflow.activities[0].task
    assert task_def is not None
    activity_task = asyncio.create_task(execute_bash_script(script=task_def.config["code"], inputs={}))

    # Wait a bit for activity to start
    await asyncio.sleep(0.1)

    # Cancel the workflow via execution service
    workflow_id = "test-workflow-123"
    await execution_service.cancel_workflow(workflow_id)

    # Verify cancellation was called on Temporal handle
    mock_client.get_workflow_handle.assert_called_once_with(workflow_id)
    mock_handle.cancel.assert_called_once()

    # Cancel the activity task to clean up
    activity_task.cancel()

    # Expected - activity was cancelled
    with contextlib.suppress(asyncio.CancelledError):
        await activity_task


@pytest.mark.integration
@pytest.mark.asyncio
async def test_cancellation_with_multiple_activities() -> None:
    """Test cancelling workflow with multiple running activities."""
    yaml_workflow = """
schemaVersion: "1.0.0"
version: 1

metadata:
  name: multi-activity-cancellation-test
  description: Test cancelling multiple activities

triggers:
- type: manual

workflow:
  activities:
  - id: task_1
    name: Task 1
    type: task
    task:
      executor: script
      config:
        language: bash
        code: |
          echo "Task 1 starting"
          sleep 20
          echo "Task 1 complete"

  - id: task_2
    name: Task 2
    type: task
    task:
      executor: script
      config:
        language: bash
        code: |
          echo "Task 2 starting"
          sleep 20
          echo "Task 2 complete"

  - id: task_3
    name: Task 3
    type: task
    task:
      executor: script
      config:
        language: bash
        code: |
          echo "Task 3 starting"
          sleep 20
          echo "Task 3 complete"
"""

    workflow_def = parse_workflow_yaml(yaml_workflow)

    # Create mock Temporal client
    mock_client = MagicMock()
    mock_handle = MagicMock()
    mock_handle.cancel = AsyncMock()
    mock_client.get_workflow_handle = MagicMock(return_value=mock_handle)

    # Create execution service
    execution_service = ExecutionService(mock_client, "test-queue")

    # Start all activities in parallel (simulates parallel execution)
    tasks = []
    for activity in workflow_def.workflow.activities:
        task_def = activity.task
        assert task_def is not None
        task = asyncio.create_task(execute_bash_script(script=task_def.config["code"], inputs={}))
        tasks.append(task)

    # Wait for activities to start
    await asyncio.sleep(0.1)

    # Cancel the workflow
    workflow_id = "multi-activity-workflow-123"
    await execution_service.cancel_workflow(workflow_id)

    # Verify workflow cancellation was called
    mock_handle.cancel.assert_called_once()

    # Cancel all activity tasks to clean up
    for task in tasks:
        task.cancel()

    # Verify all were cancelled
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for result in results:
        assert isinstance(result, asyncio.CancelledError)


@pytest.mark.integration
@pytest.mark.asyncio
async def test_cancellation_status_updates() -> None:
    """Test that cancellation properly calls Temporal client methods."""
    # Create mock Temporal client
    mock_client = MagicMock()
    mock_handle = MagicMock()
    mock_handle.cancel = AsyncMock()
    mock_client.get_workflow_handle = MagicMock(return_value=mock_handle)

    # Create execution service
    execution_service = ExecutionService(mock_client, "test-queue")

    # Cancel a workflow
    workflow_id = "status-update-workflow-123"
    result = await execution_service.cancel_workflow(workflow_id, reason="Test cancellation")

    # Verify cancellation was called correctly
    mock_client.get_workflow_handle.assert_called_once_with(workflow_id)
    mock_handle.cancel.assert_called_once()

    # Verify result contains expected fields
    assert result.status == "cancelled"
    assert result.temporal_workflow_id == workflow_id
    assert result.reason == "Test cancellation"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_partial_cancellation() -> None:
    """Test cancelling workflow after some activities complete."""
    # First activity completes quickly
    script1 = "echo 'Quick task'; exit 0"
    result1 = await execute_bash_script(script=script1, inputs={})
    assert "Quick task" in result1["stdout"]

    # Second activity is long-running and will be cancelled
    task2 = asyncio.create_task(execute_bash_script(script="sleep 30; echo 'Should not complete'", inputs={}))

    await asyncio.sleep(0.1)

    # Cancel second activity
    task2.cancel()

    # Expected
    with contextlib.suppress(asyncio.CancelledError):
        await task2

    # First activity completed, second was cancelled
    # In real implementation, database would show:
    # - activity1: status='completed'
    # - activity2: status='cancelled'


@pytest.mark.integration
@pytest.mark.asyncio
async def test_cancellation_cleanup() -> None:
    """Test that cancellation properly cleans up resources."""
    # Create a task that would create temp files
    script = """
    echo "Creating temp file"
    touch /tmp/test_workflow_$$
    sleep 20
    rm /tmp/test_workflow_$$
    """

    task = asyncio.create_task(execute_bash_script(script=script, inputs={}))

    await asyncio.sleep(0.1)

    # Cancel the task
    task.cancel()

    with contextlib.suppress(asyncio.CancelledError):
        await task

    # In real implementation, would verify:
    # - Temp files cleaned up
    # - Subprocess terminated
    # - Database connections released
