"""Unit tests for workflow ExecutionService.

These tests verify the business logic layer for execution management.
"""

from datetime import UTC, datetime
from typing import Any, ClassVar
from unittest.mock import AsyncMock, Mock, patch
from uuid import UUID, uuid4

import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.core.exceptions import SafeValueError
from nexus.core.models import User
from nexus.core.models.pagination import ResourcesResponseBase
from nexus.workflows.exceptions import (
    ExecutionNotFoundError,
    TriggerValidationError,
    WorkflowNotFoundError,
    WorkflowNotPublishedError,
)
from nexus.workflows.models.execution import Execution, ExecutionRead, ExecutionStatus
from nexus.workflows.models.workflow import Workflow
from nexus.workflows.models.workflow_version import WorkflowVersion
from nexus.workflows.services.execution_service import ExecutionService
from nexus.workflows.workflow_engine.models.workflow_definition import NodeType


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
        project_id: UUID | None = None,
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
            project_id: Project UUID (generates random if None)

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
            project_id=project_id or uuid4(),
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
        workflow.project_id = uuid4()

        workflow_version = Mock(spec=WorkflowVersion)
        workflow_version.id = version_id
        workflow_version.version = 1
        workflow_version.schema_version = "2.0.0"
        workflow_version.workflow_definition = {
            "schema_version": "2.0.0",
            "triggers": [{"id": "trigger_1", "type": NodeType.MANUAL_TRIGGER, "parameters": {}}],
            "nodes": [],
            "edges": [],
        }

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
        mock_temporal.start_workflow = AsyncMock(return_value=temporal_result)

        mock_user = Mock(spec=User)
        mock_user.id = user_id
        service = ExecutionService(session=mock_session, user=mock_user, temporal_service=mock_temporal)

        # Execute
        result = await service.create_execution(
            workflow_id=workflow_id,
            input_data={"key": "value"},
        )

        # Verify
        assert isinstance(result, ExecutionRead)
        assert result.id == temporal_execution_id
        assert result.workflow_id == workflow_id
        assert result.workflow_version_id == version_id
        assert result.temporal_workflow_id == "exec-abc123"
        assert result.status == ExecutionStatus.PENDING
        assert result.input_data == {"key": "value"}
        assert result.created_by == user_id
        assert result.updated_by == user_id

        # Verify Temporal was called
        mock_temporal.start_workflow.assert_awaited_once()
        call_kwargs = mock_temporal.start_workflow.call_args.kwargs
        assert call_kwargs["workflow_name"] == "test-workflow"
        assert call_kwargs["input_data"] == {"key": "value"}
        assert "workflow_def" in call_kwargs

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
        workflow.project_id = uuid4()

        workflow_version = Mock(spec=WorkflowVersion)
        workflow_version.id = version_id
        workflow_version.version = 1
        workflow_version.schema_version = "1.0.0"
        workflow_version.workflow_definition = {
            "triggers": [{"id": "trigger_1", "type": NodeType.MANUAL_TRIGGER, "parameters": {}}],
        }

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
    async def test_create_execution_use_published_success(self) -> None:
        """Test triggered execution uses published version successfully."""
        mock_session = Mock(spec=AsyncSession)

        workflow_id = uuid4()
        version_id = uuid4()
        user_id = uuid4()

        workflow = Mock(spec=Workflow)
        workflow.id = workflow_id
        workflow.name = "test-workflow"
        workflow.is_enabled = True
        workflow.published_version = 1
        workflow.project_id = uuid4()

        workflow_version = Mock(spec=WorkflowVersion)
        workflow_version.id = version_id
        workflow_version.version = 1
        workflow_version.schema_version = "1.0.0"
        workflow_version.workflow_definition = {
            "triggers": [{"id": "trigger_1", "type": NodeType.MANUAL_TRIGGER, "parameters": {}}],
        }

        mock_result = Mock()
        mock_result.first = Mock(return_value=(workflow, workflow_version))
        mock_session.exec = AsyncMock(return_value=mock_result)
        mock_session.add = Mock()
        mock_session.commit = AsyncMock()
        mock_session.refresh = AsyncMock()

        mock_user = Mock(spec=User)
        mock_user.id = user_id
        service = ExecutionService(session=mock_session, user=mock_user, temporal_service=None)

        result = await service.create_execution(
            workflow_id=workflow_id,
            input_data={},
            use_published=True,
        )

        assert result.temporal_workflow_id.startswith("exec-")
        assert result.workflow_version_id == version_id

    @pytest.mark.asyncio
    async def test_create_execution_use_published_no_published_version(self) -> None:
        """Test triggered execution fails when no published version exists."""
        mock_session = Mock(spec=AsyncSession)
        workflow_id = uuid4()
        mock_result = Mock()
        mock_result.first = Mock(return_value=None)
        workflow = Mock(spec=Workflow)
        workflow.id = workflow_id
        mock_wf_result = Mock()
        mock_wf_result.first = Mock(return_value=workflow)
        mock_session.exec = AsyncMock(side_effect=[mock_result, mock_wf_result])
        mock_user = Mock(spec=User)
        service = ExecutionService(session=mock_session, user=mock_user)
        with pytest.raises(WorkflowNotPublishedError) as exc_info:
            await service.create_execution(
                workflow_id=workflow_id,
                input_data={},
                use_published=True,
            )
        assert str(workflow_id) in str(exc_info.value)


