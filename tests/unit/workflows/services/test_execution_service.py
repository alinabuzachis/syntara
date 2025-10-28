"""Unit tests for workflow ExecutionService.

These tests verify the business logic layer for execution management.
"""

from unittest.mock import AsyncMock, Mock
from uuid import UUID, uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.workflows.models.execution import Execution, ExecutionStatus
from nexus.workflows.models.workflow import Workflow
from nexus.workflows.models.workflow_version import WorkflowVersion
from nexus.workflows.services.execution_service import (
    ExecutionNotFoundError,
    ExecutionService,
    WorkflowDisabledError,
    WorkflowNotFoundError,
)


class TestExecutionServiceInit:
    """Test ExecutionService initialization."""

    def test_init_with_session_only(self) -> None:
        """Test initialization with only database session."""
        mock_session = Mock(spec=AsyncSession)
        service = ExecutionService(session=mock_session)

        assert service.session is mock_session
        assert service.temporal_service is None

    def test_init_with_temporal_service(self) -> None:
        """Test initialization with Temporal service."""
        mock_session = Mock(spec=AsyncSession)
        mock_temporal = Mock()
        service = ExecutionService(session=mock_session, temporal_service=mock_temporal)

        assert service.session is mock_session
        assert service.temporal_service is mock_temporal


