"""Unit tests for workflow ExecutionService.

These tests verify the business logic layer for execution management.
"""

from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, Mock
from uuid import UUID, uuid4

import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.core.models import User
from nexus.core.models.base import ResourcesResponseBase
from nexus.workflows.exceptions import (
    ExecutionNotFoundError,
    WorkflowDisabledError,
    WorkflowNotFoundError,
)
from nexus.workflows.models.activity_execution import ActivityStatus
from nexus.workflows.models.execution import Execution, ExecutionRead, ExecutionStatus
from nexus.workflows.models.workflow import Workflow
from nexus.workflows.models.workflow_version import WorkflowVersion
from nexus.workflows.services.execution_service import ExecutionService


class TestExecutionServiceBase:
    """Base test class with helper methods for ExecutionService tests."""

    def _create_test_execution(  # noqa: C901
        self,
        execution_id: UUID | None = None,
        workflow_id: UUID | None = None,
        workflow_version_id: UUID | None = None,
        temporal_workflow_id: str | None = None,
        status: ExecutionStatus = ExecutionStatus.COMPLETED,
        created_by: UUID | None = None,
        created_at: datetime | None = None,
        updated_at: datetime | None = None,
        updated_by: UUID | None = None,
        completed_at: datetime | None = None,
        input_data: dict[str, Any] | None = None,
        error_details: str | None = None,
        labels: dict[str, Any] | None = None,
        deleted_at: datetime | None = None,
        deleted_by: UUID | None = None,
    ) -> Execution:
        """Create a test Execution object with realistic data.

        Args:
            execution_id: Execution UUID (generates random if None)
            workflow_id: Workflow UUID (generates random if None)
            workflow_version_id: Workflow version UUID (generates random if None)
            temporal_workflow_id: Temporal workflow ID (generates if None)
            status: Execution status (defaults to COMPLETED)
            created_by: Creator user UUID (generates random if None)
            created_at: Creation timestamp (defaults to current time if None)
            updated_at: Update timestamp (defaults to created_at if None)
            updated_by: Updater user UUID (defaults to created_by if None)
            completed_at: Completion timestamp (defaults to updated_at for COMPLETED status)
            input_data: Input data dict (defaults to empty dict if None)
            error_details: Error details string (None by default)
            labels: Labels dict (defaults to empty dict if None)
            deleted_at: Deletion timestamp (None by default)
            deleted_by: Deleter user UUID (None by default)

        Returns:
            Execution object with realistic data suitable for testing

        """
        if execution_id is None:
            execution_id = uuid4()
        if workflow_id is None:
            workflow_id = uuid4()
        if workflow_version_id is None:
            workflow_version_id = uuid4()
        if temporal_workflow_id is None:
            temporal_workflow_id = f"temporal-exec-{execution_id}"
        if created_by is None:
            created_by = uuid4()
        if created_at is None:
            created_at = datetime.now(UTC)
        if updated_at is None:
            updated_at = created_at
        if updated_by is None:
            updated_by = created_by
        if completed_at is None and status in (
            ExecutionStatus.COMPLETED,
            ExecutionStatus.FAILED,
            ExecutionStatus.CANCELLED,
        ):
            completed_at = updated_at
        if input_data is None:
            input_data = {}
        if labels is None:
            labels = {}

        return Execution(
            id=execution_id,
            workflow_id=workflow_id,
            workflow_version_id=workflow_version_id,
            temporal_workflow_id=temporal_workflow_id,
            status=status,
            created_by=created_by,
            created_at=created_at,
            updated_at=updated_at,
            updated_by=updated_by,
            completed_at=completed_at,
            input_data=input_data,
            error_details=error_details,
            labels=labels,
            deleted_at=deleted_at,
            deleted_by=deleted_by,
        )