class TestGetExecution(TestExecutionServiceBase):
    """Test get_execution method."""

    @pytest.mark.asyncio
    async def test_get_execution_success_without_temporal(self) -> None:
        """Test successfully retrieving an execution without Temporal sync."""
        mock_session = Mock(spec=AsyncSession)

        execution_id = uuid4()
        execution = self._create_test_execution(execution_id=execution_id)

        mock_result = Mock()
        mock_result.one_or_none = Mock(return_value=execution)
        mock_session.exec = AsyncMock(return_value=mock_result)

        mock_user = Mock(spec=User)
        service = ExecutionService(session=mock_session, user=mock_user, temporal_service=None)

        with patch.object(service, "_emit_completion_metrics", new_callable=AsyncMock):
            result = await service.get_execution(execution_id)

        assert isinstance(result, ExecutionRead)
        assert result.id == execution_id

    @pytest.mark.asyncio
    async def test_get_execution_success_returns_database_status(self) -> None:
        """Test retrieving execution returns status directly from database."""
        mock_session = Mock(spec=AsyncSession)
        mock_session.commit = AsyncMock()
        mock_session.refresh = AsyncMock()

        execution_id = uuid4()
        execution = self._create_test_execution(
            execution_id=execution_id,
            status=ExecutionStatus.RUNNING,
            temporal_workflow_id="exec-123",
        )

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

        assert isinstance(result, ExecutionRead)
        assert result.id == execution_id
        assert result.status == ExecutionStatus.RUNNING
        # Verify status was NOT synced from Temporal (status comes from database now)
        mock_temporal.get_workflow_status.assert_not_awaited()
        mock_session.commit.assert_not_awaited()

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

        service = ExecutionService(session=mock_session, user=mock_user)

        # Test with valid sort field
        result = await service.list_executions(sort="created_at")
        assert isinstance(result, ResourcesResponseBase)

        # Test with invalid sort field - should raise SafeValueError
        with pytest.raises(SafeValueError, match="Invalid field: invalid_field"):
            await service.list_executions(sort="invalid_field")


class TestListExecutionsWithTemporalSync(TestExecutionServiceBase):
    """Test list_executions_cursor with Temporal synchronization."""

    @pytest.mark.asyncio
    async def test_list_returns_database_status_without_temporal_sync(self) -> None:
        """Test listing executions returns status directly from database without Temporal sync."""
        mock_session = Mock(spec=AsyncSession)
        mock_session.commit = AsyncMock()

        # Create real execution objects with database status
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
        # Verify Temporal was NOT queried (status comes from database now)
        assert mock_temporal.get_workflow_status.await_count == 0
        # Verify no commit (no status changes to persist)
        mock_session.commit.assert_not_awaited()

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


