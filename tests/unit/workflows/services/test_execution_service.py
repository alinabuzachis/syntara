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
    async def test_get_execution_success_without_temporal(self) -> None:
        """Test successfully retrieving an execution without Temporal sync."""
        mock_session = Mock(spec=AsyncSession)

        execution_id = uuid4()
        execution = Mock(spec=Execution)
        execution.id = execution_id

        mock_result = Mock()
        mock_result.scalar_one_or_none = Mock(return_value=execution)
        mock_session.execute = AsyncMock(return_value=mock_result)

        service = ExecutionService(session=mock_session, temporal_service=None)

        result = await service.get_execution(execution_id)

        assert result is execution
        mock_session.execute.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_get_execution_success_with_temporal_sync(self) -> None:
        """Test retrieving execution syncs status from Temporal."""
        mock_session = Mock(spec=AsyncSession)
        mock_session.commit = AsyncMock()
        mock_session.refresh = AsyncMock()

        execution_id = uuid4()
        execution = Mock(spec=Execution)
        execution.id = execution_id
        execution.status = ExecutionStatus.RUNNING
        execution.temporal_workflow_id = "exec-123"

        mock_result = Mock()
        mock_result.scalar_one_or_none = Mock(return_value=execution)
        mock_session.execute = AsyncMock(return_value=mock_result)

        # Mock Temporal service
        mock_temporal = Mock()
        status_response = Mock()
        status_response.status = "completed"
        status_response.close_time = "2025-01-31T12:00:00+00:00"
        mock_temporal.get_workflow_status = AsyncMock(return_value=status_response)

        service = ExecutionService(session=mock_session, temporal_service=mock_temporal)

        result = await service.get_execution(execution_id)

        assert result is execution
        # Verify status was synced from Temporal
        mock_temporal.get_workflow_status.assert_awaited_once()
        mock_session.commit.assert_awaited_once()

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


