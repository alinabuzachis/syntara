"""Background service for syncing activity executions from Temporal to database.

This service monitors running workflow executions and syncs activity data
to the database in real-time by streaming Temporal history events.
"""

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlmodel import select
from temporalio.api.enums.v1 import EventType
from temporalio.api.history.v1 import HistoryEvent
from temporalio.client import Client, WorkflowHandle
from temporalio.exceptions import TemporalError

from nexus.workflows.models.activity_execution import ActivityExecution, ActivityStatus
from nexus.workflows.models.execution import Execution
from nexus.workflows.models.workflow_version import WorkflowVersion
from nexus.workflows.utils.activity_traversal import (
    build_branch_head_map,
    collect_branch_activity_ids,
    traverse_activities,
)
from nexus.workflows.utils.datetime import ensure_timezone_aware

logger = logging.getLogger(__name__)


class ActivitySyncService:
    """Service for syncing activity executions from Temporal to database in real-time."""

    def __init__(
        self,
        temporal_client: Client,
        session_factory: Any,  # noqa: ANN401 # async_sessionmaker type not directly importable
    ) -> None:
        """Initialize activity sync service.

        Args:
            temporal_client: Temporal client for workflow operations
            session_factory: AsyncSession factory (async_sessionmaker)

        """
        self.temporal_client = temporal_client
        self.session_factory = session_factory
        self._sync_tasks: dict[str, asyncio.Task[None]] = {}
        self._shutdown = False

    def is_monitoring_execution(self, execution_id: UUID) -> bool:
        """Check if an execution is currently being monitored.

        Args:
            execution_id: Database execution ID

        Returns:
            True if monitoring is active for this execution, False otherwise

        """
        task_key = str(execution_id)
        return task_key in self._sync_tasks

    def start_monitoring_execution(self, execution_id: UUID, temporal_workflow_id: str) -> None:
        """Start background monitoring for a specific execution.

        Monitoring continues until the workflow completes or the service shuts down.

        Args:
            execution_id: Database execution ID
            temporal_workflow_id: Temporal workflow ID

        """
        task_key = str(execution_id)

        if task_key in self._sync_tasks:
            logger.warning("Already monitoring execution %s", execution_id)
            return

        logger.info("Starting activity sync monitoring for execution %s", execution_id)

        # Create background task to monitor this execution
        task = asyncio.create_task(
            self._monitor_execution(execution_id, temporal_workflow_id),
            name=f"activity_sync_{execution_id}",
        )
        self._sync_tasks[task_key] = task

        # Add cleanup callback when task completes
        task.add_done_callback(lambda t: self._cleanup_task(execution_id, t))

    def _cleanup_task(self, execution_id: UUID, task: asyncio.Task[None]) -> None:
        """Clean up completed monitoring task.

        Args:
            execution_id: Database execution ID
            task: Completed task

        """
        task_key = str(execution_id)
        self._sync_tasks.pop(task_key, None)

        if task.cancelled():
            logger.debug("Monitoring task for execution %s was cancelled", execution_id)
        elif task.exception():
            logger.error("Monitoring task for execution %s failed: %s", execution_id, task.exception())
        else:
            logger.info("Monitoring task for execution %s completed successfully", execution_id)

    async def shutdown(self) -> None:
        """Shutdown all monitoring tasks gracefully."""
        logger.info("Shutting down activity sync service...")
        self._shutdown = True

        # Cancel all running tasks
        for task in self._sync_tasks.values():
            if not task.done():
                task.cancel()

        # Wait for all tasks to complete
        if self._sync_tasks:
            await asyncio.gather(*self._sync_tasks.values(), return_exceptions=True)

        self._sync_tasks.clear()
        logger.info("Activity sync service shutdown complete")

    async def _initialize_monitoring(
        self, execution_id: UUID
    ) -> tuple[int, UUID, dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
        """Initialize monitoring by fetching execution data and workflow structure.

        Args:
            execution_id: Database execution ID

        Returns:
            Tuple of (last_processed_event_id, workflow_version_id, activity_definitions_map, branch_head_map)

        Raises:
            RuntimeError: If execution not found in database

        """
        async with self.session_factory() as session:
            result = await session.exec(select(Execution).where(Execution.id == execution_id))
            execution = result.one_or_none()

            if not execution:
                msg = f"Execution {execution_id} not found in database"
                logger.error(msg)
                raise RuntimeError(msg)

            last_processed_event_id = execution.last_processed_event_id
            workflow_version_id = execution.workflow_version_id

        activity_definitions_map, activities_list = await self._fetch_activity_definitions_map(workflow_version_id)
        branch_head_map = build_branch_head_map(activities_list)

        await self._create_all_activities_upfront(execution_id, activity_definitions_map)

        return last_processed_event_id, workflow_version_id, activity_definitions_map, branch_head_map

    async def _handle_event_post_processing(
        self,
        event: HistoryEvent,
        execution_id: UUID,
        temp_map: dict[int, dict[str, Any]],
        branch_head_map: dict[str, dict[str, Any]],
        conditions_handled: set[str],
        handle: WorkflowHandle[Any, Any],
    ) -> int | None:
        """Handle post-processing after an event is processed.

        Args:
            event: Temporal history event
            execution_id: Database execution ID
            temp_map: Temporary map of activity data
            branch_head_map: Branch head map for condition tracking
            conditions_handled: Set of already handled condition IDs
            handle: Workflow handle

        Returns:
            Event ID if sync was performed, None otherwise

        """
        if event.event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_STARTED:
            attrs = event.activity_task_started_event_attributes
            scheduled_id = attrs.scheduled_event_id

            if scheduled_id in temp_map:
                activity_id = temp_map[scheduled_id]["activity_id"]
                await self._handle_condition_branch_skipping(
                    execution_id, activity_id, branch_head_map, conditions_handled
                )

        if event.event_type in {
            EventType.EVENT_TYPE_ACTIVITY_TASK_STARTED,
            EventType.EVENT_TYPE_ACTIVITY_TASK_COMPLETED,
            EventType.EVENT_TYPE_ACTIVITY_TASK_FAILED,
            EventType.EVENT_TYPE_ACTIVITY_TASK_TIMED_OUT,
            EventType.EVENT_TYPE_ACTIVITY_TASK_CANCELED,
        }:
            await self._sync_activities_to_db(execution_id, temp_map, handle, event.event_id)
            return event.event_id

        return None

    async def _monitor_execution(self, execution_id: UUID, temporal_workflow_id: str) -> None:
        """Monitor a single execution and sync activities to database.

        Runs until workflow completes or service shuts down.

        Args:
            execution_id: Database execution ID
            temporal_workflow_id: Temporal workflow ID

        """
        try:
            logger.info("Starting activity monitor for execution %s (temporal: %s)", execution_id, temporal_workflow_id)

            handle: WorkflowHandle[Any, Any] = self.temporal_client.get_workflow_handle(temporal_workflow_id)

            last_processed_event_id, _, _, branch_head_map = await self._initialize_monitoring(execution_id)

            conditions_handled: set[str] = set()
            temp_map: dict[int, dict[str, Any]] = {}

            async for event in handle.fetch_history_events(page_size=1000, wait_new_event=True):
                if self._shutdown:
                    logger.info("Shutdown requested, stopping monitoring for execution %s", execution_id)
                    break

                if event.event_id <= last_processed_event_id:
                    continue

                self._process_activity_event(event, temp_map)

                synced_event_id = await self._handle_event_post_processing(
                    event, execution_id, temp_map, branch_head_map, conditions_handled, handle
                )
                if synced_event_id:
                    last_processed_event_id = synced_event_id

            if temp_map and not self._shutdown:
                await self._sync_activities_to_db(execution_id, temp_map, handle, last_processed_event_id)

            logger.info("Activity monitoring completed for execution %s", execution_id)

        except asyncio.CancelledError:
            logger.info("Activity monitoring cancelled for execution %s", execution_id)
            raise
        except TemporalError as e:
            logger.warning("Temporal error while monitoring execution %s: %s", execution_id, e)
        except Exception:
            logger.exception("Error monitoring execution %s", execution_id)

    def _process_activity_scheduled(self, event: HistoryEvent, temp_map: dict[int, dict[str, Any]]) -> None:
        """Process ACTIVITY_TASK_SCHEDULED event."""
        attrs = event.activity_task_scheduled_event_attributes
        if attrs.activity_id.startswith("__internal__"):
            return
        temp_map[event.event_id] = {
            "activity_id": attrs.activity_id,
            "activity_name": attrs.activity_id,
            "status": ActivityStatus.PENDING,
            "started_at": None,
            "completed_at": None,
            "error_details": None,
            "retry_count": 0,
        }

    def _process_activity_started(self, event: HistoryEvent, temp_map: dict[int, dict[str, Any]]) -> None:
        """Process ACTIVITY_TASK_STARTED event."""
        attrs = event.activity_task_started_event_attributes
        scheduled_id = attrs.scheduled_event_id
        if scheduled_id in temp_map:
            # Set status based on attempt number: RUNNING for first attempt, RETRYING for subsequent attempts
            attempt = attrs.attempt if attrs.attempt else 1
            temp_map[scheduled_id]["status"] = ActivityStatus.RETRYING if attempt > 1 else ActivityStatus.RUNNING
            temp_map[scheduled_id]["started_at"] = ensure_timezone_aware(event.event_time)
            temp_map[scheduled_id]["retry_count"] = attempt - 1

    def _process_activity_completed(self, event: HistoryEvent, temp_map: dict[int, dict[str, Any]]) -> None:
        """Process ACTIVITY_TASK_COMPLETED event."""
        attrs = event.activity_task_completed_event_attributes
        scheduled_id = attrs.scheduled_event_id
        if scheduled_id in temp_map:
            temp_map[scheduled_id]["status"] = ActivityStatus.COMPLETED
            temp_map[scheduled_id]["completed_at"] = ensure_timezone_aware(event.event_time)

    def _process_activity_failed(self, event: HistoryEvent, temp_map: dict[int, dict[str, Any]]) -> None:
        """Process ACTIVITY_TASK_FAILED event."""
        attrs = event.activity_task_failed_event_attributes
        scheduled_id = attrs.scheduled_event_id
        if scheduled_id in temp_map:
            temp_map[scheduled_id]["status"] = ActivityStatus.FAILED
            temp_map[scheduled_id]["completed_at"] = ensure_timezone_aware(event.event_time)
            if attrs.failure:
                temp_map[scheduled_id]["error_details"] = attrs.failure.message

    def _process_activity_timed_out(self, event: HistoryEvent, temp_map: dict[int, dict[str, Any]]) -> None:
        """Process ACTIVITY_TASK_TIMED_OUT event."""
        attrs = event.activity_task_timed_out_event_attributes
        scheduled_id = attrs.scheduled_event_id
        if scheduled_id in temp_map:
            temp_map[scheduled_id]["status"] = ActivityStatus.FAILED
            temp_map[scheduled_id]["completed_at"] = ensure_timezone_aware(event.event_time)
            if attrs.failure:
                temp_map[scheduled_id]["error_details"] = attrs.failure.message

    def _process_activity_canceled(self, event: HistoryEvent, temp_map: dict[int, dict[str, Any]]) -> None:
        """Process ACTIVITY_TASK_CANCELED event."""
        attrs = event.activity_task_canceled_event_attributes
        scheduled_id = attrs.scheduled_event_id
        if scheduled_id in temp_map:
            temp_map[scheduled_id]["status"] = ActivityStatus.CANCELLED
            temp_map[scheduled_id]["completed_at"] = ensure_timezone_aware(event.event_time)
            temp_map[scheduled_id]["error_details"] = "Activity was canceled"

    def _process_activity_event(self, event: HistoryEvent, temp_map: dict[int, dict[str, Any]]) -> None:
        """Process a single activity event and update temporary map.

        Args:
            event: Temporal history event
            temp_map: Temporary map to store/update activity data

        """
        event_type = event.event_type

        if event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED:
            self._process_activity_scheduled(event, temp_map)
        elif event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_STARTED:
            self._process_activity_started(event, temp_map)
        elif event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_COMPLETED:
            self._process_activity_completed(event, temp_map)
        elif event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_FAILED:
            self._process_activity_failed(event, temp_map)
        elif event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_TIMED_OUT:
            self._process_activity_timed_out(event, temp_map)
        elif event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_CANCELED:
            self._process_activity_canceled(event, temp_map)

    async def _sync_activities_to_db(
        self,
        execution_id: UUID,
        temp_map: dict[int, dict[str, Any]],
        handle: WorkflowHandle[Any, Any],
        last_event_id: int,
    ) -> None:
        """Sync activities from temporary map to database (UPDATE only).

        Since all activities are created upfront, this method only updates existing records
        with status changes and runtime data from Temporal events.

        Args:
            execution_id: Database execution ID
            temp_map: Temporary map of activity data from events
            handle: Temporal workflow handle for queries
            last_event_id: Last processed event ID

        """
        async with self.session_factory() as session:
            try:
                # Load existing activities (keyed by activity_name for stable lookup)
                result = await session.exec(
                    select(ActivityExecution).where(ActivityExecution.execution_id == execution_id)
                )
                existing_activities = {activity.activity_name: activity for activity in result.all()}

                # Update activities from events
                for activity_data in temp_map.values():
                    activity_id = activity_data["activity_id"]

                    # Skip internal activities (defense in depth)
                    if activity_id.startswith("__internal__"):
                        continue

                    # Find existing activity by activity_name
                    existing = existing_activities.get(activity_id)

                    if not existing:
                        # This shouldn't happen since we created all activities upfront
                        # Log a warning but don't fail
                        logger.warning(
                            "Activity %s not found in database for execution %s (should have been created upfront)",
                            activity_id,
                            execution_id,
                        )
                        continue

                    # Query workflow for input/output data
                    input_data: dict[str, Any] = {}
                    output_data: dict[str, Any] | None = None

                    try:
                        input_data = await handle.query("get_activity_input", activity_id) or {}
                        output_data = await handle.query("get_activity_output", activity_id)
                    except (TemporalError, ValueError) as e:
                        logger.debug("Could not query activity data for %s: %s", activity_id, e)

                    # Update existing activity
                    existing.status = activity_data["status"]
                    existing.started_at = activity_data["started_at"]
                    existing.completed_at = activity_data["completed_at"]
                    existing.input_data = input_data
                    existing.output_data = output_data
                    existing.error_details = activity_data["error_details"]
                    existing.retry_count = activity_data["retry_count"]
                    existing.updated_at = datetime.now(UTC)

                # Update execution's last processed event ID
                result = await session.exec(select(Execution).where(Execution.id == execution_id))
                execution = result.one_or_none()
                if execution:
                    execution.last_processed_event_id = last_event_id

                await session.commit()

            except Exception:
                await session.rollback()
                logger.exception("Error syncing activities to database for execution %s", execution_id)
                raise

    async def _fetch_activity_definitions_map(
        self, workflow_version_id: UUID
    ) -> tuple[dict[str, dict[str, Any]], list[dict[str, Any]]]:
        """Fetch activity definitions from workflow version.

        Args:
            workflow_version_id: Workflow version ID

        Returns:
            Tuple of (activity_definitions_map, activities_list) where:
            - activity_definitions_map: Dictionary mapping activity ID to activity definition
            - activities_list: List of activities from workflow definition (for branch mapping)

        """
        async with self.session_factory() as session:
            result = await session.exec(select(WorkflowVersion).where(WorkflowVersion.id == workflow_version_id))
            workflow_version = result.one_or_none()

            activity_definitions_map: dict[str, dict[str, Any]] = {}
            activities_list: list[dict[str, Any]] = []

            if workflow_version and workflow_version.workflow_definition:
                workflow_def = workflow_version.workflow_definition
                activities_list = workflow_def.get("workflow", {}).get("activities", [])

                traverse_activities(
                    activities_list,
                    lambda activity, _: activity_definitions_map.update({activity["id"]: activity})
                    if "id" in activity
                    else None,
                )

            return activity_definitions_map, activities_list

    async def _handle_condition_branch_skipping(
        self,
        execution_id: UUID,
        activity_id: str,
        branch_head_map: dict[str, dict[str, Any]],
        conditions_handled: set[str],
    ) -> None:
        """Handle condition branch skipping when an activity from a branch starts.

        When an activity that belongs to a condition branch starts executing, we know
        which branch was taken. This method marks all activities in the opposite
        (untriggered) branch as SKIPPED.

        Args:
            execution_id: Database execution ID
            activity_id: ID of the activity that just started
            branch_head_map: Mapping of activities to their parent condition branches
            conditions_handled: Set of condition IDs already processed (modified in place)

        """
        # Check if this activity is in a condition branch
        if activity_id not in branch_head_map:
            return

        branch_info = branch_head_map[activity_id]
        condition_id = branch_info["condition_id"]

        # Only process each condition once
        if condition_id in conditions_handled:
            return

        conditions_handled.add(condition_id)

        # Determine which branch was taken and which to skip
        taken_branch = branch_info["branch"]
        opposite_branch = "else" if taken_branch == "then" else "then"

        # Get opposite branch activities from condition definition
        condition_def = branch_info["condition_def"]
        opposite_branch_activities = condition_def.get(opposite_branch, [])

        # Collect all activity IDs in the opposite branch
        activities_to_skip = collect_branch_activity_ids(opposite_branch_activities)

        # Mark opposite branch activities as SKIPPED
        if activities_to_skip:
            await self._mark_activities_skipped(execution_id, activities_to_skip)
            logger.info(
                "Condition %s took '%s' branch, marked %d activities in '%s' branch as SKIPPED",
                condition_id,
                taken_branch,
                len(activities_to_skip),
                opposite_branch,
            )

    async def _mark_activities_skipped(
        self,
        execution_id: UUID,
        activity_ids: list[str],
    ) -> None:
        """Mark activities as SKIPPED in database.

        Only marks activities that are currently PENDING (doesn't override already-started activities).

        Args:
            execution_id: Database execution ID
            activity_ids: List of activity IDs (activity_name) to mark as SKIPPED

        """
        if not activity_ids:
            return

        async with self.session_factory() as session:
            try:
                # Query all activities with matching activity_name
                result = await session.exec(
                    select(ActivityExecution).where(
                        ActivityExecution.execution_id == execution_id,
                        ActivityExecution.activity_name.in_(activity_ids),  # type: ignore[attr-defined]
                        ActivityExecution.status == ActivityStatus.PENDING,
                    )
                )
                activities = result.all()

                # Update status to SKIPPED
                for activity in activities:
                    activity.status = ActivityStatus.SKIPPED
                    activity.updated_at = datetime.now(UTC)

                await session.commit()

                logger.debug(
                    "Marked %d activities as SKIPPED for execution %s (out of %d requested)",
                    len(activities),
                    execution_id,
                    len(activity_ids),
                )

            except Exception:
                await session.rollback()
                logger.exception("Error marking activities as SKIPPED for execution %s", execution_id)
                raise

    async def _create_all_activities_upfront(
        self,
        execution_id: UUID,
        activity_definitions_map: dict[str, dict[str, Any]],
    ) -> None:
        """Create all ActivityExecution records upfront with status=PENDING.

        This method checks if activities already exist for this execution. If so, it returns
        immediately. Otherwise, it creates ActivityExecution records for all task activities
        in the workflow definition.

        Only task activities are tracked (condition/sequence/parallel/loop containers
        are not created as ActivityExecution records).

        Args:
            execution_id: Database execution ID
            activity_definitions_map: Map of activity definitions from workflow

        """
        async with self.session_factory() as session:
            try:
                # Check if any activities already exist for this execution
                result = await session.exec(
                    select(ActivityExecution).where(ActivityExecution.execution_id == execution_id).limit(1)
                )
                existing = result.one_or_none()

                if existing:
                    logger.debug("Activities already exist for execution %s, skipping upfront creation", execution_id)
                    return

                # Create ActivityExecution records for all trackable activities
                new_activities: list[ActivityExecution] = []

                for activity_id, activity_def in activity_definitions_map.items():
                    activity_type = activity_def.get("type")

                    # Only create records for task activities
                    # Skip condition/sequence/parallel/loop containers
                    if activity_type in ["task", None]:  # None defaults to task
                        new_activity = ActivityExecution(
                            execution_id=execution_id,
                            activity_name=activity_id,
                            activity_definition=activity_def,
                            temporal_activity_id=activity_id,  # Set to activity_name initially
                            status=ActivityStatus.PENDING,
                            started_at=None,
                            completed_at=None,
                            input_data={},
                            output_data=None,
                            error_details=None,
                            retry_count=0,
                            iteration=None,
                        )
                        new_activities.append(new_activity)

                # Bulk insert all activities
                if new_activities:
                    for activity in new_activities:
                        session.add(activity)

                    await session.commit()
                    logger.info(
                        "Created %d ActivityExecution records upfront for execution %s",
                        len(new_activities),
                        execution_id,
                    )

            except Exception:
                await session.rollback()
                logger.exception("Error creating activities upfront for execution %s", execution_id)
                raise