class TestExecutionServiceInit:
    """Test ExecutionService initialization."""

    def test_init_with_session_and_user(self) -> None:
        """Test initialization with database session and user."""
        mock_session = Mock(spec=AsyncSession)
        mock_user = Mock(spec=User)
        service = ExecutionService(session=mock_session, user=mock_user)

        assert service.session is mock_session
        assert service.user is mock_user
        assert service.temporal_service is None

    def test_init_with_temporal_service(self) -> None:
        """Test initialization with Temporal service."""
        mock_session = Mock(spec=AsyncSession)
        mock_user = Mock(spec=User)
        mock_temporal = Mock()
        service = ExecutionService(session=mock_session, user=mock_user, temporal_service=mock_temporal)

        assert service.session is mock_session
        assert service.user is mock_user
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
        mock_session.exec = AsyncMock(return_value=mock_result)
        mock_session.add = Mock()
        mock_session.commit = AsyncMock()
        mock_session.refresh = AsyncMock()

        # Mock Temporal service
        temporal_execution_id = uuid4()
        temporal_result = Mock()
        temporal_result.execution_id = str(temporal_execution_id)
        temporal_result.temporal_workflow_id = "exec-abc123"
        temporal_result.temporal_run_id = "run-xyz789"
        mock_temporal.start_yaml_workflow = AsyncMock(return_value=temporal_result)

        mock_user = Mock(spec=User)
        mock_user.id = user_id
        service = ExecutionService(session=mock_session, user=mock_user, temporal_service=mock_temporal)

        # Execute
        result = await service.create_execution(
            workflow_id=workflow_id,
            input_data={"key": "value"},
        )

        # Verify
        assert isinstance(result, Execution)
        assert result.id == temporal_execution_id
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
        mock_session.exec = AsyncMock(return_value=mock_result)
        mock_session.add = Mock()
        mock_session.commit = AsyncMock()
        mock_session.refresh = AsyncMock()

        mock_user = Mock(spec=User)
        mock_user.id = user_id
        service = ExecutionService(session=mock_session, user=mock_user, temporal_service=None)

        # Execute
        result = await service.create_execution(
            workflow_id=workflow_id,
            input_data={},
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
        mock_session.exec = AsyncMock(return_value=mock_result)

        mock_user = Mock(spec=User)
        service = ExecutionService(session=mock_session, user=mock_user)

        workflow_id = uuid4()
        with pytest.raises(WorkflowNotFoundError) as exc_info:
            await service.create_execution(
                workflow_id=workflow_id,
                input_data={},
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
        mock_session.exec = AsyncMock(return_value=mock_result)

        mock_user = Mock(spec=User)
        service = ExecutionService(session=mock_session, user=mock_user)

        with pytest.raises(WorkflowDisabledError) as exc_info:
            await service.create_execution(
                workflow_id=workflow_id,
                input_data={},
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
        mock_result.one_or_none = Mock(return_value=execution)
        mock_session.exec = AsyncMock(return_value=mock_result)

        mock_user = Mock(spec=User)
        service = ExecutionService(session=mock_session, user=mock_user, temporal_service=None)

        result = await service.get_execution(execution_id)

        assert result is execution
        mock_session.exec.assert_awaited_once()

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
        execution.created_at = datetime.now(UTC)

        mock_result = Mock()
        mock_result.one_or_none = Mock(return_value=execution)
        mock_session.exec = AsyncMock(return_value=mock_result)

        # Mock Temporal service
        mock_temporal = Mock()
        status_response = Mock()
        status_response.status = "completed"
        status_response.close_time = "2025-01-31T12:00:00+00:00"
        mock_temporal.get_workflow_status = AsyncMock(return_value=status_response)

        mock_user = Mock(spec=User)
        service = ExecutionService(session=mock_session, user=mock_user, temporal_service=mock_temporal)

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
        mock_result.one_or_none = Mock(return_value=None)
        mock_session.exec = AsyncMock(return_value=mock_result)

        mock_user = Mock(spec=User)
        service = ExecutionService(session=mock_session, user=mock_user)

        execution_id = uuid4()
        with pytest.raises(ExecutionNotFoundError) as exc_info:
            await service.get_execution(execution_id)

        assert str(execution_id) in str(exc_info.value)


class TestListExecutions(TestExecutionServiceBase):
    """Test list_executions method."""

    @pytest.mark.asyncio
    async def test_list_executions_basic(self) -> None:
        """Test basic listing without filters."""
        mock_session = Mock(spec=AsyncSession)
        mock_user = Mock(spec=User)

        # Create real Execution objects using helper method
        exec1_id = uuid4()
        exec2_id = uuid4()

        exec1 = self._create_test_execution(
            execution_id=exec1_id,
            status=ExecutionStatus.COMPLETED,
            created_at=datetime(2025, 1, 1, 10, 0, 0, tzinfo=UTC),
        )

        exec2 = self._create_test_execution(
            execution_id=exec2_id,
            status=ExecutionStatus.RUNNING,
            created_at=datetime(2025, 1, 1, 11, 0, 0, tzinfo=UTC),
        )

        # Mock database result for main query (exec)
        mock_main_result = Mock()
        mock_main_result.all.return_value = [exec1, exec2]
        mock_session.exec = AsyncMock(return_value=mock_main_result)

        # Mock database result for count query (execute)
        mock_count_result = Mock()
        mock_count_result.scalar.return_value = None
        mock_session.execute = AsyncMock(return_value=mock_count_result)

        service = ExecutionService(session=mock_session, user=mock_user)
        result = await service.list_executions(limit=10)

        assert isinstance(result, ResourcesResponseBase)
        assert len(result.resources) == 2
        # Now we expect ExecutionRead objects, not the original Execution objects
        assert isinstance(result.resources[0], ExecutionRead)
        assert isinstance(result.resources[1], ExecutionRead)
        # Check the IDs to verify the conversion worked correctly
        assert result.resources[0].id == exec1_id
        assert result.resources[1].id == exec2_id
        assert result.next is None
        assert result.prev is None
        assert result.total is None

    @pytest.mark.asyncio
    async def test_list_executions_with_workflow_filter(self) -> None:
        """Test listing with workflow_id filter."""
        mock_session = Mock(spec=AsyncSession)
        mock_user = Mock(spec=User)

        workflow_id = uuid4()
        exec1_id = uuid4()
        exec1 = self._create_test_execution(execution_id=exec1_id, workflow_id=workflow_id)

        # Mock database result for main query (exec)
        mock_main_result = Mock()
        mock_main_result.all.return_value = [exec1]
        mock_session.exec = AsyncMock(return_value=mock_main_result)

        # Mock database result for count query (execute)
        mock_count_result = Mock()
        mock_count_result.scalar.return_value = None
        mock_session.execute = AsyncMock(return_value=mock_count_result)

        service = ExecutionService(session=mock_session, user=mock_user)
        result = await service.list_executions(query_params_items=[("workflow_id", str(workflow_id))], limit=10)

        assert isinstance(result, ResourcesResponseBase)
        assert len(result.resources) == 1
        assert isinstance(result.resources[0], ExecutionRead)
        assert result.resources[0].workflow_id == workflow_id

    @pytest.mark.asyncio
    async def test_list_executions_with_status_filter(self) -> None:
        """Test listing with status filter."""
        mock_session = Mock(spec=AsyncSession)
        mock_user = Mock(spec=User)

        exec1_id = uuid4()
        exec1 = self._create_test_execution(execution_id=exec1_id, status=ExecutionStatus.RUNNING)

        # Mock database result for main query (exec)
        mock_main_result = Mock()
        mock_main_result.all.return_value = [exec1]
        mock_session.exec = AsyncMock(return_value=mock_main_result)

        # Mock database result for count query (execute)
        mock_count_result = Mock()
        mock_count_result.scalar.return_value = None
        mock_session.execute = AsyncMock(return_value=mock_count_result)

        service = ExecutionService(session=mock_session, user=mock_user)
        result = await service.list_executions(query_params_items=[("status", ExecutionStatus.RUNNING.value)], limit=10)

        assert isinstance(result, ResourcesResponseBase)
        assert len(result.resources) == 1
        assert isinstance(result.resources[0], ExecutionRead)
        assert result.resources[0].status == ExecutionStatus.RUNNING

    @pytest.mark.asyncio
    async def test_list_executions_with_created_by_filter(self) -> None:
        """Test listing with created_by filter."""
        mock_session = Mock(spec=AsyncSession)
        mock_user = Mock(spec=User)

        user_id = uuid4()
        exec1_id = uuid4()
        exec1 = self._create_test_execution(execution_id=exec1_id, created_by=user_id)

        # Mock database result for main query (exec)
        mock_main_result = Mock()
        mock_main_result.all.return_value = [exec1]
        mock_session.exec = AsyncMock(return_value=mock_main_result)

        # Mock database result for count query (execute)
        mock_count_result = Mock()
        mock_count_result.scalar.return_value = None
        mock_session.execute = AsyncMock(return_value=mock_count_result)

        service = ExecutionService(session=mock_session, user=mock_user)
        result = await service.list_executions(query_params_items=[("created_by", str(user_id))], limit=10)

        assert isinstance(result, ResourcesResponseBase)
        assert len(result.resources) == 1
        assert isinstance(result.resources[0], ExecutionRead)
        assert result.resources[0].created_by == user_id

    @pytest.mark.asyncio
    async def test_list_executions_with_labels_filter(self) -> None:
        """Test listing with labels filter."""
        mock_session = Mock(spec=AsyncSession)
        mock_user = Mock(spec=User)

        exec1_id = uuid4()
        exec1 = self._create_test_execution(execution_id=exec1_id, labels={"env": "prod"})

        # Mock database result for main query (exec)
        mock_main_result = Mock()
        mock_main_result.all.return_value = [exec1]
        mock_session.exec = AsyncMock(return_value=mock_main_result)

        # Mock database result for count query (execute)
        mock_count_result = Mock()
        mock_count_result.scalar.return_value = None
        mock_session.execute = AsyncMock(return_value=mock_count_result)

        service = ExecutionService(session=mock_session, user=mock_user)
        # Using cast to avoid mypy issues with dynamic keyword arguments
        result = await service.list_executions(query_params_items=[("labels[env]", "prod")], limit=10)

        assert isinstance(result, ResourcesResponseBase)
        assert len(result.resources) == 1
        assert isinstance(result.resources[0], ExecutionRead)

    @pytest.mark.asyncio
    async def test_list_executions_with_multiple_filters(self) -> None:
        """Test listing with various filters combined."""
        mock_session = Mock(spec=AsyncSession)
        mock_user = Mock(spec=User)

        workflow_id = uuid4()
        user_id = uuid4()
        exec1_id = uuid4()
        exec1 = self._create_test_execution(execution_id=exec1_id, workflow_id=workflow_id, created_by=user_id)

        # Mock database result for main query (exec)
        mock_main_result = Mock()
        mock_main_result.all.return_value = [exec1]
        mock_session.exec = AsyncMock(return_value=mock_main_result)

        # Mock database result for count query (execute)
        mock_count_result = Mock()
        mock_count_result.scalar.return_value = None
        mock_session.execute = AsyncMock(return_value=mock_count_result)

        service = ExecutionService(session=mock_session, user=mock_user)
        result = await service.list_executions(
            query_params_items=[("workflow_id", str(workflow_id)), ("created_by", str(user_id)), ("status", "running")],
            limit=10,
        )

        assert isinstance(result, ResourcesResponseBase)
        assert len(result.resources) == 1
        assert isinstance(result.resources[0], ExecutionRead)
        assert result.resources[0].workflow_id == workflow_id

    @pytest.mark.asyncio
    async def test_list_executions_with_pagination(self) -> None:
        """Test listing with pagination parameters."""
        mock_session = Mock(spec=AsyncSession)
        mock_user = Mock(spec=User)

        # Create mock execution with proper attributes for pagination
        exec_id = uuid4()
        exec1 = self._create_test_execution(
            execution_id=exec_id, created_at=datetime.fromisoformat("2025-01-01T10:00:00+00:00").replace(tzinfo=UTC)
        )

        # Mock database result for main query (exec)
        mock_main_result = Mock()
        mock_main_result.all.return_value = [exec1]
        mock_session.exec = AsyncMock(return_value=mock_main_result)

        # Mock database result for count query (execute)
        mock_count_result = Mock()
        mock_count_result.scalar.return_value = None
        mock_session.execute = AsyncMock(return_value=mock_count_result)

        service = ExecutionService(session=mock_session, user=mock_user)
        result = await service.list_executions(limit=5, sort="-created_at")

        assert isinstance(result, ResourcesResponseBase)
        assert len(result.resources) == 1
        assert isinstance(result.resources[0], ExecutionRead)
        # Note: next/prev cursors are generated by the pagination utility based on the results

    @pytest.mark.asyncio
    async def test_list_executions_with_total_count(self) -> None:
        """Test listing with total count included."""
        mock_session = Mock(spec=AsyncSession)
        mock_user = Mock(spec=User)

        exec1_id = uuid4()
        exec1 = self._create_test_execution(execution_id=exec1_id)

        # Mock database result for main query (exec)
        mock_main_result = Mock()
        mock_main_result.all.return_value = [exec1]

        # Mock database result for count query (exec)
        mock_count_result = Mock()
        mock_count_result.one.return_value = 42

        # Setup exec to return different results based on call order
        mock_session.exec = AsyncMock(side_effect=[mock_main_result, mock_count_result])

        service = ExecutionService(session=mock_session, user=mock_user)
        result = await service.list_executions(include_total=True)

        assert isinstance(result, ResourcesResponseBase)
        assert len(result.resources) == 1
        assert isinstance(result.resources[0], ExecutionRead)
        assert result.total == 42

    @pytest.mark.asyncio
    async def test_list_executions_with_label_filters(self) -> None:
        """Test listing with label filters using bracket notation."""
        mock_session = Mock(spec=AsyncSession)
        mock_user = Mock(spec=User)

        exec1_id = uuid4()
        exec1 = self._create_test_execution(execution_id=exec1_id, labels={"env": "prod"})

        # Mock database result for main query (exec)
        mock_main_result = Mock()
        mock_main_result.all.return_value = [exec1]
        mock_session.exec = AsyncMock(return_value=mock_main_result)

        # Mock database result for count query (execute)
        mock_count_result = Mock()
        mock_count_result.scalar.return_value = None
        mock_session.execute = AsyncMock(return_value=mock_count_result)

        service = ExecutionService(session=mock_session, user=mock_user)
        # Test with bracket notation label filter
        result = await service.list_executions(query_params_items=[("labels[env]", "prod")])

        assert isinstance(result, ResourcesResponseBase)
        assert len(result.resources) == 1
        assert isinstance(result.resources[0], ExecutionRead)

    @pytest.mark.asyncio
    async def test_list_executions_empty_result(self) -> None:
        """Test listing when no executions match."""
        mock_session = Mock(spec=AsyncSession)
        mock_user = Mock(spec=User)

        # Mock database result for main query (exec) - empty
        mock_main_result = Mock()
        mock_main_result.all.return_value = []
        mock_session.exec = AsyncMock(return_value=mock_main_result)

        # Mock database result for count query (execute)
        mock_count_result = Mock()
        mock_count_result.scalar.return_value = None
        mock_session.execute = AsyncMock(return_value=mock_count_result)

        service = ExecutionService(session=mock_session, user=mock_user)
        result = await service.list_executions(limit=10)

        assert isinstance(result, ResourcesResponseBase)
        assert len(result.resources) == 0
        assert result.resources == []

    @pytest.mark.asyncio
    async def test_list_executions_respects_allowed_filters(self) -> None:
        """Test that only allowed filter fields are processed."""
        mock_session = Mock(spec=AsyncSession)
        mock_user = Mock(spec=User)

        exec1_id = uuid4()
        exec1 = self._create_test_execution(execution_id=exec1_id)

        # Mock database result for main query (exec)
        mock_main_result = Mock()
        mock_main_result.all.return_value = [exec1]
        mock_session.exec = AsyncMock(return_value=mock_main_result)

        # Mock database result for count query (execute)
        mock_count_result = Mock()
        mock_count_result.scalar.return_value = None
        mock_session.execute = AsyncMock(return_value=mock_count_result)

        service = ExecutionService(session=mock_session, user=mock_user)

        # Test that valid filters work correctly
        result = await service.list_executions(query_params_items=[("workflow_id[eq]", str(exec1.id))], limit=10)

        assert isinstance(result, ResourcesResponseBase)
        assert len(result.resources) == 1

    @pytest.mark.asyncio
    async def test_list_executions_respects_allowed_sort_fields(self) -> None:
        """Test that only allowed sort fields are processed."""
        mock_session = Mock(spec=AsyncSession)
        mock_user = Mock(spec=User)

        exec1_id = uuid4()
        exec1 = self._create_test_execution(execution_id=exec1_id)

        # Mock database result for main query (exec)
        mock_main_result = Mock()
        mock_main_result.all.return_value = [exec1]
        mock_session.exec = AsyncMock(return_value=mock_main_result)

        # Mock database result for count query (execute)
        mock_count_result = Mock()
        mock_count_result.scalar.return_value = None
        mock_session.execute = AsyncMock(return_value=mock_count_result)

        service = ExecutionService(session=mock_session, user=mock_user)

        # Test with valid sort field
        result = await service.list_executions(sort="created_at")
        assert isinstance(result, ResourcesResponseBase)

        # Test with invalid sort field - should raise ValueError
        with pytest.raises(ValueError, match="Invalid field: invalid_field"):
            await service.list_executions(sort="invalid_field")


class TestListExecutionsWithTemporalSync(TestExecutionServiceBase):
    """Test list_executions_cursor with Temporal synchronization."""

    @pytest.mark.asyncio
    async def test_list_syncs_status_from_temporal(self) -> None:
        """Test listing executions syncs status from Temporal."""
        mock_session = Mock(spec=AsyncSession)
        mock_session.commit = AsyncMock()

        # Create real execution objects for temporal sync testing
        exec1_id = uuid4()
        exec2_id = uuid4()
        exec1 = self._create_test_execution(
            execution_id=exec1_id, status=ExecutionStatus.RUNNING, temporal_workflow_id="exec-1"
        )
        exec2 = self._create_test_execution(
            execution_id=exec2_id, status=ExecutionStatus.PENDING, temporal_workflow_id="exec-2"
        )

        # Mock database result for main query (exec)
        mock_main_result = Mock()
        mock_main_result.all = Mock(return_value=[exec1, exec2])
        mock_session.exec = AsyncMock(return_value=mock_main_result)

        # Mock database result for count query (execute)
        mock_count_result = Mock()
        mock_count_result.scalar = Mock(return_value=None)
        mock_session.execute = AsyncMock(return_value=mock_count_result)

        # Mock Temporal service
        mock_temporal = Mock()
        status_response1 = Mock()
        status_response1.status = "completed"
        status_response1.close_time = "2025-01-31T12:00:00+00:00"

        status_response2 = Mock()
        status_response2.status = "running"
        status_response2.close_time = None

        mock_temporal.get_workflow_status = AsyncMock(side_effect=[status_response1, status_response2])

        mock_user = Mock(spec=User)
        service = ExecutionService(session=mock_session, user=mock_user, temporal_service=mock_temporal)

        result = await service.list_executions(limit=10)

        assert len(result.resources) == 2
        # Verify Temporal was queried for each execution
        assert mock_temporal.get_workflow_status.await_count == 2
        # Verify single commit for all changes
        mock_session.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_list_skips_commit_when_no_status_changes(self) -> None:
        """Test listing doesn't commit when no status changes occur."""
        mock_session = Mock(spec=AsyncSession)
        mock_session.commit = AsyncMock()

        # Create real execution object in terminal state
        exec1_id = uuid4()
        exec1 = self._create_test_execution(
            execution_id=exec1_id, status=ExecutionStatus.COMPLETED, temporal_workflow_id="exec-1"
        )

        # Mock database result for main query (exec)
        mock_main_result = Mock()
        mock_main_result.all = Mock(return_value=[exec1])
        mock_session.exec = AsyncMock(return_value=mock_main_result)

        # Mock database result for count query (execute)
        mock_count_result = Mock()
        mock_count_result.scalar = Mock(return_value=None)
        mock_session.execute = AsyncMock(return_value=mock_count_result)

        mock_temporal = Mock()
        mock_temporal.get_workflow_status = AsyncMock()

        mock_user = Mock(spec=User)
        service = ExecutionService(session=mock_session, user=mock_user, temporal_service=mock_temporal)

        result = await service.list_executions(limit=10)

        assert len(result.resources) == 1
        # Verify no Temporal query for terminal state execution
        mock_temporal.get_workflow_status.assert_not_called()
        # Verify no commit when no changes
        mock_session.commit.assert_not_called()


class TestGetExecutionActivities:
    """Test get_execution_activities method."""

    @pytest.mark.asyncio
    async def test_get_execution_activities_no_temporal(self) -> None:
        """Test getting activities returns empty list when Temporal is unavailable."""
        mock_session = Mock(spec=AsyncSession)
        mock_user = Mock(spec=User)

        execution_id = uuid4()
        execution = Mock(spec=Execution)
        execution.id = execution_id

        # Mock get_execution query (first exec call)
        mock_execution_result = Mock()
        mock_execution_result.one_or_none = Mock(return_value=execution)

        # Mock activities query (second exec call)
        mock_activities_result = Mock()
        mock_activities_result.all = Mock(return_value=[])

        # Set up exec to return different results for each query
        mock_session.exec = AsyncMock(side_effect=[mock_execution_result, mock_activities_result])

        service = ExecutionService(session=mock_session, user=mock_user, temporal_service=None)

        result = await service.get_execution_activities(execution_id)

        assert result == []

    @pytest.mark.asyncio
    async def test_get_execution_activities_not_found(self) -> None:
        """Test getting activities for non-existent execution raises error."""
        mock_session = Mock(spec=AsyncSession)
        mock_user = Mock(spec=User)

        execution_id = uuid4()

        # Mock execution not found
        mock_result = Mock()
        mock_result.one_or_none = Mock(return_value=None)
        mock_session.exec = AsyncMock(return_value=mock_result)

        service = ExecutionService(session=mock_session, user=mock_user, temporal_service=None)

        with pytest.raises(ExecutionNotFoundError) as exc_info:
            await service.get_execution_activities(execution_id)

        assert exc_info.value.execution_id == execution_id

    @pytest.mark.asyncio
    async def test_get_execution_activities_success(self) -> None:
        """Test successfully getting activities from database."""
        mock_session = Mock(spec=AsyncSession)

        execution_id = uuid4()
        execution = Mock(spec=Execution)
        execution.id = execution_id
        execution.status = ExecutionStatus.RUNNING
        execution.temporal_workflow_id = "exec-123"
        execution.created_at = datetime.now(UTC)

        activity = Mock()
        activity.id = uuid4()
        activity.activity_name = "activity-1"
        activity.temporal_activity_id = "activity-1"
        activity.status = ActivityStatus.COMPLETED
        activity.retry_count = 0

        mock_execution_result = Mock()
        mock_execution_result.one_or_none = Mock(return_value=execution)
        mock_activities_result = Mock()
        mock_activities_result.all = Mock(return_value=[activity])

        mock_session.exec = AsyncMock(side_effect=[mock_execution_result, mock_activities_result])

        mock_user = Mock(spec=User)
        service = ExecutionService(session=mock_session, user=mock_user, temporal_service=None)

        result = await service.get_execution_activities(execution_id)

        assert len(result) == 1
        assert result[0].activity_name == "activity-1"
        assert result[0].temporal_activity_id == "activity-1"
        assert result[0].status == ActivityStatus.COMPLETED
        assert result[0].retry_count == 0

    @pytest.mark.asyncio
    async def test_get_execution_activities_incremental_sync(self) -> None:
        """Test getting multiple activities from database."""
        mock_session = Mock(spec=AsyncSession)

        execution_id = uuid4()
        execution = Mock(spec=Execution)
        execution.id = execution_id
        execution.status = ExecutionStatus.RUNNING
        execution.temporal_workflow_id = "exec-123"
        execution.created_at = datetime.now(UTC)

        activity1 = Mock()
        activity1.id = uuid4()
        activity1.activity_name = "activity-1"
        activity1.temporal_activity_id = "activity-1"
        activity1.status = ActivityStatus.COMPLETED

        activity2 = Mock()
        activity2.id = uuid4()
        activity2.activity_name = "activity-2"
        activity2.temporal_activity_id = "activity-2"
        activity2.status = ActivityStatus.RUNNING

        mock_execution_result = Mock()
        mock_execution_result.one_or_none = Mock(return_value=execution)
        mock_activities_result = Mock()
        mock_activities_result.all = Mock(return_value=[activity1, activity2])

        mock_session.exec = AsyncMock(side_effect=[mock_execution_result, mock_activities_result])

        mock_user = Mock(spec=User)
        service = ExecutionService(session=mock_session, user=mock_user, temporal_service=None)

        result = await service.get_execution_activities(execution_id)

        assert len(result) == 2
        assert result[0].activity_name == "activity-1"
        assert result[0].status == ActivityStatus.COMPLETED
        assert result[1].activity_name == "activity-2"
        assert result[1].status == ActivityStatus.RUNNING
