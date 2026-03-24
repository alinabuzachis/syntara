"""Execution service layer for business logic.

This service encapsulates execution-related business logic, separating it from
HTTP/API concerns in the FastAPI endpoints.
"""

from collections.abc import Iterable
from typing import Any
from uuid import UUID, uuid4

import structlog
from sqlalchemy.orm import selectinload
from sqlmodel import and_, select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.core.models import User
from nexus.core.services import BaseService
from nexus.core.services.extensions import ConvertResourceMixin
from nexus.metrics.dependencies import get_metrics_recorder
from nexus.metrics.emission import emit_completion_metrics
from nexus.metrics.types import MetricType
from nexus.workflows.exceptions import (
    ExecutionNotFoundError,
    TemporalUnavailableError,
    WorkflowDisabledError,
    WorkflowNotFoundError,
)
from nexus.workflows.models.activity_execution import ActivityExecution
from nexus.workflows.models.execution import (
    ActivityData,
    Execution,
    ExecutionInclude,
    ExecutionListResponse,
    ExecutionRead,
    ExecutionStatus,
)
from nexus.workflows.models.workflow import Workflow
from nexus.workflows.models.workflow_version import WorkflowVersion
from nexus.workflows.workflow_engine.services.temporal_execution_service import TemporalExecutionService

logger = structlog.stdlib.get_logger(__name__)


class ExecutionsConvertResourceMixin(ConvertResourceMixin):
    """Execution-specific resource conversion to ExecutionRead format."""

    def __init__(self, include: set[ExecutionInclude] | None = None) -> None:
        """Initialize ExecutionsConvertResourceMixin with optional include parameter."""
        super().__init__()
        self.include = include

    def convert_resource(self, resource: Execution) -> ExecutionRead:  # type: ignore[override]
        """Convert Execution to ExecutionRead format."""
        result = ExecutionRead(
            id=resource.id,
            workflow_id=resource.workflow_id,
            workflow_version_id=resource.workflow_version_id,
            temporal_workflow_id=resource.temporal_workflow_id,
            status=resource.status,
            created_by=resource.created_by,
            created_at=resource.created_at,
            completed_at=resource.completed_at,
            updated_at=resource.updated_at,
            updated_by=resource.updated_by,
            input_data=resource.input_data,
            error_details=resource.error_details,
            labels=resource.labels,
            deleted_at=resource.deleted_at,
            deleted_by=resource.deleted_by,
        )

        if self.include and len(self.include) > 0:
            # Only include workflow_definition if explicitly requested
            if ExecutionInclude.WORKFLOW_DEFINITION in self.include:
                result.workflow_definition = resource.workflow_version.workflow_definition

            # Only include activities if explicitly requested
            if ExecutionInclude.ACTIVITIES in self.include:
                result.activities = [
                    ActivityData(
                        activity_id=activity.activity_name,
                        status=activity.status.value if activity.status else "unknown",
                        error_details=activity.error_details,
                        started_at=activity.started_at,
                        completed_at=activity.completed_at,
                    )
                    for activity in resource.activities
                ]

        return result