class TestListExecutionActivities(TestExecutionServiceBase):
    """Test list_execution_activities method."""

    @pytest.mark.asyncio
    async def test_list_execution_activities_not_found(self) -> None:
        """Test listing activities for non-existent execution raises error."""
        mock_session = Mock(spec=AsyncSession)
        mock_user = Mock(spec=User)

        execution_id = uuid4()

        # Mock execution not found
        mock_result = Mock()
        mock_result.one_or_none = Mock(return_value=None)
        mock_session.exec = AsyncMock(return_value=mock_result)

        service = ExecutionService(session=mock_session, user=mock_user, temporal_service=None)

        with pytest.raises(ExecutionNotFoundError) as exc_info:
            await service.list_execution_activities(execution_id)

        assert exc_info.value.execution_id == execution_id

    @pytest.mark.asyncio
    async def test_list_execution_activities_delegates_to_list_resources(self) -> None:
        """Test that list_execution_activities delegates to list_resources after verifying execution."""
        mock_session = Mock(spec=AsyncSession)
        mock_user = Mock(spec=User)

        execution_id = uuid4()
        execution = self._create_test_execution(execution_id=execution_id)

        # Mock execution exists check
        mock_execution_result = Mock()
        mock_execution_result.one_or_none = Mock(return_value=execution)
        mock_session.exec = AsyncMock(return_value=mock_execution_result)

        service = ExecutionService(session=mock_session, user=mock_user, temporal_service=None)

        mock_response = Mock()
        with patch.object(service, "list_resources", new_callable=AsyncMock, return_value=mock_response) as mock_lr:
            result = await service.list_execution_activities(
                execution_id=execution_id,
                limit=10,
                sort="-created_at",
            )

        assert result is mock_response
        mock_lr.assert_awaited_once()
        call_kwargs = mock_lr.call_args.kwargs
        assert call_kwargs["limit"] == 10
        assert call_kwargs["sort"] == "-created_at"

    @pytest.mark.asyncio
    async def test_list_execution_activities_field_mapping(self) -> None:
        """Test that activity field mapping returns correct values for activity_name, status, and retry_count."""
        from nexus.workflows.models.activity_execution import ActivityExecution, ActivityStatus

        mock_session = Mock(spec=AsyncSession)
        mock_user = Mock(spec=User)

        execution_id = uuid4()
        execution = self._create_test_execution(execution_id=execution_id)

        # Create a real ActivityExecution with specific field values
        activity_id = uuid4()
        activity = ActivityExecution(
            id=activity_id,
            execution_id=execution_id,
            activity_name="run-script-1",
            activity_definition={"type": "script"},
            temporal_activity_id="run-script-1",
            status=ActivityStatus.COMPLETED,
            started_at=datetime(2025, 1, 1, 10, 0, 0, tzinfo=UTC),
            completed_at=datetime(2025, 1, 1, 10, 1, 0, tzinfo=UTC),
            input_data={"host": "server-1"},
            output_data={"stdout": "ok"},
            error_details=None,
            retry_count=2,
            created_at=datetime(2025, 1, 1, 10, 0, 0, tzinfo=UTC),
            updated_at=datetime(2025, 1, 1, 10, 1, 0, tzinfo=UTC),
        )

        # First call: execution exists check
        mock_execution_result = Mock()
        mock_execution_result.one_or_none = Mock(return_value=execution)

        # Second call: list_resources query returns activities
        mock_activities_result = Mock()
        mock_activities_result.all = Mock(return_value=[activity])

        mock_session.exec = AsyncMock(side_effect=[mock_execution_result, mock_activities_result])

        service = ExecutionService(session=mock_session, user=mock_user, temporal_service=None)
        result = await service.list_execution_activities(execution_id=execution_id, limit=10)

        assert len(result.resources) == 1
        returned_activity = result.resources[0]
        assert returned_activity.activity_name == "run-script-1"
        assert returned_activity.status == ActivityStatus.COMPLETED
        assert returned_activity.retry_count == 2
        assert returned_activity.output_data == {"stdout": "ok"}
        assert returned_activity.input_data == {"host": "server-1"}
        assert returned_activity.started_at == datetime(2025, 1, 1, 10, 0, 0, tzinfo=UTC)
        assert returned_activity.completed_at == datetime(2025, 1, 1, 10, 1, 0, tzinfo=UTC)

    @pytest.mark.asyncio
    async def test_list_execution_activities_empty_list(self) -> None:
        """Test that empty activity list returns empty resources."""
        mock_session = Mock(spec=AsyncSession)
        mock_user = Mock(spec=User)

        execution_id = uuid4()
        execution = self._create_test_execution(execution_id=execution_id)

        # First call: execution exists check
        mock_execution_result = Mock()
        mock_execution_result.one_or_none = Mock(return_value=execution)

        # Second call: no activities found
        mock_activities_result = Mock()
        mock_activities_result.all = Mock(return_value=[])

        mock_session.exec = AsyncMock(side_effect=[mock_execution_result, mock_activities_result])

        service = ExecutionService(session=mock_session, user=mock_user, temporal_service=None)
        result = await service.list_execution_activities(execution_id=execution_id, limit=10)

        assert len(result.resources) == 0
        assert result.resources == []

    @pytest.mark.asyncio
    async def test_list_execution_activities_multiple_activities(self) -> None:
        """Test that multiple activities are returned correctly with proper field values."""
        from nexus.workflows.models.activity_execution import ActivityExecution, ActivityStatus

        mock_session = Mock(spec=AsyncSession)
        mock_user = Mock(spec=User)

        execution_id = uuid4()
        execution = self._create_test_execution(execution_id=execution_id)

        # Create multiple activities with different statuses and field values
        activity1 = ActivityExecution(
            id=uuid4(),
            execution_id=execution_id,
            activity_name="step-1-script",
            activity_definition={"type": "script"},
            temporal_activity_id="step-1-script",
            status=ActivityStatus.COMPLETED,
            started_at=datetime(2025, 1, 1, 10, 0, 0, tzinfo=UTC),
            completed_at=datetime(2025, 1, 1, 10, 1, 0, tzinfo=UTC),
            input_data={"cmd": "echo hello"},
            output_data={"stdout": "hello"},
            error_details=None,
            retry_count=0,
            created_at=datetime(2025, 1, 1, 10, 0, 0, tzinfo=UTC),
            updated_at=datetime(2025, 1, 1, 10, 1, 0, tzinfo=UTC),
        )
        activity2 = ActivityExecution(
            id=uuid4(),
            execution_id=execution_id,
            activity_name="step-2-http",
            activity_definition={"type": "http_request"},
            temporal_activity_id="step-2-http",
            status=ActivityStatus.FAILED,
            started_at=datetime(2025, 1, 1, 10, 2, 0, tzinfo=UTC),
            completed_at=datetime(2025, 1, 1, 10, 3, 0, tzinfo=UTC),
            input_data={"url": "https://example.com"},
            output_data=None,
            error_details="Connection refused",
            retry_count=3,
            created_at=datetime(2025, 1, 1, 10, 2, 0, tzinfo=UTC),
            updated_at=datetime(2025, 1, 1, 10, 3, 0, tzinfo=UTC),
        )
        activity3 = ActivityExecution(
            id=uuid4(),
            execution_id=execution_id,
            activity_name="step-3-pending",
            activity_definition={"type": "approval"},
            temporal_activity_id="step-3-pending",
            status=ActivityStatus.PENDING,
            started_at=None,
            completed_at=None,
            input_data={},
            output_data=None,
            error_details=None,
            retry_count=0,
            created_at=datetime(2025, 1, 1, 10, 4, 0, tzinfo=UTC),
            updated_at=datetime(2025, 1, 1, 10, 4, 0, tzinfo=UTC),
        )

        # First call: execution exists check
        mock_execution_result = Mock()
        mock_execution_result.one_or_none = Mock(return_value=execution)

        # Second call: three activities
        mock_activities_result = Mock()
        mock_activities_result.all = Mock(return_value=[activity1, activity2, activity3])

        mock_session.exec = AsyncMock(side_effect=[mock_execution_result, mock_activities_result])

        service = ExecutionService(session=mock_session, user=mock_user, temporal_service=None)
        result = await service.list_execution_activities(execution_id=execution_id, limit=10)

        assert len(result.resources) == 3

        # Verify first activity (completed script)
        assert result.resources[0].activity_name == "step-1-script"
        assert result.resources[0].status == ActivityStatus.COMPLETED
        assert result.resources[0].retry_count == 0
        assert result.resources[0].output_data == {"stdout": "hello"}
        assert result.resources[0].error_details is None

        # Verify second activity (failed HTTP with retries and error)
        assert result.resources[1].activity_name == "step-2-http"
        assert result.resources[1].status == ActivityStatus.FAILED
        assert result.resources[1].retry_count == 3
        assert result.resources[1].output_data is None
        assert result.resources[1].error_details == "Connection refused"

        # Verify third activity (pending approval)
        assert result.resources[2].activity_name == "step-3-pending"
        assert result.resources[2].status == ActivityStatus.PENDING
        assert result.resources[2].retry_count == 0
        assert result.resources[2].started_at is None
        assert result.resources[2].completed_at is None


