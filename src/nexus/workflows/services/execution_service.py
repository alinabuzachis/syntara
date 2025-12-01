"""Execution service layer for business logic.

This service encapsulates execution-related business logic, separating it from
HTTP/API concerns in the FastAPI endpoints.
"""

import logging
from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

import yaml
from sqlmodel import and_, select
from sqlmodel.ext.asyncio.session import AsyncSession
from temporalio.api.enums.v1 import EventType
from temporalio.api.history.v1 import HistoryEvent
from temporalio.exceptions import TemporalError

from nexus.core.models import User
from nexus.core.services import BaseService
from nexus.core.services.extensions import ConvertResourceMixin, PostProcessingMixin
from nexus.workflows.exceptions import (
    ExecutionNotFoundError,
    WorkflowDisabledError,
    WorkflowNotFoundError,
)
from nexus.workflows.models.activity_execution import ActivityExecution, ActivityStatus
from nexus.workflows.models.execution import Execution, ExecutionListResponse, ExecutionRead, ExecutionStatus
from nexus.workflows.models.workflow import Workflow
from nexus.workflows.models.workflow_version import WorkflowVersion
from nexus.workflows.utils.activity_traversal import traverse_activities
from nexus.workflows.utils.datetime import ensure_timezone_aware
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
            )
            temporal_workflow_id = temporal_result.temporal_workflow_id
            logger.info(
                "Temporal workflow started: %s (run_id: %s)",
                temporal_result.temporal_workflow_id,
                temporal_result.temporal_run_id,
            )
        else:
            # For testing without Temporal, generate a stub ID
            temporal_workflow_id = f"exec-{uuid4()}"
            logger.warning("No Temporal service available, using stub workflow ID: %s", temporal_workflow_id)

        # Step 3: Create execution record in database ONLY after Temporal accepts workflow
        execution = Execution(
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

    async def fetch_activity_definitions_map(self, workflow_version_id: UUID) -> dict[str, dict[str, Any]]:
        """Fetch activity definitions from workflow version and build a lookup map.

        Recursively traverses the workflow definition to find all activities at any depth,
        handling sequences (steps), parallels (branches), loops (do), and conditions (then/else).

        Args:
            workflow_version_id: Workflow version ID

        Returns:
            Dictionary mapping activity ID to activity definition

        """
        result = await self.session.exec(select(WorkflowVersion).where(WorkflowVersion.id == workflow_version_id))
        workflow_version = result.one_or_none()

        activity_definitions_map: dict[str, dict[str, Any]] = {}
        if workflow_version and workflow_version.workflow_definition:
            workflow_def = workflow_version.workflow_definition
            activities_list = workflow_def.get("workflow", {}).get("activities", [])

            traverse_activities(
                activities_list,
                lambda activity, _: activity_definitions_map.update({activity["id"]: activity})
                if "id" in activity
                else None,
            )

        return activity_definitions_map

    def _process_activity_scheduled(self, event: HistoryEvent, temp_map: dict[int, dict[str, Any]]) -> None:
        """Process ACTIVITY_TASK_SCHEDULED event.

        Args:
            event: Temporal history event
            temp_map: Temporary map to store activity data

        """
        attrs = event.activity_task_scheduled_event_attributes
        temp_map[event.event_id] = {
            "activity_id": attrs.activity_id,  # Workflow definition activity ID (e.g., "fetch_data")
            "activity_name": attrs.activity_id,  # Same as activity_id - the workflow definition ID
            "status": ActivityStatus.PENDING,
            "started_at": None,
            "completed_at": None,
            "error_details": None,
            "retry_count": 0,
        }

    def _process_activity_started(self, event: HistoryEvent, temp_map: dict[int, dict[str, Any]]) -> None:
        """Process ACTIVITY_TASK_STARTED event.

        Args:
            event: Temporal history event
            temp_map: Temporary map to update activity data

        """
        attrs = event.activity_task_started_event_attributes
        scheduled_id = attrs.scheduled_event_id
        if scheduled_id in temp_map:
            temp_map[scheduled_id]["status"] = ActivityStatus.RUNNING
            temp_map[scheduled_id]["started_at"] = ensure_timezone_aware(event.event_time)
            temp_map[scheduled_id]["retry_count"] = attrs.attempt - 1 if attrs.attempt else 0

    def _process_activity_completed(self, event: HistoryEvent, temp_map: dict[int, dict[str, Any]]) -> None:
        """Process ACTIVITY_TASK_COMPLETED event.

        Args:
            event: Temporal history event
            temp_map: Temporary map to update activity data

        """
        attrs = event.activity_task_completed_event_attributes
        scheduled_id = attrs.scheduled_event_id
        if scheduled_id in temp_map:
            temp_map[scheduled_id]["status"] = ActivityStatus.COMPLETED
            temp_map[scheduled_id]["completed_at"] = ensure_timezone_aware(event.event_time)

    def _process_activity_failed(self, event: HistoryEvent, temp_map: dict[int, dict[str, Any]]) -> None:
        """Process ACTIVITY_TASK_FAILED event.

        Args:
            event: Temporal history event
            temp_map: Temporary map to update activity data

        """
        attrs = event.activity_task_failed_event_attributes
        scheduled_id = attrs.scheduled_event_id
        if scheduled_id in temp_map:
            temp_map[scheduled_id]["status"] = ActivityStatus.FAILED
            temp_map[scheduled_id]["completed_at"] = ensure_timezone_aware(event.event_time)
            if attrs.failure:
                temp_map[scheduled_id]["error_details"] = attrs.failure.message

    def _process_activity_timed_out(self, event: HistoryEvent, temp_map: dict[int, dict[str, Any]]) -> None:
        """Process ACTIVITY_TASK_TIMED_OUT event.

        Args:
            event: Temporal history event
            temp_map: Temporary map to update activity data

        """
        attrs = event.activity_task_timed_out_event_attributes
        scheduled_id = attrs.scheduled_event_id
        if scheduled_id in temp_map:
            temp_map[scheduled_id]["status"] = ActivityStatus.FAILED
            temp_map[scheduled_id]["completed_at"] = ensure_timezone_aware(event.event_time)
            if attrs.failure:
                temp_map[scheduled_id]["error_details"] = attrs.failure.message

    def _process_activity_canceled(self, event: HistoryEvent, temp_map: dict[int, dict[str, Any]]) -> None:
        """Process ACTIVITY_TASK_CANCELED event.

        Args:
            event: Temporal history event
            temp_map: Temporary map to update activity data

        """
        attrs = event.activity_task_canceled_event_attributes
        scheduled_id = attrs.scheduled_event_id
        if scheduled_id in temp_map:
            temp_map[scheduled_id]["status"] = ActivityStatus.FAILED  # Map to FAILED
            temp_map[scheduled_id]["completed_at"] = ensure_timezone_aware(event.event_time)
            temp_map[scheduled_id]["error_details"] = "Activity was canceled"

    async def _fetch_and_parse_activity_events(
        self,
        temporal_workflow_id: str,
        last_processed_event_id: int = 0,
        page_size: int = 1000,
    ) -> tuple[dict[str, dict[str, Any]], int]:
        """Fetch workflow history from Temporal and parse activity lifecycle events.

        Supports incremental processing by skipping events up to last_processed_event_id.
        Uses pagination for memory-efficient processing of large histories.

        Args:
            temporal_workflow_id: Temporal workflow ID
            last_processed_event_id: Skip events with ID <= this value (0 = process all)
            page_size: Number of events to fetch per page (default 1000)

        Returns:
            Tuple of (activities_map, last_event_id):
                - activities_map: Dictionary mapping activity_id to activity data
                - last_event_id: Highest event ID processed

        Raises:
            Exception: If Temporal workflow history fetch fails

        """
        # Get workflow handle
        handle = self.temporal_service.temporal_client.get_workflow_handle(temporal_workflow_id)  # type: ignore[union-attr]

        # Build temporary map using scheduled_event_id to correlate lifecycle events
        temp_map: dict[int, dict[str, Any]] = {}
        last_event_id = last_processed_event_id

        # Event type to handler mapping (reduces complexity)
        event_handlers = {
            EventType.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED: self._process_activity_scheduled,
            EventType.EVENT_TYPE_ACTIVITY_TASK_STARTED: self._process_activity_started,
            EventType.EVENT_TYPE_ACTIVITY_TASK_COMPLETED: self._process_activity_completed,
            EventType.EVENT_TYPE_ACTIVITY_TASK_FAILED: self._process_activity_failed,
            EventType.EVENT_TYPE_ACTIVITY_TASK_TIMED_OUT: self._process_activity_timed_out,
            EventType.EVENT_TYPE_ACTIVITY_TASK_CANCELED: self._process_activity_canceled,
        }

        # Stream events (iterator handles pagination internally)
        async for event in handle.fetch_history_events(page_size=page_size):
            # Skip already-processed events (incremental sync)
            if event.event_id <= last_processed_event_id:
                continue

            # Track latest event ID (events are sequential, so always increasing)
            last_event_id = event.event_id

            # Process activity events using handler mapping
            handler = event_handlers.get(event.event_type)
            if handler:
                handler(event, temp_map)

        # Transform to use activity_id as key for efficient lookup
        activities_map: dict[str, dict[str, Any]] = {}
        for activity_data in temp_map.values():
            activity_id = activity_data["activity_id"]
            activities_map[activity_id] = activity_data

        return activities_map, last_event_id

    def _build_activity_execution(
        self,
        execution_id: UUID,
        activity_data: dict[str, Any],
        activity_definition: dict[str, Any] | None = None,
    ) -> ActivityExecution:
        """Build an ActivityExecution object from activity data.

        Args:
            execution_id: Execution ID
            activity_data: Parsed activity data from Temporal events
            activity_definition: Optional activity definition from workflow version

        Returns:
            ActivityExecution object

        """
        return ActivityExecution(
            execution_id=execution_id,
            activity_name=activity_data["activity_name"],
            activity_definition=activity_definition,
            temporal_activity_id=activity_data["activity_id"],
            status=activity_data["status"],
            started_at=activity_data["started_at"],
            completed_at=activity_data["completed_at"],
            input_data={},  # Temporal history doesn't easily expose decoded input
            output_data=None,  # Temporal history doesn't easily expose decoded output
            error_details=activity_data["error_details"],
            retry_count=activity_data["retry_count"],
            iteration=None,  # Would need custom tracking to get this
        )

    async def get_execution_activities(self, execution_id: UUID) -> list[ActivityExecution]:
        """Get all activities for an execution, with DB persistence.

        Strategy:
        1. Load existing activities from DB
        2. Try to sync from Temporal (if available) - upsert all to DB
        3. If Temporal offline/expired - return existing DB data

        Args:
            execution_id: Execution ID

        Returns:
            List of activity executions from database

        Raises:
            ExecutionNotFoundError: If execution not found

        """
        # Get execution from database
        execution = await self.get_execution(execution_id)

        # Load all existing activities from DB (single query), ordered by created_at
        result = await self.session.exec(
            select(ActivityExecution)
            .where(ActivityExecution.execution_id == execution_id)
            .order_by(ActivityExecution.created_at)  # type: ignore[arg-type]
        )
        existing_activities = list(result.all())

        # If no Temporal service, return existing DB data
        if self.temporal_service is None:
            logger.warning(
                "No Temporal service available, returning %d activities from database for execution %s",
                len(existing_activities),
                execution_id,
            )
            return existing_activities

        # Build lookup dict: temporal_activity_id -> ActivityExecution
        activities_dict = {activity.temporal_activity_id: activity for activity in existing_activities}

        # Fetch activity definitions map
        activity_definitions_map = await self.fetch_activity_definitions_map(execution.workflow_version_id)

        try:
            # Fetch and parse activity events from Temporal (incremental sync)
            temporal_activities_map, last_event_id = await self._fetch_and_parse_activity_events(
                execution.temporal_workflow_id,
                last_processed_event_id=execution.last_processed_event_id,
            )

            # Upsert all activities
            for temporal_activity_id, activity_data in temporal_activities_map.items():
                activity_definition = activity_definitions_map.get(activity_data["activity_id"])
                existing = activities_dict.get(temporal_activity_id)

                if existing:
                    # Update existing activity
                    existing.status = activity_data["status"]
                    existing.activity_name = activity_data["activity_name"]
                    existing.activity_definition = activity_definition
                    existing.started_at = activity_data["started_at"]
                    existing.completed_at = activity_data["completed_at"]
                    existing.error_details = activity_data["error_details"]
                    existing.retry_count = activity_data["retry_count"]
                    existing.updated_at = datetime.now(UTC)
                else:
                    # Create new activity
                    new_activity = self._build_activity_execution(execution.id, activity_data, activity_definition)
                    self.session.add(new_activity)
                    activities_dict[temporal_activity_id] = new_activity

            # Update execution's last processed event ID (incremental sync checkpoint)
            execution.last_processed_event_id = last_event_id

            # Commit changes
            await self.session.commit()

            logger.info(
                "Synced %d activities from Temporal for execution %s (last_processed_event_id: %d)",
                len(activities_dict),
                execution_id,
                last_event_id,
            )
            return list(activities_dict.values())

        except TemporalError as e:
            # Temporal fetch failed (offline or workflow expired) - return existing DB data
            logger.warning(
                "Could not sync from Temporal for execution %s: %s - returning %d activities from database",
                execution_id,
                str(e),
                len(activities_dict),
            )
            return list(activities_dict.values())