class TestCreateExecution:
    """Test create_execution method."""

    @pytest.mark.asyncio
    async def test_create_execution_success_with_temporal(self) -> None:
        """Test successful execution creation with Temporal integration."""
        # Setup mocks
        mock_session = Mock(spec=AsyncSession)
        mock_temporal = Mock()

        workflow_id = uuid4()
        version_id = uuid4()
        user_id = uuid4()

        # Mock workflow and version
        workflow = Mock(spec=Workflow)
        workflow.id = workflow_id
        workflow.name = "test-workflow"
        workflow.is_enabled = True

        workflow_version = Mock(spec=WorkflowVersion)
        workflow_version.id = version_id
        workflow_version.version = 1
        workflow_version.schema_version = "1.0.0"
        workflow_version.workflow_definition = {"schemaVersion": "1.0.0", "workflow": {"activities": []}}

        # Mock database query
        mock_result = Mock()
        mock_result.first = Mock(return_value=(workflow, workflow_version))
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_session.add = Mock()
        mock_session.commit = AsyncMock()
        mock_session.refresh = AsyncMock()

        # Mock Temporal service
        temporal_result = Mock()
        temporal_result.temporal_workflow_id = "exec-abc123"
        temporal_result.temporal_run_id = "run-xyz789"
        mock_temporal.start_yaml_workflow = AsyncMock(return_value=temporal_result)

        service = ExecutionService(session=mock_session, temporal_service=mock_temporal)

        # Execute
        result = await service.create_execution(
            workflow_id=workflow_id,
            input_data={"key": "value"},
            created_by=user_id,
        )

        # Verify
        assert isinstance(result, Execution)
        assert result.workflow_id == workflow_id
        assert result.workflow_version_id == version_id
        assert result.temporal_workflow_id == "exec-abc123"
        assert result.status == ExecutionStatus.PENDING
        assert result.input_data == {"key": "value"}
        assert result.created_by == user_id
        assert result.updated_by == user_id

        # Verify Temporal was called
        mock_temporal.start_yaml_workflow.assert_awaited_once()
        call_kwargs = mock_temporal.start_yaml_workflow.call_args.kwargs
        assert call_kwargs["workflow_name"] == "test-workflow"
        assert call_kwargs["input_data"] == {"key": "value"}
        assert "workflow_yaml" in call_kwargs

        # Verify database operations
        mock_session.add.assert_called_once()
        mock_session.commit.assert_awaited_once()
        mock_session.refresh.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_create_execution_success_without_temporal(self) -> None:
        """Test successful execution creation without Temporal (stub mode)."""
        mock_session = Mock(spec=AsyncSession)

        workflow_id = uuid4()
        version_id = uuid4()
        user_id = uuid4()

        # Mock workflow and version
        workflow = Mock(spec=Workflow)
        workflow.id = workflow_id
        workflow.name = "test-workflow"
        workflow.is_enabled = True

        workflow_version = Mock(spec=WorkflowVersion)
        workflow_version.id = version_id
        workflow_version.version = 1
        workflow_version.schema_version = "1.0.0"
        workflow_version.workflow_definition = {}

        # Mock database query
        mock_result = Mock()
        mock_result.first = Mock(return_value=(workflow, workflow_version))
        mock_session.execute = AsyncMock(return_value=mock_result)
        mock_session.add = Mock()
        mock_session.commit = AsyncMock()
        mock_session.refresh = AsyncMock()

        service = ExecutionService(session=mock_session, temporal_service=None)

        # Execute
        result = await service.create_execution(
            workflow_id=workflow_id,
            input_data={},
            created_by=user_id,
        )

        # Verify stub temporal_workflow_id was generated
        assert result.temporal_workflow_id.startswith("exec-")
        UUID(result.temporal_workflow_id.replace("exec-", ""))  # Verify it's a UUID

    @pytest.mark.asyncio
    async def test_create_execution_workflow_not_found(self) -> None:
        """Test execution creation with non-existent workflow."""
        mock_session = Mock(spec=AsyncSession)

        # Mock empty result
        mock_result = Mock()
        mock_result.first = Mock(return_value=None)
        mock_session.execute = AsyncMock(return_value=mock_result)

        service = ExecutionService(session=mock_session)

        workflow_id = uuid4()
        with pytest.raises(WorkflowNotFoundError) as exc_info:
            await service.create_execution(
                workflow_id=workflow_id,
                input_data={},
                created_by=uuid4(),
            )

        assert str(workflow_id) in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_create_execution_workflow_disabled(self) -> None:
        """Test execution creation with disabled workflow."""
        mock_session = Mock(spec=AsyncSession)

        workflow_id = uuid4()

        # Mock disabled workflow
        workflow = Mock(spec=Workflow)
        workflow.id = workflow_id
        workflow.name = "disabled-workflow"
        workflow.is_enabled = False

        workflow_version = Mock(spec=WorkflowVersion)
        workflow_version.id = uuid4()

        mock_result = Mock()
        mock_result.first = Mock(return_value=(workflow, workflow_version))
        mock_session.execute = AsyncMock(return_value=mock_result)

        service = ExecutionService(session=mock_session)

        with pytest.raises(WorkflowDisabledError) as exc_info:
            await service.create_execution(
                workflow_id=workflow_id,
                input_data={},
                created_by=uuid4(),
            )

        assert str(workflow_id) in str(exc_info.value)


class TestGetExecution:
    """Test get_execution method."""

    @pytest.mark.asyncio
    async def test_get_execution_success(self) -> None:
        """Test successfully retrieving an execution."""
        mock_session = Mock(spec=AsyncSession)

        execution_id = uuid4()
        execution = Mock(spec=Execution)
        execution.id = execution_id

        mock_result = Mock()
        mock_result.scalar_one_or_none = Mock(return_value=execution)
        mock_session.execute = AsyncMock(return_value=mock_result)

        service = ExecutionService(session=mock_session)

        result = await service.get_execution(execution_id)

        assert result is execution
        mock_session.execute.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_get_execution_not_found(self) -> None:
        """Test getting non-existent execution."""
        mock_session = Mock(spec=AsyncSession)

        mock_result = Mock()
        mock_result.scalar_one_or_none = Mock(return_value=None)
        mock_session.execute = AsyncMock(return_value=mock_result)

        service = ExecutionService(session=mock_session)

        execution_id = uuid4()
        with pytest.raises(ExecutionNotFoundError) as exc_info:
            await service.get_execution(execution_id)

        assert str(execution_id) in str(exc_info.value)