class TestHandleActivityCallback(TestExecutionServiceBase):
    """Tests for handle_activity_callback method."""

    def _make_service(self) -> tuple[ExecutionService, AsyncMock]:
        """Create an ExecutionService with mocked temporal_service."""
        mock_session = AsyncMock(spec=AsyncSession)
        mock_user = Mock(spec=User)
        mock_user.id = uuid4()
        mock_temporal = AsyncMock()
        service = ExecutionService(mock_session, mock_user, temporal_service=mock_temporal)
        return service, mock_temporal

    @staticmethod
    def _mock_execution(temporal_workflow_id: str = "wf-123") -> Mock:
        """Create a mock execution with temporal_workflow_id."""
        mock_execution = Mock()
        mock_execution.temporal_workflow_id = temporal_workflow_id
        return mock_execution

    @pytest.mark.asyncio
    async def test_completes_activity_on_success_status(self) -> None:
        """Test that non-failed status calls complete_async_activity."""
        service, mock_temporal = self._make_service()
        service.get_execution = AsyncMock(return_value=self._mock_execution())  # type: ignore[method-assign]
        await service.handle_activity_callback(
            uuid4(),
            "node-1",
            {"status": "completed", "result": "ok"},
        )

        mock_temporal.complete_async_activity.assert_called_once()
        call_kwargs = mock_temporal.complete_async_activity.call_args.kwargs
        assert call_kwargs["result"] == {"output": {"status": "completed", "result": "ok"}}

    @pytest.mark.asyncio
    async def test_completes_activity_on_approved_status(self) -> None:
        """Test that approved status completes (not fails) the activity."""
        service, mock_temporal = self._make_service()
        service.get_execution = AsyncMock(return_value=self._mock_execution())  # type: ignore[method-assign]
        await service.handle_activity_callback(
            uuid4(),
            "approval-1",
            {"status": "approved", "approval_id": "apr-1"},
        )

        mock_temporal.complete_async_activity.assert_called_once()
        mock_temporal.fail_async_activity.assert_not_called()

    @pytest.mark.asyncio
    async def test_completes_activity_on_rejected_status(self) -> None:
        """Test that rejected status completes (not fails) the activity."""
        service, mock_temporal = self._make_service()
        service.get_execution = AsyncMock(return_value=self._mock_execution())  # type: ignore[method-assign]
        await service.handle_activity_callback(
            uuid4(),
            "approval-1",
            {"status": "rejected"},
        )

        mock_temporal.complete_async_activity.assert_called_once()
        mock_temporal.fail_async_activity.assert_not_called()

    @pytest.mark.asyncio
    async def test_fails_activity_on_failed_status(self) -> None:
        """Test that failed status calls fail_async_activity."""
        service, mock_temporal = self._make_service()
        service.get_execution = AsyncMock(return_value=self._mock_execution())  # type: ignore[method-assign]
        await service.handle_activity_callback(
            uuid4(),
            "node-1",
            {"status": "failed", "error": {"message": "LLM error", "error_type": "AgentError"}},
        )

        mock_temporal.fail_async_activity.assert_called_once()
        mock_temporal.complete_async_activity.assert_not_called()
        error = mock_temporal.fail_async_activity.call_args.kwargs["error"]
        assert "AgentError: LLM error" in str(error)

    @pytest.mark.asyncio
    async def test_truncates_long_error_messages(self) -> None:
        """Test that error messages are truncated to 500 characters."""
        service, mock_temporal = self._make_service()
        service.get_execution = AsyncMock(return_value=self._mock_execution())  # type: ignore[method-assign]
        long_msg = "x" * 1000
        await service.handle_activity_callback(
            uuid4(),
            "node-1",
            {"status": "failed", "error": {"message": long_msg}},
        )

        error = mock_temporal.fail_async_activity.call_args.kwargs["error"]
        assert len(str(error)) <= 600  # type + ": " + 500 chars

    @pytest.mark.asyncio
    async def test_handles_non_dict_error_info(self) -> None:
        """Test that string error info is handled gracefully."""
        service, mock_temporal = self._make_service()
        service.get_execution = AsyncMock(return_value=self._mock_execution())  # type: ignore[method-assign]
        await service.handle_activity_callback(
            uuid4(),
            "node-1",
            {"status": "failed", "error": "plain string error"},
        )

        mock_temporal.fail_async_activity.assert_called_once()
        error = mock_temporal.fail_async_activity.call_args.kwargs["error"]
        assert "plain string error" in str(error)

    @pytest.mark.asyncio
    async def test_raises_temporal_unavailable_when_no_service(self) -> None:
        """Test that TemporalUnavailableError is raised when temporal_service is None."""
        from nexus.workflows.exceptions import TemporalUnavailableError

        mock_session = AsyncMock(spec=AsyncSession)
        mock_user = Mock(spec=User)
        mock_user.id = uuid4()
        service = ExecutionService(mock_session, mock_user, temporal_service=None)

        service.get_execution = AsyncMock(return_value=Mock())  # type: ignore[method-assign]
        with pytest.raises(TemporalUnavailableError):
            await service.handle_activity_callback(uuid4(), "node-1", {"status": "completed"})