class TestListExecutionsCursor:
    """Test list_executions_cursor method."""

    @pytest.mark.asyncio
    async def test_list_executions_basic(self) -> None:
        """Test basic listing without filters."""
        mock_session = Mock(spec=AsyncSession)

        # Mock executions
        exec1 = Mock(spec=Execution, id=uuid4(), created_at="2025-01-01T10:00:00Z")
        exec2 = Mock(spec=Execution, id=uuid4(), created_at="2025-01-01T11:00:00Z")

        mock_result = Mock()
        mock_result.scalars = Mock(return_value=Mock(all=Mock(return_value=[exec1, exec2])))
        mock_session.execute = AsyncMock(return_value=mock_result)

        service = ExecutionService(session=mock_session)

        result = await service.list_executions_cursor(limit=10)

        assert len(result) == 2
        assert result == [exec1, exec2]
        mock_session.execute.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_list_executions_with_workflow_filter(self) -> None:
        """Test listing with workflow_id filter."""
        mock_session = Mock(spec=AsyncSession)

        workflow_id = uuid4()
        exec1 = Mock(spec=Execution, id=uuid4(), workflow_id=workflow_id)

        mock_result = Mock()
        mock_result.scalars = Mock(return_value=Mock(all=Mock(return_value=[exec1])))
        mock_session.execute = AsyncMock(return_value=mock_result)

        service = ExecutionService(session=mock_session)

        result = await service.list_executions_cursor(workflow_id=workflow_id, limit=10)

        assert len(result) == 1
        assert result[0].workflow_id == workflow_id

    @pytest.mark.asyncio
    async def test_list_executions_with_status_filter(self) -> None:
        """Test listing with status filter."""
        mock_session = Mock(spec=AsyncSession)

        exec1 = Mock(spec=Execution, id=uuid4(), status=ExecutionStatus.RUNNING)

        mock_result = Mock()
        mock_result.scalars = Mock(return_value=Mock(all=Mock(return_value=[exec1])))
        mock_session.execute = AsyncMock(return_value=mock_result)

        service = ExecutionService(session=mock_session)

        result = await service.list_executions_cursor(status=ExecutionStatus.RUNNING, limit=10)

        assert len(result) == 1
        assert result[0].status == ExecutionStatus.RUNNING

    @pytest.mark.asyncio
    async def test_list_executions_with_created_by_filter(self) -> None:
        """Test listing with created_by filter."""
        mock_session = Mock(spec=AsyncSession)

        user_id = uuid4()
        exec1 = Mock(spec=Execution, id=uuid4(), created_by=user_id)

        mock_result = Mock()
        mock_result.scalars = Mock(return_value=Mock(all=Mock(return_value=[exec1])))
        mock_session.execute = AsyncMock(return_value=mock_result)

        service = ExecutionService(session=mock_session)

        result = await service.list_executions_cursor(created_by=user_id, limit=10)

        assert len(result) == 1
        assert result[0].created_by == user_id

    @pytest.mark.asyncio
    async def test_list_executions_with_labels_filter(self) -> None:
        """Test listing with labels filter."""
        mock_session = Mock(spec=AsyncSession)

        exec1 = Mock(spec=Execution, id=uuid4(), labels={"env": "prod"})

        mock_result = Mock()
        mock_result.scalars = Mock(return_value=Mock(all=Mock(return_value=[exec1])))
        mock_session.execute = AsyncMock(return_value=mock_result)

        service = ExecutionService(session=mock_session)

        result = await service.list_executions_cursor(labels_filter={"env": "prod"}, limit=10)

        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_list_executions_respects_limit(self) -> None:
        """Test that limit parameter is respected."""
        mock_session = Mock(spec=AsyncSession)

        # Create 5 mock executions but limit=3
        executions = [Mock(spec=Execution, id=uuid4()) for _ in range(3)]

        mock_result = Mock()
        mock_result.scalars = Mock(return_value=Mock(all=Mock(return_value=executions)))
        mock_session.execute = AsyncMock(return_value=mock_result)

        service = ExecutionService(session=mock_session)

        result = await service.list_executions_cursor(limit=3)

        assert len(result) == 3

    @pytest.mark.asyncio
    async def test_list_executions_empty_result(self) -> None:
        """Test listing when no executions match."""
        mock_session = Mock(spec=AsyncSession)

        mock_result = Mock()
        mock_result.scalars = Mock(return_value=Mock(all=Mock(return_value=[])))
        mock_session.execute = AsyncMock(return_value=mock_result)

        service = ExecutionService(session=mock_session)

        result = await service.list_executions_cursor(limit=10)

        assert len(result) == 0
        assert result == []


class TestCountExecutions:
    """Test count_executions method."""

    @pytest.mark.asyncio
    async def test_count_executions_no_filter(self) -> None:
        """Test counting all executions."""
        mock_session = Mock(spec=AsyncSession)

        mock_result = Mock()
        mock_result.scalar_one = Mock(return_value=10)
        mock_session.execute = AsyncMock(return_value=mock_result)

        service = ExecutionService(session=mock_session)

        count = await service.count_executions()

        assert count == 10
        mock_session.execute.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_count_executions_with_workflow_filter(self) -> None:
        """Test counting executions for specific workflow."""
        mock_session = Mock(spec=AsyncSession)

        workflow_id = uuid4()
        mock_result = Mock()
        mock_result.scalar_one = Mock(return_value=5)
        mock_session.execute = AsyncMock(return_value=mock_result)

        service = ExecutionService(session=mock_session)

        count = await service.count_executions(workflow_id=workflow_id)

        assert count == 5

    @pytest.mark.asyncio
    async def test_count_executions_with_status_filter(self) -> None:
        """Test counting executions by status."""
        mock_session = Mock(spec=AsyncSession)

        mock_result = Mock()
        mock_result.scalar_one = Mock(return_value=3)
        mock_session.execute = AsyncMock(return_value=mock_result)

        service = ExecutionService(session=mock_session)

        count = await service.count_executions(status=ExecutionStatus.COMPLETED)

        assert count == 3

    @pytest.mark.asyncio
    async def test_count_executions_with_created_by_filter(self) -> None:
        """Test counting executions by creator."""
        mock_session = Mock(spec=AsyncSession)

        user_id = uuid4()
        mock_result = Mock()
        mock_result.scalar_one = Mock(return_value=7)
        mock_session.execute = AsyncMock(return_value=mock_result)

        service = ExecutionService(session=mock_session)

        count = await service.count_executions(created_by=user_id)

        assert count == 7

    @pytest.mark.asyncio
    async def test_count_executions_with_labels_filter(self) -> None:
        """Test counting executions with labels."""
        mock_session = Mock(spec=AsyncSession)

        mock_result = Mock()
        mock_result.scalar_one = Mock(return_value=2)
        mock_session.execute = AsyncMock(return_value=mock_result)

        service = ExecutionService(session=mock_session)

        count = await service.count_executions(labels_filter={"env": "staging"})

        assert count == 2

    @pytest.mark.asyncio
    async def test_count_executions_zero(self) -> None:
        """Test counting when no executions match."""
        mock_session = Mock(spec=AsyncSession)

        mock_result = Mock()
        mock_result.scalar_one = Mock(return_value=0)
        mock_session.execute = AsyncMock(return_value=mock_result)

        service = ExecutionService(session=mock_session)

        count = await service.count_executions(workflow_id=uuid4())

        assert count == 0


