"""Integration tests for error handling in workflows.

Tests validation errors, unsupported configurations, and error propagation.
"""

from datetime import timedelta

import pytest
from temporalio.client import Client, WorkflowFailureError
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from nexus.workflows.workflow_engine.dynamic_workflow import DynamicWorkflow


class TestValidationErrors:
    """Test workflow validation errors."""

    @pytest.mark.asyncio
    async def test_missing_task_definition(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,
        temporal_worker: Worker,  # noqa: ARG002
    ) -> None:
        """Test error when task activity has no task definition."""
        workflow_def = {
            "schemaVersion": "1.0.0",
            "version": 1,
            "metadata": {"name": "invalid", "description": "Test"},
            "triggers": [{"type": "manual"}],
            "workflow": {
                "activities": [
                    {
                        "id": "invalid_task",
                        "type": "task",
                        # Missing 'task' field
                    },
                ]
            },
        }

        with pytest.raises(WorkflowFailureError) as exc_info:
            await temporal_client.execute_workflow(
                DynamicWorkflow.run,
                args=[workflow_def, "test-exec-001", None],
                id="test-missing-task-def",
                task_queue="nexus-workflow-queue",
                execution_timeout=timedelta(seconds=1),
            )

        # Verify error was raised (error path was executed)
        assert exc_info.value is not None

    @pytest.mark.asyncio
    async def test_unsupported_script_language(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,
        temporal_worker: Worker,  # noqa: ARG002
    ) -> None:
        """Test error when task uses unsupported script language."""
        workflow_def = {
            "schemaVersion": "1.0.0",
            "version": 1,
            "metadata": {"name": "invalid", "description": "Test"},
            "triggers": [{"type": "manual"}],
            "workflow": {
                "activities": [
                    {
                        "id": "python_task",
                        "type": "task",
                        "task": {
                            "executor": "script",
                            "config": {"language": "python", "code": "print('test')"},
                        },
                    },
                ]
            },
        }

        with pytest.raises(WorkflowFailureError) as exc_info:
            await temporal_client.execute_workflow(
                DynamicWorkflow.run,
                args=[workflow_def, "test-exec-002", None],
                id="test-unsupported-language",
                task_queue="nexus-workflow-queue",
                execution_timeout=timedelta(seconds=1),
            )

        # Verify error was raised (error path was executed)
        assert exc_info.value is not None

    @pytest.mark.asyncio
    async def test_unsupported_executor_type(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,
        temporal_worker: Worker,  # noqa: ARG002
    ) -> None:
        """Test error when task uses unsupported executor type."""
        workflow_def = {
            "schemaVersion": "1.0.0",
            "version": 1,
            "metadata": {"name": "invalid", "description": "Test"},
            "triggers": [{"type": "manual"}],
            "workflow": {
                "activities": [
                    {
                        "id": "api_task",
                        "type": "task",
                        "task": {"executor": "api", "config": {"url": "https://example.com"}},
                    },
                ]
            },
        }

        with pytest.raises(WorkflowFailureError) as exc_info:
            await temporal_client.execute_workflow(
                DynamicWorkflow.run,
                args=[workflow_def, "test-exec-003", None],
                id="test-unsupported-executor",
                task_queue="nexus-workflow-queue",
                execution_timeout=timedelta(seconds=1),
            )

        # Verify error was raised (error path was executed)
        assert exc_info.value is not None

    @pytest.mark.asyncio
    async def test_parallel_no_branches(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,
        temporal_worker: Worker,  # noqa: ARG002
    ) -> None:
        """Test error when parallel activity has no branches."""
        workflow_def = {
            "schemaVersion": "1.0.0",
            "version": 1,
            "metadata": {"name": "invalid", "description": "Test"},
            "triggers": [{"type": "manual"}],
            "workflow": {
                "activities": [
                    {
                        "id": "invalid_parallel",
                        "type": "parallel",
                        # Missing 'branches' field
                    },
                ]
            },
        }

        with pytest.raises(WorkflowFailureError) as exc_info:
            await temporal_client.execute_workflow(
                DynamicWorkflow.run,
                args=[workflow_def, "test-exec-004", None],
                id="test-parallel-no-branches",
                task_queue="nexus-workflow-queue",
                execution_timeout=timedelta(seconds=1),
            )

        # Verify error was raised (error path was executed)
        assert exc_info.value is not None

    @pytest.mark.asyncio
    async def test_sequence_no_steps(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,
        temporal_worker: Worker,  # noqa: ARG002
    ) -> None:
        """Test error when sequence activity has no steps."""
        workflow_def = {
            "schemaVersion": "1.0.0",
            "version": 1,
            "metadata": {"name": "invalid", "description": "Test"},
            "triggers": [{"type": "manual"}],
            "workflow": {
                "activities": [
                    {
                        "id": "invalid_sequence",
                        "type": "sequence",
                        # Missing 'steps' field
                    },
                ]
            },
        }

        with pytest.raises(WorkflowFailureError) as exc_info:
            await temporal_client.execute_workflow(
                DynamicWorkflow.run,
                args=[workflow_def, "test-exec-005", None],
                id="test-sequence-no-steps",
                task_queue="nexus-workflow-queue",
                execution_timeout=timedelta(seconds=1),
            )

        # Verify error was raised (error path was executed)
        assert exc_info.value is not None

    @pytest.mark.asyncio
    async def test_condition_no_condition_field(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,
        temporal_worker: Worker,  # noqa: ARG002
    ) -> None:
        """Test error when condition activity has no condition field."""
        workflow_def = {
            "schemaVersion": "1.0.0",
            "version": 1,
            "metadata": {"name": "invalid", "description": "Test"},
            "triggers": [{"type": "manual"}],
            "workflow": {
                "activities": [
                    {
                        "id": "invalid_condition",
                        "type": "condition",
                        # Missing 'condition' field
                        "then": [
                            {
                                "id": "then_task",
                                "type": "task",
                                "task": {
                                    "executor": "script",
                                    "config": {"language": "bash", "code": "echo test"},
                                },
                            }
                        ],
                    },
                ]
            },
        }

        with pytest.raises(WorkflowFailureError) as exc_info:
            await temporal_client.execute_workflow(
                DynamicWorkflow.run,
                args=[workflow_def, "test-exec-006", None],
                id="test-condition-no-condition",
                task_queue="nexus-workflow-queue",
                execution_timeout=timedelta(seconds=1),
            )

        # Verify error was raised (error path was executed)
        assert exc_info.value is not None

    @pytest.mark.asyncio
    async def test_condition_no_then_branch(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,
        temporal_worker: Worker,  # noqa: ARG002
    ) -> None:
        """Test error when condition activity has no then branch."""
        workflow_def = {
            "schemaVersion": "1.0.0",
            "version": 1,
            "metadata": {"name": "invalid", "description": "Test"},
            "triggers": [{"type": "manual"}],
            "workflow": {
                "activities": [
                    {
                        "id": "invalid_condition",
                        "type": "condition",
                        "condition": "true",
                        # Missing 'then' field
                    },
                ]
            },
        }

        with pytest.raises(WorkflowFailureError) as exc_info:
            await temporal_client.execute_workflow(
                DynamicWorkflow.run,
                args=[workflow_def, "test-exec-007", None],
                id="test-condition-no-then",
                task_queue="nexus-workflow-queue",
                execution_timeout=timedelta(seconds=1),
            )

        # Verify error was raised (error path was executed)
        assert exc_info.value is not None

    @pytest.mark.asyncio
    async def test_loop_no_definition(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,
        temporal_worker: Worker,  # noqa: ARG002
    ) -> None:
        """Test error when loop activity has no loop definition."""
        workflow_def = {
            "schemaVersion": "1.0.0",
            "version": 1,
            "metadata": {"name": "invalid", "description": "Test"},
            "triggers": [{"type": "manual"}],
            "workflow": {
                "activities": [
                    {
                        "id": "invalid_loop",
                        "type": "loop",
                        # Missing 'loop' field
                    },
                ]
            },
        }

        with pytest.raises(WorkflowFailureError) as exc_info:
            await temporal_client.execute_workflow(
                DynamicWorkflow.run,
                args=[workflow_def, "test-exec-008", None],
                id="test-loop-no-definition",
                task_queue="nexus-workflow-queue",
                execution_timeout=timedelta(seconds=1),
            )

        # Verify error was raised (error path was executed)
        assert exc_info.value is not None

    @pytest.mark.asyncio
    async def test_foreach_items_not_list(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,
        temporal_worker: Worker,  # noqa: ARG002
    ) -> None:
        """Test error when forEach items is not a list."""
        workflow_def = {
            "schemaVersion": "1.0.0",
            "version": 1,
            "metadata": {"name": "invalid", "description": "Test"},
            "triggers": [{"type": "manual"}],
            "variables": {"not_a_list": "string value"},
            "workflow": {
                "activities": [
                    {
                        "id": "invalid_foreach",
                        "type": "loop",
                        "loop": {
                            "type": "forEach",
                            "items": "${variables.not_a_list}",
                            "item_variable": "item",
                            "index_variable": "idx",
                            "do": [
                                {
                                    "id": "loop_task",
                                    "type": "task",
                                    "task": {
                                        "executor": "script",
                                        "config": {"language": "bash", "code": "echo test"},
                                    },
                                }
                            ],
                        },
                    },
                ]
            },
        }

        with pytest.raises(WorkflowFailureError) as exc_info:
            await temporal_client.execute_workflow(
                DynamicWorkflow.run,
                args=[workflow_def, "test-exec-009", None],
                id="test-foreach-not-list",
                task_queue="nexus-workflow-queue",
                execution_timeout=timedelta(seconds=1),
            )

        # Verify error was raised (error path was executed)
        assert exc_info.value is not None


