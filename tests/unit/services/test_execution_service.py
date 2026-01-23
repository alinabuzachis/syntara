"""Unit tests for TemporalExecutionService.

These tests use mocks to avoid requiring a real Temporal server.
Integration tests with a real Temporal server are in tests/integration/.
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, Mock, patch
from uuid import UUID

import pytest

from nexus.core.config.base import get_settings
from nexus.workflows.workflow_engine.services.temporal_execution_service import (
    TemporalExecutionService,
    create_temporal_execution_service,
)
from nexus.workflows.workflow_engine.yaml_workflow_parser import WorkflowParseError


class TestTemporalExecutionServiceInitialization:
    """Test TemporalExecutionService initialization."""

    def test_init_with_client(self) -> None:
        """Test initialization with Temporal client."""
        mock_client = Mock()
        service = TemporalExecutionService(temporal_client=mock_client, task_queue="test-queue")

        assert service.temporal_client is mock_client
        assert service.task_queue == "test-queue"

    def test_init_with_custom_task_queue(self) -> None:
        """Test initialization with custom task queue."""
        mock_client = Mock()
        service = TemporalExecutionService(temporal_client=mock_client, task_queue="custom-queue")

        assert service.temporal_client is mock_client
        assert service.task_queue == "custom-queue"


class TestStartYamlWorkflow:
    """Test starting workflows from YAML."""

    @pytest.mark.asyncio
    async def test_start_workflow_success(self) -> None:
        """Test successfully starting a workflow from YAML."""
        # Mock Temporal client
        mock_client = Mock()
        mock_handle = Mock()
        mock_handle.first_execution_run_id = "run-123"
        mock_client.start_workflow = AsyncMock(return_value=mock_handle)

        service = TemporalExecutionService(temporal_client=mock_client, task_queue="test-queue")

        yaml_workflow = """
schemaVersion: "1.0.0"
version: 1
metadata:
  name: test-workflow
  description: Test
triggers:
- type: manual
workflow:
  activities:
  - id: task1
    type: task
    task:
      executor: script
      config:
        language: bash
        code: echo "test"
"""

        result = await service.start_yaml_workflow(
            workflow_yaml=yaml_workflow,
            workflow_name="test-workflow",
            input_data={"user_id": 123},
        )

        # Verify result structure (Pydantic model)
        assert result.execution_id is not None
        assert result.workflow_id is not None
        assert result.temporal_workflow_id is not None
        assert result.temporal_run_id is not None
        assert result.status is not None
        assert result.started_at is not None

        # Verify values
        assert result.temporal_run_id == "run-123"
        assert result.status == "running"
        assert "test-workflow" in result.temporal_workflow_id

        # Verify UUID formats
        UUID(result.execution_id)
        UUID(result.workflow_id)

        # Verify Temporal client was called
        mock_client.start_workflow.assert_called_once()

    @pytest.mark.asyncio
    async def test_start_workflow_with_custom_id(self) -> None:
        """Test starting workflow with custom workflow ID."""
        mock_client = Mock()
        mock_handle = Mock()
        mock_handle.first_execution_run_id = "run-456"
        mock_client.start_workflow = AsyncMock(return_value=mock_handle)

        service = TemporalExecutionService(temporal_client=mock_client, task_queue="test-queue")

        yaml_workflow = """
schemaVersion: "1.0.0"
version: 1
metadata:
  name: test-workflow
  description: Test
triggers:
- type: manual
workflow:
  activities:
  - id: task1
    type: task
    task:
      executor: script
      config:
        language: bash
        code: echo "test"
"""

        result = await service.start_yaml_workflow(
            workflow_yaml=yaml_workflow,
            workflow_name="test-workflow",
            workflow_id="custom-workflow-id",
        )

        assert result.workflow_id == "custom-workflow-id"

    @pytest.mark.asyncio
    async def test_start_workflow_invalid_yaml(self) -> None:
        """Test starting workflow with invalid YAML."""
        mock_client = Mock()
        service = TemporalExecutionService(temporal_client=mock_client, task_queue="test-queue")

        invalid_yaml = """
