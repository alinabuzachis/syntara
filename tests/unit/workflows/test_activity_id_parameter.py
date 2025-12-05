"""Unit tests for activity_id parameter in workflow.execute_activity calls.

These tests verify that the activity.id from the workflow definition is correctly
passed to Temporal's workflow.execute_activity function for both script and API executors.
"""

# SLF001: These tests specifically test private methods (_execute_script_executor, _execute_api_executor)

from datetime import timedelta
from http import HTTPMethod
from unittest.mock import AsyncMock, patch

import pytest

from nexus.workflows.workflow_engine.dynamic_workflow import DynamicWorkflow
from nexus.workflows.workflow_engine.models import (
    Activity,
    ActivityType,
    APIExecutorConfig,
    ExecutorType,
    ScriptExecutorConfig,
    ScriptLanguage,
    TaskDefinition,
)


class TestActivityIdParameter:
    """Test that activity_id is passed to workflow.execute_activity."""

    @pytest.mark.asyncio
    async def test_script_executor_passes_activity_id(self) -> None:
        """Test that script executor passes activity.id to workflow.execute_activity."""
        # Create a workflow instance
        workflow_instance = DynamicWorkflow()

        # Create a test activity with a specific ID
        activity = Activity(
            id="test_script_activity",
            type=ActivityType.TASK,
            task=TaskDefinition(
                executor=ExecutorType.SCRIPT,
                config=ScriptExecutorConfig(language=ScriptLanguage.BASH, code="echo 'test'"),
            ),
        )

        # Mock workflow.execute_activity to capture the call
        with patch("nexus.workflows.workflow_engine.dynamic_workflow.workflow") as mock_workflow:
            # Mock the execute_activity function
            mock_execute_activity = AsyncMock(return_value={"stdout": "test output", "stderr": "", "return_code": 0})
            mock_workflow.execute_activity = mock_execute_activity

            # Execute the script executor method
            await workflow_instance._execute_script_executor(
                activity=activity,
                task_inputs={},
                activity_timeout=timedelta(minutes=5),
                execution_id="test-exec-123",
            )

            # Verify execute_activity was called with activity_id
            mock_execute_activity.assert_called_once()
            call_kwargs = mock_execute_activity.call_args[1]

            # Assert that activity_id was passed and matches the activity.id
            assert "activity_id" in call_kwargs
            assert call_kwargs["activity_id"] == "test_script_activity"

    @pytest.mark.asyncio
    async def test_api_executor_passes_activity_id(self) -> None:
        """Test that API executor passes activity.id to workflow.execute_activity."""
        # Create a workflow instance
        workflow_instance = DynamicWorkflow()

        # Create a test activity with a specific ID
        activity = Activity(
            id="test_api_activity",
            type=ActivityType.TASK,
            task=TaskDefinition(
                executor=ExecutorType.API,
                config=APIExecutorConfig(
                    method=HTTPMethod.GET,
                    url="https://api.example.com/data",
                ),
            ),
        )

        # Mock workflow.execute_activity to capture the call
        with patch("nexus.workflows.workflow_engine.dynamic_workflow.workflow") as mock_workflow:
            # Mock the execute_activity function
            mock_execute_activity = AsyncMock(
                return_value={"status_code": 200, "body": {"result": "success"}, "headers": {}}
            )
            mock_workflow.execute_activity = mock_execute_activity

            # Execute the API executor method
            await workflow_instance._execute_api_executor(
                activity=activity,
                task_inputs={},
                activity_timeout=timedelta(minutes=5),
                execution_id="test-exec-456",
            )

            # Verify execute_activity was called with activity_id
            mock_execute_activity.assert_called_once()
            call_kwargs = mock_execute_activity.call_args[1]

            # Assert that activity_id was passed and matches the activity.id
            assert "activity_id" in call_kwargs
            assert call_kwargs["activity_id"] == "test_api_activity"

    @pytest.mark.asyncio
    async def test_multiple_activities_have_different_ids(self) -> None:
        """Test that different activities pass their respective IDs."""
        workflow_instance = DynamicWorkflow()

        # Create two different activities
        script_activity = Activity(
            id="fetch_data",
            type=ActivityType.TASK,
            task=TaskDefinition(
                executor=ExecutorType.SCRIPT,
                config=ScriptExecutorConfig(language=ScriptLanguage.PYTHON, code="print('data')"),
            ),
        )

        api_activity = Activity(
            id="send_notification",
            type=ActivityType.TASK,
            task=TaskDefinition(
                executor=ExecutorType.API,
                config=APIExecutorConfig(
                    method=HTTPMethod.POST,
                    url="https://api.example.com/notify",
                ),
            ),
        )

        with patch("nexus.workflows.workflow_engine.dynamic_workflow.workflow") as mock_workflow:
            mock_execute_activity = AsyncMock(return_value={"stdout": "output", "stderr": "", "return_code": 0})
            mock_workflow.execute_activity = mock_execute_activity

            # Execute first activity
            await workflow_instance._execute_script_executor(
                activity=script_activity,
                task_inputs={},
                activity_timeout=timedelta(minutes=5),
                execution_id="test-exec-multi",
            )

            # Check first call used correct ID
            first_call_kwargs = mock_execute_activity.call_args[1]
            assert first_call_kwargs["activity_id"] == "fetch_data"

            # Reset mock for second call
            mock_execute_activity.reset_mock()
            mock_execute_activity.return_value = {"status_code": 200, "body": {}, "headers": {}}

            # Execute second activity
            await workflow_instance._execute_api_executor(
                activity=api_activity,
                task_inputs={},
                activity_timeout=timedelta(minutes=5),
                execution_id="test-exec-multi",
            )

            # Check second call used correct ID
            second_call_kwargs = mock_execute_activity.call_args[1]
            assert second_call_kwargs["activity_id"] == "send_notification"

    @pytest.mark.asyncio
    async def test_activity_id_with_special_characters(self) -> None:
        """Test that activity IDs with underscores and numbers are passed correctly."""
        workflow_instance = DynamicWorkflow()

        # Activity IDs can contain letters, numbers, and underscores
        activity = Activity(
            id="process_data_v2_step1",
            type=ActivityType.TASK,
            task=TaskDefinition(
                executor=ExecutorType.SCRIPT,
                config=ScriptExecutorConfig(language=ScriptLanguage.BASH, code="echo test"),
            ),
        )

        with patch("nexus.workflows.workflow_engine.dynamic_workflow.workflow") as mock_workflow:
            mock_execute_activity = AsyncMock(return_value={"stdout": "test", "stderr": "", "return_code": 0})
            mock_workflow.execute_activity = mock_execute_activity

            await workflow_instance._execute_script_executor(
                activity=activity,
                task_inputs={},
                activity_timeout=timedelta(minutes=5),
                execution_id="test-exec-special",
            )

            call_kwargs = mock_execute_activity.call_args[1]
            assert call_kwargs["activity_id"] == "process_data_v2_step1"