class TestApplyTriggerSchemaDefaults:
    """Tests for _apply_trigger_schema_defaults static method."""

    MANUAL_TRIGGER: ClassVar[dict[str, Any]] = {
        "id": "trigger_1",
        "type": NodeType.MANUAL_TRIGGER,
        "parameters": {
            "input_schema": {
                "type": "object",
                "properties": {
                    "version": {"type": "string", "default": "latest"},
                    "timeout": {"type": "integer", "default": 30},
                },
            },
        },
    }

    def test_fills_defaults_for_empty_input(self) -> None:
        """Empty input_data gets all schema defaults applied."""
        data: dict[str, Any] = {}
        ExecutionService._apply_trigger_schema_defaults(self.MANUAL_TRIGGER, data)
        assert data == {"version": "latest", "timeout": 30}

    def test_preserves_user_values(self) -> None:
        """User-provided values are not overridden by defaults."""
        data: dict[str, Any] = {"version": "1.0"}
        ExecutionService._apply_trigger_schema_defaults(self.MANUAL_TRIGGER, data)
        assert data == {"version": "1.0", "timeout": 30}

    def test_validates_after_defaults(self) -> None:
        """Invalid input raises TriggerValidationError after defaults are applied."""
        trigger = {
            "id": "t",
            "type": NodeType.MANUAL_TRIGGER,
            "parameters": {
                "input_schema": {
                    "type": "object",
                    "properties": {"count": {"type": "integer", "default": 1}},
                    "required": ["count"],
                },
            },
        }
        data: dict[str, Any] = {"count": "not_an_integer"}
        with pytest.raises(TriggerValidationError, match="Trigger input validation failed"):
            ExecutionService._apply_trigger_schema_defaults(trigger, data)

    def test_webhook_targets_payload(self) -> None:
        """For webhook triggers, defaults are applied to input_data['payload']."""
        trigger = {
            "id": "t",
            "type": NodeType.WEBHOOK_TRIGGER,
            "parameters": {
                "input_schema": {
                    "type": "object",
                    "properties": {"event": {"type": "string", "default": "push"}},
                },
            },
        }
        data: dict[str, Any] = {"payload": {}}
        ExecutionService._apply_trigger_schema_defaults(trigger, data)
        assert data["payload"] == {"event": "push"}

    def test_eda_targets_payload(self) -> None:
        """For EDA triggers, defaults are applied to input_data['payload']."""
        trigger = {
            "id": "t",
            "type": NodeType.EDA_TRIGGER,
            "parameters": {
                "input_schema": {
                    "type": "object",
                    "properties": {"source": {"type": "string", "default": "alertmanager"}},
                },
            },
        }
        data: dict[str, Any] = {"payload": {}}
        ExecutionService._apply_trigger_schema_defaults(trigger, data)
        assert data["payload"] == {"source": "alertmanager"}

    def test_no_input_schema_is_noop(self) -> None:
        """Trigger without input_schema leaves input_data unchanged."""
        trigger = {"id": "t", "type": NodeType.MANUAL_TRIGGER, "parameters": {}}
        data = {"key": "value"}
        ExecutionService._apply_trigger_schema_defaults(trigger, data)
        assert data == {"key": "value"}

    def test_trigger_without_parameters_is_noop(self) -> None:
        """Trigger with no parameters key leaves input_data unchanged."""
        trigger: dict[str, Any] = {"id": "t", "type": NodeType.MANUAL_TRIGGER}
        data = {"key": "value"}
        ExecutionService._apply_trigger_schema_defaults(trigger, data)
        assert data == {"key": "value"}

    def test_ref_in_schema_raises_validation_error(self) -> None:
        """Schema with $ref raises TriggerValidationError (SSRF prevention)."""
        trigger = {
            "id": "t",
            "type": NodeType.MANUAL_TRIGGER,
            "parameters": {
                "input_schema": {
                    "type": "object",
                    "properties": {"data": {"$ref": "http://internal-service/secret"}},
                },
            },
        }
        with pytest.raises(TriggerValidationError):
            ExecutionService._apply_trigger_schema_defaults(trigger, {"data": "test"})

    def test_webhook_missing_payload_gets_defaults(self) -> None:
        """Webhook trigger without payload key creates it and applies defaults."""
        trigger = {
            "id": "t",
            "type": NodeType.WEBHOOK_TRIGGER,
            "parameters": {
                "input_schema": {
                    "type": "object",
                    "properties": {"event": {"type": "string", "default": "push"}},
                },
            },
        }
        data: dict[str, Any] = {}
        ExecutionService._apply_trigger_schema_defaults(trigger, data)
        assert data == {"payload": {"event": "push"}}