schemaVersion: "1.0.0"
invalid yaml here!!!
"""

        with pytest.raises(WorkflowParseError, match="Invalid YAML syntax"):
            await service.start_yaml_workflow(
                workflow_yaml=invalid_yaml,
                workflow_name="test-workflow",
            )

    @pytest.mark.asyncio
    async def test_start_workflow_missing_required_fields(self) -> None:
        """Test starting workflow with missing required fields."""
        mock_client = Mock()
        service = TemporalExecutionService(temporal_client=mock_client, task_queue="test-queue")

        incomplete_yaml = """
schemaVersion: "1.0.0"
version: 1
"""

        with pytest.raises(WorkflowParseError, match="Workflow validation failed"):
            await service.start_yaml_workflow(
                workflow_yaml=incomplete_yaml,
                workflow_name="test-workflow",
            )

    @pytest.mark.asyncio
    async def test_start_workflow_temporal_error(self) -> None:
        """Test starting workflow when Temporal fails."""
        mock_client = Mock()
        mock_client.start_workflow = AsyncMock(side_effect=RuntimeError("Temporal connection failed"))

        service = TemporalExecutionService(temporal_client=mock_client, task_queue="test-queue")

        yaml_workflow = """
schemaVersion: "1.0.0"
version: 1
metadata:
  name: test-workflow
  description: Test
triggers:
- type: manual
workflow:
  activities:
  - id: task1
    type: task
    task:
      executor: script
      config:
        language: bash
        code: echo "test"