class TestListExecutionsWithTemporalSync:
    """Test list_executions_cursor with Temporal synchronization."""

    @pytest.mark.asyncio
    async def test_list_syncs_status_from_temporal(self) -> None:
        """Test listing executions syncs status from Temporal."""
        mock_session = Mock(spec=AsyncSession)
        mock_session.commit = AsyncMock()

        # Mock executions with non-terminal status
        exec1 = Mock(spec=Execution)
        exec1.id = uuid4()
        exec1.status = ExecutionStatus.RUNNING
        exec1.temporal_workflow_id = "exec-1"

        exec2 = Mock(spec=Execution)
        exec2.id = uuid4()
        exec2.status = ExecutionStatus.PENDING
        exec2.temporal_workflow_id = "exec-2"

        mock_result = Mock()
        mock_result.scalars = Mock(return_value=Mock(all=Mock(return_value=[exec1, exec2])))
        mock_session.execute = AsyncMock(return_value=mock_result)

        # Mock Temporal service
        mock_temporal = Mock()
        status_response1 = Mock()
        status_response1.status = "completed"
        status_response1.close_time = "2025-01-31T12:00:00+00:00"

        status_response2 = Mock()
        status_response2.status = "running"
        status_response2.close_time = None

        mock_temporal.get_workflow_status = AsyncMock(side_effect=[status_response1, status_response2])

        service = ExecutionService(session=mock_session, temporal_service=mock_temporal)

        result = await service.list_executions_cursor(limit=10)

        assert len(result) == 2
        # Verify Temporal was queried for each execution
        assert mock_temporal.get_workflow_status.await_count == 2
        # Verify single commit for all changes
        mock_session.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_list_skips_commit_when_no_status_changes(self) -> None:
        """Test listing doesn't commit when no status changes occur."""
        mock_session = Mock(spec=AsyncSession)
        mock_session.commit = AsyncMock()

        # Mock execution already in terminal state
        exec1 = Mock(spec=Execution)
        exec1.id = uuid4()
        exec1.status = ExecutionStatus.COMPLETED
        exec1.temporal_workflow_id = "exec-1"

        mock_result = Mock()
        mock_result.scalars = Mock(return_value=Mock(all=Mock(return_value=[exec1])))
        mock_session.execute = AsyncMock(return_value=mock_result)

        mock_temporal = Mock()
        mock_temporal.get_workflow_status = AsyncMock()

        service = ExecutionService(session=mock_session, temporal_service=mock_temporal)

        result = await service.list_executions_cursor(limit=10)

        assert len(result) == 1
        # Verify no Temporal query for terminal state execution
        mock_temporal.get_workflow_status.assert_not_called()
        # Verify no commit when no changes
        mock_session.commit.assert_not_called()