class ExecutionService(BaseService):
    """Service for execution business logic.

    This service encapsulates all execution-related business operations,
    including creation, status management, and Temporal integration.
    """

    def __init__(
        self,
        session: AsyncSession,
        user: User,
        temporal_service: TemporalExecutionService | None = None,
    ) -> None:
        """Initialize service with database session.

        Args:
            session: Database session for queries
            user: Current authenticated user
            temporal_service: Optional Temporal execution service for workflow operations

        """
        super().__init__(
            session,
            user,
            convert_resource_mixin=ExecutionsConvertResourceMixin(),
        )
        self.temporal_service = temporal_service

    async def create_execution(
        self,
        workflow_id: UUID,
        input_data: dict[str, Any],
    ) -> ExecutionRead:
        """Create and start a new workflow execution.

        This follows a two-phase creation process:
        1. Start Temporal workflow FIRST (external system validation)
        2. Create database record ONLY after Temporal accepts workflow

        This ensures no orphaned database records if Temporal rejects the workflow.

        Args:
            workflow_id: ID of workflow to execute
            input_data: Input parameters for the workflow

        Returns:
            Created execution with status=PENDING

        Raises:
            WorkflowNotFoundError: If workflow not found
            WorkflowDisabledError: If workflow is disabled
            Exception: If Temporal workflow start fails

        """
        logger.info("Creating execution for workflow by user", workflow_id=workflow_id, user_id=self.user.id)

        recorder = get_metrics_recorder()

        # Step 1: Validate workflow exists and is enabled
        result = await self.session.exec(
            select(Workflow, WorkflowVersion)
            .join(
                WorkflowVersion,
                and_(
                    WorkflowVersion.workflow_id == Workflow.id,
                    WorkflowVersion.version == Workflow.current_version,
                ),
            )
            .where(Workflow.id == workflow_id)
            .where(Workflow.deleted_at.is_(None))  # type: ignore[union-attr]
        )
        row = result.first()

        if row is None:
            raise WorkflowNotFoundError(workflow_id)

        workflow, workflow_version = row

        if not workflow.is_enabled:
            raise WorkflowDisabledError(workflow_id)

        logger.info(
            "Workflow validated",
            workflow_name=workflow.name,
            version=workflow_version.version,
            schema_version=workflow_version.schema_version,
        )

        # Step 2: Start Temporal workflow FIRST (if temporal_service is available)
        if self.temporal_service is not None:
            logger.info("Starting Temporal workflow for execution...")
            temporal_result = await self.temporal_service.start_workflow(
                workflow_def=workflow_version.workflow_definition,
                workflow_name=workflow.name,
                input_data=input_data,
                workflow_id=str(workflow.id),
            )
            temporal_workflow_id = temporal_result.temporal_workflow_id
            execution_id = UUID(temporal_result.execution_id)
            logger.info(
                "Temporal workflow started",
                temporal_workflow_id=temporal_result.temporal_workflow_id,
                temporal_run_id=temporal_result.temporal_run_id,
                execution_id=execution_id,
            )
        else:
            # For testing without Temporal, generate a stub ID
            execution_id = uuid4()
            temporal_workflow_id = f"exec-{execution_id}"
            logger.warning(
                "No Temporal service available, using stub workflow ID", temporal_workflow_id=temporal_workflow_id
            )

        # Step 3: Create execution record in database ONLY after Temporal accepts workflow
        execution = Execution(
            id=execution_id,
            workflow_id=workflow.id,
            workflow_version_id=workflow_version.id,
            temporal_workflow_id=temporal_workflow_id,
            status=ExecutionStatus.PENDING,
            input_data=input_data,
            created_by=self.user.id,
            updated_by=self.user.id,
        )

        self.session.add(execution)
        await self.session.commit()

        logger.info(
            "Execution created successfully",
            execution_id=execution.id,
            temporal_workflow_id=execution.temporal_workflow_id,
        )

        recorder.record(
            MetricType.WORKFLOW_STATUS,
            value=1,
            labels={
                "workflow_id": str(workflow.id),
                "execution_id": str(execution.id),
                "status": "started",
                "workflow_type": workflow.name,
            },
        )
        recorder.increment("total_workflows")
        recorder.increment_gauge("active_workflows")

        return self.convert_resource_mixin.convert_resource(execution)  # type: ignore[no-any-return]

    async def get_execution(self, execution_id: UUID, *, include: set[ExecutionInclude] | None = None) -> ExecutionRead:
        """Get an execution by ID.

        Args:
            execution_id: Execution ID
            include: Optional set of related data to include (workflow_definition, activities)

        Returns:
            ExecutionRead object

        Raises:
            ExecutionNotFoundError: If execution not found

        """
        # Build query with conditional eager loading based on include parameter
        query = (
            select(Execution)
            .where(Execution.id == execution_id)
            .where(Execution.deleted_at.is_(None))  # type: ignore[union-attr]
            .options(selectinload(Execution.workflow))  # type: ignore[arg-type]
        )

        # Eagerly load workflow_version if workflow_definition is requested
        if include and ExecutionInclude.WORKFLOW_DEFINITION in include:
            query = query.options(selectinload(Execution.workflow_version))  # type: ignore[arg-type]

        # Eagerly load activities if activities is requested
        if include and ExecutionInclude.ACTIVITIES in include:
            query = query.options(selectinload(Execution.activities))  # type: ignore[arg-type]

        result = await self.session.exec(query)
        execution = result.one_or_none()

        if execution is None:
            raise ExecutionNotFoundError(execution_id)

        await self._emit_completion_metrics(execution)

        # We need to use an "include"-aware instance of ExecutionsConvertResourceMixin
        mixin: ExecutionsConvertResourceMixin = ExecutionsConvertResourceMixin(include)
        return mixin.convert_resource(execution)

    async def list_executions(
        self,
        limit: int = 20,
        cursor: str | None = None,
        sort: str | None = None,
        query_params_items: Iterable[tuple[str, str]] | None = None,
        *,
        include_total: bool = False,
    ) -> "ExecutionListResponse":
        """List executions with filtering, sorting, and pagination.

        Args:
            limit: Maximum number of executions to return (default 20)
            cursor: Cursor token for pagination
            sort: Sort parameter (e.g., "created_at", "-status")
            query_params_items: Raw query parameter items from request (for filtering)
            include_total: Whether to include total count in response

        Returns:
            ExecutionListResponse with executions, pagination metadata, and optional total

        """
        # Use unified list_resources method with overridden methods
        return await self.list_resources(
            model=Execution,
            response_type=ExecutionListResponse,
            limit=limit,
            cursor=cursor,
            sort=sort or "-created_at",  # Default DESC sort if none provided
            query_params_items=query_params_items,
            include_total=include_total,
        )

    async def get_execution_activities(self, execution_id: UUID) -> list[ActivityExecution]:
        """Get all activities for an execution from database.

        Activities are automatically synced to the database in real-time by the
        ActivitySyncService running in the Temporal worker. This method simply
        queries the database for the current state.

        Args:
            execution_id: Execution ID

        Returns:
            List of activity executions from database, ordered by created_at

        Raises:
            ExecutionNotFoundError: If execution not found

        """
        exec_result = await self.session.exec(
            select(Execution)
            .where(Execution.id == execution_id)
            .where(Execution.deleted_at.is_(None))  # type: ignore[union-attr]
            .options(selectinload(Execution.workflow))  # type: ignore[arg-type]
        )
        execution = exec_result.one_or_none()
        if execution is None:
            raise ExecutionNotFoundError(execution_id)

        # Load all activities from DB (single query), ordered by created_at
        result = await self.session.exec(
            select(ActivityExecution)
            .where(ActivityExecution.execution_id == execution_id)
            .order_by(ActivityExecution.created_at)  # type: ignore[arg-type]
        )
        activities = list(result.all())

        await self._emit_completion_metrics(execution)

        logger.debug(
            "Retrieved activities for execution from database",
            activity_count=len(activities),
            execution_id=execution_id,
        )

        return activities

    async def _emit_completion_metrics(self, execution: Execution) -> None:
        """Emit workflow and activity metrics on first terminal-state read.

        Delegates to ``emission.emit_completion_metrics`` which owns the
        dedup set, terminal-state check and all metric recording.
        """
        recorder = get_metrics_recorder()
        await emit_completion_metrics(self.session, execution, recorder)

    async def send_activity_signal(
        self,
        execution_id: UUID,
        activity_id: str,
        signal_data: dict[str, Any],
    ) -> None:
        """Send a signal to a specific activity in a workflow execution.

        Retrieves the execution from the database to get the temporal_workflow_id,
        then sends the signal via the Temporal execution service.

        Args:
            execution_id: Execution ID
            activity_id: Activity ID from workflow definition
            signal_data: Arbitrary signal data to send to the activity

        Raises:
            ExecutionNotFoundError: If execution not found
            Exception: If Temporal service unavailable or signal fails

        """
        # Get execution to retrieve temporal_workflow_id
        execution = await self.get_execution(execution_id)

        if self.temporal_service is None:
            operation = "signal sending"
            raise TemporalUnavailableError(operation)

        logger.info(
            "Sending signal to activity in execution",
            activity_id=activity_id,
            execution_id=execution_id,
            temporal_workflow_id=execution.temporal_workflow_id,
        )

        # Send signal via Temporal service
        await self.temporal_service.send_activity_signal(
            temporal_workflow_id=execution.temporal_workflow_id,
            activity_id=activity_id,
            signal_data=signal_data,
        )

        logger.info(
            "Signal sent successfully to activity in execution",
            activity_id=activity_id,
            execution_id=execution_id,
        )