"""

        with pytest.raises(RuntimeError, match="Temporal connection failed"):
            await service.start_yaml_workflow(
                workflow_yaml=yaml_workflow,
                workflow_name="test-workflow",
            )


class TestGetWorkflowStatus:
    """Test getting workflow status."""

    @pytest.mark.asyncio
    async def test_get_status_running_workflow(self) -> None:
        """Test getting status of a running workflow."""
        # Mock workflow handle
        mock_handle = Mock()
        mock_description = Mock()
        mock_description.status.name = "RUNNING"
        mock_description.run_id = "run-123"
        mock_description.start_time = datetime(2024, 1, 1, 12, 0, 0, tzinfo=UTC)
        mock_description.close_time = None
        mock_handle.describe = AsyncMock(return_value=mock_description)

        # Mock client
        mock_client = Mock()
        mock_client.get_workflow_handle = Mock(return_value=mock_handle)

        service = TemporalExecutionService(temporal_client=mock_client, task_queue="test-queue")

        result = await service.get_workflow_status("workflow-123")

        assert result.temporal_workflow_id == "workflow-123"
        assert result.temporal_run_id == "run-123"
        assert result.status == "running"
        assert result.start_time == "2024-01-01T12:00:00+00:00"
        assert result.close_time is None

    @pytest.mark.asyncio
    async def test_get_status_completed_workflow(self) -> None:
        """Test getting status of a completed workflow."""
        mock_handle = Mock()
        mock_description = Mock()
        mock_description.status.name = "COMPLETED"
        mock_description.run_id = "run-456"
        mock_description.start_time = datetime(2024, 1, 1, 12, 0, 0, tzinfo=UTC)
        mock_description.close_time = datetime(2024, 1, 1, 12, 5, 0, tzinfo=UTC)
        mock_handle.describe = AsyncMock(return_value=mock_description)

        mock_client = Mock()
        mock_client.get_workflow_handle = Mock(return_value=mock_handle)

        service = TemporalExecutionService(temporal_client=mock_client, task_queue="test-queue")

        result = await service.get_workflow_status("workflow-456")

        assert result.status == "completed"
        assert result.close_time == "2024-01-01T12:05:00+00:00"

    @pytest.mark.asyncio
    async def test_get_status_workflow_not_found(self) -> None:
        """Test getting status of non-existent workflow."""
        mock_client = Mock()
        mock_client.get_workflow_handle = Mock(side_effect=Exception("Workflow not found"))

        service = TemporalExecutionService(temporal_client=mock_client, task_queue="test-queue")

        with pytest.raises(Exception, match="Workflow not found"):
            await service.get_workflow_status("nonexistent-workflow")


class TestGetWorkflowResult:
    """Test getting workflow results."""

    @pytest.mark.asyncio
    async def test_get_result_success(self) -> None:
        """Test getting result from completed workflow."""
        expected_result = {
            "status": "completed",
            "execution_id": "exec-123",
            "activity_outputs": {"task1": {"stdout": "test output", "return_code": 0}},
            "completed_activities": ["task1"],
        }

        mock_handle = Mock()
        mock_handle.result = AsyncMock(return_value=expected_result)

        mock_client = Mock()
        mock_client.get_workflow_handle = Mock(return_value=mock_handle)

        service = TemporalExecutionService(temporal_client=mock_client, task_queue="test-queue")

        result = await service.get_workflow_result("workflow-123")

        # Verify result is a Pydantic model with expected values
        assert result.status == "completed"
        assert result.execution_id == "exec-123"
        assert result.activity_outputs == {"task1": {"stdout": "test output", "return_code": 0}}
        assert result.completed_activities == ["task1"]
        mock_handle.result.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_get_result_workflow_failed(self) -> None:
        """Test getting result when workflow failed."""
        mock_handle = Mock()
        mock_handle.result = AsyncMock(side_effect=RuntimeError("Workflow execution failed"))

        mock_client = Mock()
        mock_client.get_workflow_handle = Mock(return_value=mock_handle)

        service = TemporalExecutionService(temporal_client=mock_client, task_queue="test-queue")

        with pytest.raises(RuntimeError, match="Workflow execution failed"):
            await service.get_workflow_result("failed-workflow")


class TestCancelWorkflow:
    """Test cancelling workflows."""

    @pytest.mark.asyncio
    async def test_cancel_workflow_success(self) -> None:
        """Test successfully cancelling a workflow."""
        mock_handle = Mock()
        mock_handle.cancel = AsyncMock()

        mock_client = Mock()
        mock_client.get_workflow_handle = Mock(return_value=mock_handle)

        service = TemporalExecutionService(temporal_client=mock_client, task_queue="test-queue")

        result = await service.cancel_workflow("workflow-123", reason="User requested")

        assert result.temporal_workflow_id == "workflow-123"
        assert result.status == "cancelled"
        assert result.reason == "User requested"
        assert result.cancelled_at is not None

        mock_handle.cancel.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_cancel_workflow_no_reason(self) -> None:
        """Test cancelling workflow without providing reason."""
        mock_handle = Mock()
        mock_handle.cancel = AsyncMock()

        mock_client = Mock()
        mock_client.get_workflow_handle = Mock(return_value=mock_handle)

        service = TemporalExecutionService(temporal_client=mock_client, task_queue="test-queue")

        result = await service.cancel_workflow("workflow-123")

        assert result.reason is None

    @pytest.mark.asyncio
    async def test_cancel_workflow_fails(self) -> None:
        """Test cancellation failure."""
        mock_handle = Mock()
        mock_handle.cancel = AsyncMock(side_effect=RuntimeError("Cannot cancel completed workflow"))

        mock_client = Mock()
        mock_client.get_workflow_handle = Mock(return_value=mock_handle)

        service = TemporalExecutionService(temporal_client=mock_client, task_queue="test-queue")

        with pytest.raises(RuntimeError, match="Cannot cancel completed workflow"):
            await service.cancel_workflow("workflow-123")


class TestTerminateWorkflow:
    """Test terminating workflows."""

    @pytest.mark.asyncio
    async def test_terminate_workflow_success(self) -> None:
        """Test successfully terminating a workflow."""
        mock_handle = Mock()
        mock_handle.terminate = AsyncMock()

        mock_client = Mock()
        mock_client.get_workflow_handle = Mock(return_value=mock_handle)

        service = TemporalExecutionService(temporal_client=mock_client, task_queue="test-queue")

        result = await service.terminate_workflow("workflow-123", reason="Emergency stop")

        assert result.temporal_workflow_id == "workflow-123"
        assert result.status == "terminated"
        assert result.reason == "Emergency stop"
        assert result.terminated_at is not None

        mock_handle.terminate.assert_awaited_once_with(reason="Emergency stop")

    @pytest.mark.asyncio
    async def test_terminate_workflow_no_reason(self) -> None:
        """Test terminating workflow without providing reason."""
        mock_handle = Mock()
        mock_handle.terminate = AsyncMock()

        mock_client = Mock()
        mock_client.get_workflow_handle = Mock(return_value=mock_handle)

        service = TemporalExecutionService(temporal_client=mock_client, task_queue="test-queue")

        result = await service.terminate_workflow("workflow-123")

        assert result.reason is None
        mock_handle.terminate.assert_awaited_once_with(reason=None)

    @pytest.mark.asyncio
    async def test_terminate_workflow_fails(self) -> None:
        """Test termination failure."""
        mock_handle = Mock()
        mock_handle.terminate = AsyncMock(side_effect=RuntimeError("Termination failed"))

        mock_client = Mock()
        mock_client.get_workflow_handle = Mock(return_value=mock_handle)

        service = TemporalExecutionService(temporal_client=mock_client, task_queue="test-queue")

        with pytest.raises(RuntimeError, match="Termination failed"):
            await service.terminate_workflow("workflow-123")


class TestCreateTemporalExecutionService:
    """Test factory function for creating execution service."""

    @pytest.mark.asyncio
    async def test_create_temporal_execution_service_defaults(self) -> None:
        """Test creating execution service with default parameters."""
        mock_client = Mock()

        with patch("nexus.workflows.workflow_engine.services.temporal_execution_service.Client") as mock_client_class:
            mock_client_class.connect = AsyncMock(return_value=mock_client)

            service = await create_temporal_execution_service()

            assert isinstance(service, TemporalExecutionService)
            assert service.temporal_client is mock_client
            assert service.task_queue == get_settings().task_queue

            mock_client_class.connect.assert_awaited_once_with(
                get_settings().temporal_address,
                namespace=get_settings().temporal_namespace,
            )

    @pytest.mark.asyncio
    async def test_create_temporal_execution_service_custom_params(self) -> None:
        """Test creating execution service with custom parameters."""
        mock_client = Mock()

        with patch("nexus.workflows.workflow_engine.services.temporal_execution_service.Client") as mock_client_class:
            mock_client_class.connect = AsyncMock(return_value=mock_client)

            service = await create_temporal_execution_service(
                temporal_address="temporal.example.com:7233",
                namespace="production",
                task_queue="prod-queue",
            )

            assert service.task_queue == "prod-queue"

            mock_client_class.connect.assert_awaited_once_with(
                "temporal.example.com:7233",
                namespace="production",
            )


class TestWorkflowDataConversion:
    """Test workflow definition data conversion."""

    @pytest.mark.asyncio
    async def test_workflow_def_converted_to_dict(self) -> None:
        """Test that workflow definition is properly converted to dict for Temporal."""
        mock_client = Mock()
        mock_handle = Mock()
        mock_handle.first_execution_run_id = "run-123"

        # Capture the arguments passed to start_workflow
        captured_args: list[object] = []

        def capture_and_return(*args: object, **kwargs: object) -> Mock:
            """Capture args from start_workflow call."""
            args_list = kwargs.get("args")
            if isinstance(args_list, list):
                captured_args.extend(args_list)
            return mock_handle

        mock_client.start_workflow = AsyncMock(side_effect=capture_and_return)

        service = TemporalExecutionService(temporal_client=mock_client, task_queue="test-queue")

        yaml_workflow = """
schemaVersion: "1.0.0"
version: 1
metadata:
  name: test-workflow
  description: Test
triggers:
- type: manual
workflow:
  activities:
  - id: task1
    type: task
    task:
      executor: script
      config:
        language: bash
        code: echo "test"
"""

        await service.start_yaml_workflow(
            workflow_yaml=yaml_workflow,
            workflow_name="test-workflow",
        )

        # Verify first argument is a dict (converted from Pydantic model)
        assert len(captured_args) >= 1
        workflow_def_arg = captured_args[0]
        assert isinstance(workflow_def_arg, dict)
        assert "schemaVersion" in workflow_def_arg
        assert workflow_def_arg["schemaVersion"] == "1.0.0"
