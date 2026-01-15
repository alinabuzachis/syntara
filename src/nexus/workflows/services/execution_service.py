"""Execution service layer for business logic.

This service encapsulates execution-related business logic, separating it from
HTTP/API concerns in the FastAPI endpoints.
"""

import logging
from collections.abc import Iterable
from typing import Any
from uuid import UUID, uuid4

import yaml
from sqlmodel import and_, select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.core.models import User
from nexus.core.services import BaseService
from nexus.core.services.extensions import ConvertResourceMixin, PostProcessingMixin
from nexus.workflows.exceptions import (
    ExecutionNotFoundError,
    TemporalUnavailableError,
    WorkflowDisabledError,
    WorkflowNotFoundError,
)
from nexus.workflows.models.activity_execution import ActivityExecution
from nexus.workflows.models.execution import Execution, ExecutionListResponse, ExecutionRead, ExecutionStatus
from nexus.workflows.models.workflow import Workflow
from nexus.workflows.models.workflow_version import WorkflowVersion
from nexus.workflows.utils.temporal import sync_execution_status_from_temporal
from nexus.workflows.workflow_engine.services.temporal_execution_service import TemporalExecutionService

logger = logging.getLogger(__name__)


class ExecutionsConvertResourceMixin(ConvertResourceMixin):
    """Execution-specific resource conversion to ExecutionRead format."""

    def convert_resource(self, resource: Execution) -> ExecutionRead:  # type: ignore[override]
        """Convert Execution to ExecutionRead format."""
        return ExecutionRead.model_validate(resource)


class ExecutionsPostProcessingMixin(PostProcessingMixin):
    """Post-processing mixin to sync execution status from Temporal after database queries."""

    def __init__(
        self,
        session: AsyncSession,
        temporal_service: TemporalExecutionService | None = None,
    ) -> None:
        """Initialize mixin with database session and temporal service.

        Args:
            session: Database session for queries
            temporal_service: Optional Temporal execution service for workflow operations

        """
        self.session = session
        self.temporal_service = temporal_service

    async def post_process(self, resources: list[Execution]) -> None:  # type: ignore[override]
        """Sync execution status from Temporal after database query."""
        if self.temporal_service is not None:
            changes = [
                await sync_execution_status_from_temporal(execution, self.temporal_service, session=None, persist=False)
                for execution in resources
            ]
            # Commit all changes together if any execution status changed
            if any(changes):
                await self.session.commit()


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
            post_processing_mixin=ExecutionsPostProcessingMixin(session, temporal_service),
        )
        self.temporal_service = temporal_service

    async def create_execution(
        self,
        workflow_id: UUID,
        input_data: dict[str, Any],
    ) -> Execution:
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
        logger.info("Creating execution for workflow %s by user %s", workflow_id, self.user.id)

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
            "Workflow validated: %s (version %d, schema %s)",
            workflow.name,
            workflow_version.version,
            workflow_version.schema_version,
        )

        # Step 2: Start Temporal workflow FIRST (if temporal_service is available)
        if self.temporal_service is not None:
            # Convert workflow definition to YAML for Temporal
            workflow_yaml = yaml.dump(workflow_version.workflow_definition)

            logger.info("Starting Temporal workflow for execution...")
            temporal_result = await self.temporal_service.start_yaml_workflow(
                workflow_yaml=workflow_yaml,
                workflow_name=workflow.name,
                input_data=input_data,
                workflow_id=str(workflow.id),
            )
            temporal_workflow_id = temporal_result.temporal_workflow_id
            execution_id = UUID(temporal_result.execution_id)
            logger.info(
                "Temporal workflow started: %s (run_id: %s, execution_id: %s)",
                temporal_result.temporal_workflow_id,
                temporal_result.temporal_run_id,
                execution_id,
            )
        else:
            # For testing without Temporal, generate a stub ID
            execution_id = uuid4()
            temporal_workflow_id = f"exec-{execution_id}"
            logger.warning("No Temporal service available, using stub workflow ID: %s", temporal_workflow_id)

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
        await self.session.refresh(execution)

        logger.info(
            "Execution created successfully: %s (temporal_workflow_id: %s)",
            execution.id,
            execution.temporal_workflow_id,
        )

        return execution

    async def get_execution(self, execution_id: UUID) -> Execution:
        """Get an execution by ID.

        Always syncs execution status from Temporal before returning to ensure
        the returned execution has the most up-to-date status.

        Args:
            execution_id: Execution ID

        Returns:
            Execution object with current status from Temporal

        Raises:
            ExecutionNotFoundError: If execution not found

        """
        result = await self.session.exec(
            select(Execution).where(Execution.id == execution_id).where(Execution.deleted_at.is_(None))  # type: ignore[union-attr]
        )
        execution = result.one_or_none()

        if execution is None:
            raise ExecutionNotFoundError(execution_id)

        # Sync status from Temporal if available
        if self.temporal_service is not None:
            await sync_execution_status_from_temporal(
                execution, self.temporal_service, session=self.session, persist=True
            )

        return execution

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
        # Verify execution exists
        await self.get_execution(execution_id)

        # Load all activities from DB (single query), ordered by created_at
        result = await self.session.exec(
            select(ActivityExecution)
            .where(ActivityExecution.execution_id == execution_id)
            .order_by(ActivityExecution.created_at)  # type: ignore[arg-type]
        )
        activities = list(result.all())

        logger.debug("Retrieved %d activities for execution %s from database", len(activities), execution_id)

        return activities

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
            "Sending signal to activity %s in execution %s (temporal_workflow_id: %s)",
            activity_id,
            execution_id,
            execution.temporal_workflow_id,
        )

        # Send signal via Temporal service
        await self.temporal_service.send_activity_signal(
            temporal_workflow_id=execution.temporal_workflow_id,
            activity_id=activity_id,
            signal_data=signal_data,
        )

        logger.info(
            "Signal sent successfully to activity %s in execution %s",
            activity_id,
            execution_id,
        )
