"""Unit tests for TemporalExecutionService.

These tests use mocks to avoid requiring a real Temporal server.
Integration tests with a real Temporal server are in tests/integration/.
"""

from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, Mock, patch
from uuid import UUID

import pytest
import yaml

from nexus.core.config.base import get_settings
from nexus.core.exceptions import SafeValueError
from nexus.workflows.workflow_engine.services.temporal_execution_service import (
    TemporalExecutionService,
    create_temporal_execution_service,
)


@pytest.fixture
def valid_workflow_dict() -> dict[str, Any]:
    """Fixture providing a valid V2 workflow definition as dict."""
    return {
        "schema_version": "2.0.0",
        "name": "test-workflow",
        "description": "Test",
        "triggers": [{"id": "trigger_manual", "type": "manual_trigger"}],
        "nodes": [
            {
                "id": "task1",
                "type": "script",
                "config": {"language": "bash", "code": "echo test"},
            }
        ],
        "edges": [{"from": "trigger_manual", "to": "task1"}],
    }


@pytest.fixture
def valid_workflow_yaml(valid_workflow_dict: dict[str, Any]) -> str:
    """Fixture providing a valid workflow definition as YAML string."""
    return yaml.dump(valid_workflow_dict)


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


class TestStartWorkflow:
    """Test starting workflows from dict format."""

    @pytest.mark.asyncio
    async def test_start_workflow_success(
        self,
        valid_workflow_dict: dict[str, Any],
    ) -> None:
        """Test successfully starting a workflow."""
        # Mock Temporal client
        mock_client = Mock()
        mock_handle = Mock()
        mock_handle.first_execution_run_id = "run-123"
        mock_client.start_workflow = AsyncMock(return_value=mock_handle)

        service = TemporalExecutionService(temporal_client=mock_client, task_queue="test-queue")

        result = await service.start_workflow(
            workflow_def=valid_workflow_dict,
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
    async def test_start_workflow_with_custom_id(
        self,
        valid_workflow_dict: dict[str, Any],
    ) -> None:
        """Test starting workflow with custom workflow ID."""
        mock_client = Mock()
        mock_handle = Mock()
        mock_handle.first_execution_run_id = "run-456"
        mock_client.start_workflow = AsyncMock(return_value=mock_handle)

        service = TemporalExecutionService(temporal_client=mock_client, task_queue="test-queue")

        result = await service.start_workflow(
            workflow_def=valid_workflow_dict,
            workflow_name="test-workflow",
            workflow_id="custom-workflow-id",
        )

        assert result.workflow_id == "custom-workflow-id"

    @pytest.mark.asyncio
    async def test_start_workflow_temporal_error(
        self,
        valid_workflow_dict: dict[str, Any],
    ) -> None:
        """Test starting workflow when Temporal fails."""
        mock_client = Mock()
        mock_client.start_workflow = AsyncMock(side_effect=RuntimeError("Temporal connection failed"))

        service = TemporalExecutionService(temporal_client=mock_client, task_queue="test-queue")

        with pytest.raises(RuntimeError, match="Temporal connection failed"):
            await service.start_workflow(
                workflow_def=valid_workflow_dict,
                workflow_name="test-workflow",
            )

    @pytest.mark.asyncio
    async def test_start_workflow_invalid_definition(self) -> None:
        """Test starting workflow with dict missing required fields."""
        mock_client = Mock()
        service = TemporalExecutionService(temporal_client=mock_client, task_queue="test-queue")

        # Invalid dict missing required V2 fields (no schema_version)
        invalid_dict = {"schema_version": "1.0.0"}

        with pytest.raises(SafeValueError, match="Unsupported schema_version"):
            await service.start_workflow(
                workflow_def=invalid_dict,
                workflow_name="test-workflow",
            )


class TestTriggerSelection:
    """Test trigger node selection logic for multi-trigger workflows."""

    # NexusWorkflow.run signature: (workflow_def, execution_id, trigger_node_id, ...)
    TRIGGER_NODE_ID_ARG_INDEX = 2

    def _get_trigger_node_id_from_call(self, mock_client: Mock) -> str:
        """Extract trigger_node_id passed to NexusWorkflow.run from the mock call."""
        call_kwargs = mock_client.start_workflow.call_args
        temporal_args = call_kwargs.kwargs.get("args") or call_kwargs[1].get("args")
        expected_min = self.TRIGGER_NODE_ID_ARG_INDEX + 1
        assert len(temporal_args) >= expected_min, (
            f"Expected at least {expected_min} args to NexusWorkflow.run, got {len(temporal_args)}"
        )
        return str(temporal_args[self.TRIGGER_NODE_ID_ARG_INDEX])

    @pytest.mark.asyncio
    async def test_start_workflow_defaults_to_first_trigger(self) -> None:
        """When trigger_node_id is not specified, use triggers[0]."""
        multi_trigger_workflow = {
            "schema_version": "2.0.0",
            "triggers": [
                {"id": "trigger_1", "type": "manual_trigger", "config": {}},
                {"id": "trigger_2", "type": "manual_trigger", "config": {}},
            ],
            "nodes": [],
            "edges": [],
        }

        mock_client = Mock()
        mock_handle = Mock()
        mock_handle.first_execution_run_id = "run-789"
        mock_client.start_workflow = AsyncMock(return_value=mock_handle)

        service = TemporalExecutionService(temporal_client=mock_client, task_queue="test-queue")

        await service.start_workflow(
            workflow_def=multi_trigger_workflow,
            workflow_name="multi-trigger-workflow",
        )

        assert self._get_trigger_node_id_from_call(mock_client) == "trigger_1"

    @pytest.mark.asyncio
    async def test_start_workflow_with_explicit_trigger_node_id(self) -> None:
        """When trigger_node_id is specified, use that trigger."""
        multi_trigger_workflow = {
            "schema_version": "2.0.0",
            "triggers": [
                {"id": "manual_1", "type": "manual_trigger", "config": {}},
                {"id": "manual_2", "type": "manual_trigger", "config": {}},
            ],
            "nodes": [],
            "edges": [],
        }

        mock_client = Mock()
        mock_handle = Mock()
        mock_handle.first_execution_run_id = "run-202"
        mock_client.start_workflow = AsyncMock(return_value=mock_handle)

        service = TemporalExecutionService(temporal_client=mock_client, task_queue="test-queue")

        await service.start_workflow(
            workflow_def=multi_trigger_workflow,
            workflow_name="multi-trigger-workflow",
            trigger_node_id="manual_2",
        )

        assert self._get_trigger_node_id_from_call(mock_client) == "manual_2"

    @pytest.mark.asyncio
    async def test_start_workflow_with_invalid_trigger_node_id(self) -> None:
        """When trigger_node_id doesn't exist in workflow, raise SafeValueError."""
        workflow_def = {
            "schema_version": "2.0.0",
            "triggers": [
                {"id": "manual_1", "type": "manual_trigger", "config": {}},
            ],
            "nodes": [],
            "edges": [],
        }

        mock_client = Mock()
        service = TemporalExecutionService(temporal_client=mock_client, task_queue="test-queue")

        with pytest.raises(SafeValueError, match="not found in workflow triggers"):
            await service.start_workflow(
                workflow_def=workflow_def,
                workflow_name="test-workflow",
                trigger_node_id="nonexistent_trigger",
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
    async def test_workflow_def_converted_to_dict(self, valid_workflow_dict: dict[str, Any]) -> None:
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

        await service.start_workflow(
            workflow_def=valid_workflow_dict,
            workflow_name="test-workflow",
        )

        # Verify first argument is a dict (V2 workflow definition)
        assert len(captured_args) >= 1
        workflow_def_arg = captured_args[0]
        assert isinstance(workflow_def_arg, dict)
        assert "schema_version" in workflow_def_arg
        assert workflow_def_arg["schema_version"] == "2.0.0"