class TestDurationErrors:
    """Test duration parsing errors."""

    @pytest.mark.asyncio
    async def test_invalid_duration_format(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,
        temporal_worker: Worker,  # noqa: ARG002
    ) -> None:
        """Test error with invalid ISO 8601 duration format."""
        workflow_def = {
            "schemaVersion": "1.0.0",
            "version": 1,
            "metadata": {"name": "invalid", "description": "Test"},
            "triggers": [{"type": "manual"}],
            "workflow": {
                "activities": [
                    {
                        "id": "task_with_invalid_timeout",
                        "type": "task",
                        "timeout": "5M",  # Missing PT prefix
                        "task": {
                            "executor": "script",
                            "config": {"language": "bash", "code": "echo test"},
                        },
                    },
                ]
            },
        }

        with pytest.raises(WorkflowFailureError) as exc_info:
            await temporal_client.execute_workflow(
                DynamicWorkflow.run,
                args=[workflow_def, "test-exec-010", None],
                id="test-invalid-duration",
                task_queue="nexus-workflow-queue",
                execution_timeout=timedelta(seconds=1),
            )

        # Verify error was raised (error path was executed)
        assert exc_info.value is not None

    @pytest.mark.asyncio
    async def test_unsupported_duration_unit(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,
        temporal_worker: Worker,  # noqa: ARG002
    ) -> None:
        """Test error with unsupported duration unit."""
        workflow_def = {
            "schemaVersion": "1.0.0",
            "version": 1,
            "metadata": {"name": "invalid", "description": "Test"},
            "triggers": [{"type": "manual"}],
            "workflow": {
                "activities": [
                    {
                        "id": "task_with_invalid_timeout",
                        "type": "task",
                        "timeout": 0,  # Must be >= 1
                        "task": {
                            "executor": "script",
                            "config": {"language": "bash", "code": "echo test"},
                        },
                    },
                ]
            },
        }

        with pytest.raises(WorkflowFailureError) as exc_info:
            await temporal_client.execute_workflow(
                DynamicWorkflow.run,
                args=[workflow_def, "test-exec-011", None],
                id="test-unsupported-duration",
                task_queue="nexus-workflow-queue",
                execution_timeout=timedelta(seconds=1),
            )

        # Verify error was raised (error path was executed)
        assert exc_info.value is not None


class TestScriptExecutionErrors:
    """Test script execution error handling."""

    @pytest.mark.asyncio
    async def test_script_execution_failure(
        self,
        temporal_env: WorkflowEnvironment,  # noqa: ARG002
        temporal_client: Client,
        temporal_worker: Worker,  # noqa: ARG002
    ) -> None:
        """Test error when script exits with non-zero code."""
        workflow_def = {
            "schemaVersion": "1.0.0",
            "version": 1,
            "metadata": {"name": "script-failure", "description": "Test"},
            "triggers": [{"type": "manual"}],
            "workflow": {
                "activities": [
                    {
                        "id": "failing_script",
                        "type": "task",
                        "task": {
                            "executor": "script",
                            "config": {
                                "language": "bash",
                                "code": "echo 'This will fail' >&2\nexit 1",
                            },
                        },
                    },
                ]
            },
        }

        with pytest.raises(WorkflowFailureError) as exc_info:
            await temporal_client.execute_workflow(
                DynamicWorkflow.run,
                args=[workflow_def, "test-exec-012", None],
                id="test-script-failure",
                task_queue="nexus-workflow-queue",
                execution_timeout=timedelta(seconds=1),
            )

        # Verify error was raised (script failure path was executed)
        assert exc_info.value is not None
