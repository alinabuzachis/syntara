"""Background service for syncing activity executions from Temporal to database.

This service monitors running workflow executions and syncs activity data
to the database in real-time by streaming Temporal history events.
"""

import asyncio
import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from uuid import UUID

import structlog
from jsonpatch import JsonPatch  # type: ignore[import-untyped]
from sqlalchemy.orm import selectinload
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from temporalio.api.enums.v1 import EventType
from temporalio.api.history.v1 import HistoryEvent
from temporalio.client import Client, WorkflowHandle
from temporalio.exceptions import TemporalError

from nexus.core.exceptions import SafeValueError
from nexus.telemetry.events.workflow_emitters import emit_activities, emit_workflow_completed, emit_workflow_start
from nexus.workflows.models.activity_execution import ActivityExecution, ActivityStatus
from nexus.workflows.models.execution import Execution, ExecutionStatus
from nexus.workflows.models.workflow_version import WorkflowVersion
from nexus.workflows.services.activity_update_publisher import ActivityUpdatePublisher
from nexus.workflows.utils.datetime import ensure_timezone_aware
from nexus.workflows.workflow_engine.models.workflow_definition import NodeType

logger = structlog.stdlib.get_logger(__name__)

# Retry parameters for querying activity output after Temporal marks an activity as
# completed but before the workflow loop stores the result in the resolver namespace.
# Uses exponential backoff: 100ms, 200ms, 400ms, 800ms, 1600ms (total ~3.1s).
_OUTPUT_QUERY_MAX_RETRIES = 5
_OUTPUT_QUERY_BASE_DELAY_MS = 100


@dataclass
class ExecutionMonitorMetadata:
    """Metadata required for monitoring a workflow execution.

    This contains all the necessary data structures for monitoring
    and syncing activity executions from Temporal to the database.

    Attributes:
        execution_id: Database execution ID being monitored
        last_processed_event_id: Last event ID that was processed and synced
        activity_definitions_map: Map of activity ID to activity definition from workflow
        activity_index_map: Map of activity names to their indices in the activities list
        pending_activity_updates: Map of event IDs to activity update data awaiting database sync
        request_id: Optional X-Request-Id (UUID) from the originating HTTP request, for telemetry correlation

    """

    execution_id: UUID
    last_processed_event_id: int
    activity_definitions_map: dict[str, dict[str, Any]]
    activity_index_map: dict[str, int]
    pending_activity_updates: dict[int, dict[str, Any]]
    request_id: UUID | None = None


class ActivitySyncService:
    """Service for syncing activity executions from Temporal to database in real-time."""

    def __init__(
        self,
        temporal_client: Client,
        session_factory: Any,  # noqa: ANN401 # async_sessionmaker type not directly importable
        activity_publisher: ActivityUpdatePublisher | None = None,
    ) -> None:
        """Initialize activity sync service.

        Args:
            temporal_client: Temporal client for workflow operations
            session_factory: AsyncSession factory (async_sessionmaker)
            activity_publisher: Publisher for streaming activity updates to Redis (optional)

        """
        self.temporal_client = temporal_client
        self.session_factory = session_factory
        self.activity_publisher = activity_publisher or ActivityUpdatePublisher()
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

    def start_monitoring_execution(
        self,
        execution_id: UUID,
        temporal_workflow_id: str,
        *,
        request_id: UUID | None = None,
    ) -> None:
        """Start background monitoring for a specific execution.

        Monitoring continues until the workflow completes or the service shuts down.

        Args:
            execution_id: Database execution ID
            temporal_workflow_id: Temporal workflow ID
            request_id: Optional X-Request-Id from the originating HTTP request

        """
        task_key = str(execution_id)

        if task_key in self._sync_tasks:
            logger.warning("Already monitoring execution", execution_id=execution_id)
            return

        logger.info("Starting activity sync monitoring for execution", execution_id=execution_id)

        # Create background task to monitor this execution
        task = asyncio.create_task(
            self._monitor_execution(execution_id, temporal_workflow_id, request_id=request_id),
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
            logger.debug("Monitoring task for execution was cancelled", execution_id=execution_id)
        elif task.exception():
            logger.error("Monitoring task for execution failed", execution_id=execution_id, error=str(task.exception()))
        else:
            logger.info("Monitoring task for execution completed successfully", execution_id=execution_id)

    async def _publish_snapshot_safely(
        self,
        session: AsyncSession,
        execution_id: UUID,
        snapshot_type: Literal["initial_snapshot", "final_snapshot"],
    ) -> None:
        """Load execution with activities and publish a snapshot (best-effort).

        Args:
            session: Active database session (post-commit).
            execution_id: Execution UUID to snapshot.
            snapshot_type: Either ``"initial_snapshot"`` or ``"final_snapshot"``.

        """
        try:
            query = select(Execution).where(Execution.id == execution_id)
            query = query.options(selectinload(Execution.activities))  # type: ignore[arg-type]
            result = await session.exec(query)
            execution = result.one_or_none()
            if execution:
                await self.activity_publisher.publish_snapshot(execution, snapshot_type)
                logger.debug("Published snapshot for execution", execution_id=execution_id, snapshot_type=snapshot_type)
        except Exception:
            logger.exception(
                "Failed to publish snapshot (non-fatal)", execution_id=execution_id, snapshot_type=snapshot_type
            )

    async def _update_execution_to_running(self, metadata: ExecutionMonitorMetadata, event: HistoryEvent) -> None:
        """Update execution status to RUNNING when workflow starts.

        Only updates if execution is in PENDING state (idempotent for service restarts).

        Args:
            metadata: Monitoring metadata containing execution and related data
            event: Temporal workflow started event

        """
        async with self.session_factory() as session:
            try:
                result = await session.exec(select(Execution).where(Execution.id == metadata.execution_id))
                execution = result.one_or_none()

                if not execution:
                    logger.warning("Execution not found when updating to RUNNING", execution_id=metadata.execution_id)
                    return

                # Only update if currently PENDING (defensive check for race conditions)
                if execution.status == ExecutionStatus.PENDING:
                    execution.status = ExecutionStatus.RUNNING
                    execution.last_processed_event_id = event.event_id
                    execution.updated_at = datetime.now(UTC)
                    await session.commit()
                    logger.info("Updated execution to RUNNING status", execution_id=metadata.execution_id)

                    # Publish snapshot so WebSocket clients see the RUNNING status
                    await self._publish_snapshot_safely(session, metadata.execution_id, "initial_snapshot")

                    # Emit workflow start telemetry
                    emit_workflow_start(execution, request_id=metadata.request_id)
                else:
                    logger.debug(
                        "Skipping RUNNING update for execution - already in state",
                        execution_id=metadata.execution_id,
                        current_status=execution.status.value,
                    )
            except Exception:
                await session.rollback()
                logger.exception("Error updating execution to RUNNING", execution_id=metadata.execution_id)
                # Don't raise - this is non-critical, monitoring should continue

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
        self,
        execution_id: UUID,
        *,
        request_id: UUID | None = None,
    ) -> ExecutionMonitorMetadata:
        """Initialize monitoring by fetching execution data and workflow structure.

        Args:
            execution_id: Database execution ID
            request_id: Optional X-Request-Id from the originating HTTP request

        Returns:
            ExecutionMonitorMetadata containing execution and related data structures

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

            # Extract needed fields from execution
            workflow_version_id = execution.workflow_version_id
            last_processed_event_id = execution.last_processed_event_id

        activity_definitions_map = await self._fetch_activity_definitions_map(workflow_version_id)

        await self._create_all_activities_upfront(execution_id, activity_definitions_map)

        # Build activity index map after activities are created (for patch generation)
        activity_index_map = await self._build_activity_index_map(execution_id)

        return ExecutionMonitorMetadata(
            execution_id=execution_id,
            last_processed_event_id=last_processed_event_id,
            activity_definitions_map=activity_definitions_map,
            activity_index_map=activity_index_map,
            pending_activity_updates={},
            request_id=request_id,
        )

    async def _build_activity_index_map(self, execution_id: UUID) -> dict[str, int]:
        """Build mapping from activity_name to index in activities list.

        This mapping is used for JSON Patch generation to identify activity positions
        in the activities array without repeatedly querying the database.

        Args:
            execution_id: Database execution ID

        Returns:
            Dictionary mapping activity_name to its index in the ordered activities list

        """
        async with self.session_factory() as session:
            result = await session.exec(
                select(ActivityExecution)
                .where(ActivityExecution.execution_id == execution_id)
                .order_by(ActivityExecution.created_at, ActivityExecution.activity_name)  # type: ignore[arg-type]
            )
            activities = result.all()
            return {activity.activity_name: idx for idx, activity in enumerate(activities)}

    async def _handle_event_post_processing(
        self,
        event: HistoryEvent,
        metadata: ExecutionMonitorMetadata,
        handle: WorkflowHandle[Any, Any],
    ) -> int | None:
        """Handle post-processing after an event is processed.

        Args:
            event: Temporal history event
            metadata: Monitoring metadata containing execution and related data
            handle: Workflow handle

        Returns:
            Event ID if sync was performed, None otherwise

        """
        # Sync skipped nodes after control node completions that cause branching
        if event.event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_COMPLETED:
            attrs = event.activity_task_completed_event_attributes
            scheduled_id = attrs.scheduled_event_id

            if scheduled_id in metadata.pending_activity_updates:
                activity_id = metadata.pending_activity_updates[scheduled_id]["activity_id"]
                # Check if this is a control node that causes branch skipping
                activity_def = metadata.activity_definitions_map.get(activity_id, {})
                activity_type = activity_def.get("type")

                # Sync skipped nodes after condition completes (V2 workflows)
                # Note: Only condition nodes cause branch skipping via port routing:
                #   - Condition: Returns next_port ("true"/"false"), marks non-taken branch as skipped
                #   - Loop: "iterate" and "complete" ports both execute at different times (no skipping)
                #   - Converge: Waits for all predecessors (no skipping)
                #   - Approval: TBD - needs design clarification on port-based routing
                if activity_type == NodeType.CONDITION:
                    await self._sync_skipped_nodes(metadata.execution_id, handle)

        if event.event_type in {
            EventType.EVENT_TYPE_ACTIVITY_TASK_STARTED,
            EventType.EVENT_TYPE_ACTIVITY_TASK_COMPLETED,
            EventType.EVENT_TYPE_ACTIVITY_TASK_FAILED,
            EventType.EVENT_TYPE_ACTIVITY_TASK_TIMED_OUT,
            EventType.EVENT_TYPE_ACTIVITY_TASK_CANCELED,
        }:
            # Update metadata with the event ID before syncing
            metadata.last_processed_event_id = event.event_id
            await self._sync_activities_to_db(metadata, handle)
            return event.event_id

        return None

    async def _monitor_execution(  # noqa: C901
        self,
        execution_id: UUID,
        temporal_workflow_id: str,
        *,
        request_id: UUID | None = None,
    ) -> None:
        """Monitor a single execution and sync activities to database.

        Runs until workflow completes or service shuts down.

        Args:
            execution_id: Database execution ID
            temporal_workflow_id: Temporal workflow ID
            request_id: Optional X-Request-Id from the originating HTTP request

        """
        try:
            logger.info(
                "Starting activity monitor for execution (temporal)",
                execution_id=execution_id,
                temporal_workflow_id=temporal_workflow_id,
            )

            handle: WorkflowHandle[Any, Any] = self.temporal_client.get_workflow_handle(temporal_workflow_id)

            metadata = await self._initialize_monitoring(execution_id, request_id=request_id)

            async for event in handle.fetch_history_events(page_size=1000, wait_new_event=True):
                if self._shutdown:
                    logger.info("Shutdown requested, stopping monitoring for execution", execution_id=execution_id)
                    break

                if event.event_id <= metadata.last_processed_event_id:
                    continue

                # Handle workflow execution started event
                if event.event_type == EventType.EVENT_TYPE_WORKFLOW_EXECUTION_STARTED:
                    await self._update_execution_to_running(metadata, event)
                    metadata.last_processed_event_id = event.event_id
                    continue  # Skip activity processing for workflow events

                # Handle workflow completion events
                if event.event_type in {
                    EventType.EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED,
                    EventType.EVENT_TYPE_WORKFLOW_EXECUTION_FAILED,
                    EventType.EVENT_TYPE_WORKFLOW_EXECUTION_CANCELED,
                    EventType.EVENT_TYPE_WORKFLOW_EXECUTION_TIMED_OUT,
                    EventType.EVENT_TYPE_WORKFLOW_EXECUTION_TERMINATED,
                }:
                    await self._update_execution_status_from_event(metadata, event, handle)
                    # Final sync of skipped nodes at workflow completion
                    await self._sync_skipped_nodes(execution_id, handle)
                    metadata.last_processed_event_id = event.event_id
                    continue  # Skip activity processing, likely last event

                # Process activity events
                self._process_activity_event(event, metadata)

                synced_event_id = await self._handle_event_post_processing(event, metadata, handle)
                if synced_event_id:
                    metadata.last_processed_event_id = synced_event_id

            if metadata.pending_activity_updates and not self._shutdown:
                await self._sync_activities_to_db(metadata, handle)

            logger.info("Activity monitoring completed for execution", execution_id=execution_id)

        except asyncio.CancelledError:
            logger.info("Activity monitoring cancelled for execution", execution_id=execution_id)
            raise
        except TemporalError as e:
            logger.warning(
                "Temporal error while monitoring execution, will not retry",
                execution_id=execution_id,
                error=str(e),
            )
        except Exception:
            logger.exception("Error monitoring execution", execution_id=execution_id)

    def _process_activity_scheduled(self, event: HistoryEvent, metadata: ExecutionMonitorMetadata) -> None:
        """Process ACTIVITY_TASK_SCHEDULED event."""
        attrs = event.activity_task_scheduled_event_attributes
        if attrs.activity_id.startswith("__internal__"):
            return
        base_activity_id = re.sub(r"_iter_\d+$", "", attrs.activity_id)
        metadata.pending_activity_updates[event.event_id] = {
            "activity_id": base_activity_id,
            "activity_name": base_activity_id,
            "status": ActivityStatus.PENDING,
            "started_at": None,
            "completed_at": None,
            "error_details": None,
            "retry_count": 0,
        }

    def _process_activity_started(self, event: HistoryEvent, metadata: ExecutionMonitorMetadata) -> None:
        """Process ACTIVITY_TASK_STARTED event."""
        attrs = event.activity_task_started_event_attributes
        scheduled_id = attrs.scheduled_event_id
        if scheduled_id in metadata.pending_activity_updates:
            # Set status based on attempt number: RUNNING for first attempt, RETRYING for subsequent attempts
            attempt = attrs.attempt or 1
            metadata.pending_activity_updates[scheduled_id]["status"] = (
                ActivityStatus.RETRYING if attempt > 1 else ActivityStatus.RUNNING
            )
            metadata.pending_activity_updates[scheduled_id]["started_at"] = ensure_timezone_aware(event.event_time)
            metadata.pending_activity_updates[scheduled_id]["retry_count"] = attempt - 1

    @staticmethod
    def _is_agentic_activity(activity_def: dict[str, Any]) -> bool:
        """Check whether an activity definition uses the agentic executor."""
        # V2: node type is directly "agentic"
        if activity_def.get("type") == "agentic":
            return True
        # V1 fallback: nested under task.executor
        task = activity_def.get("task")
        return isinstance(task, dict) and task.get("executor") == "agentic"

    @staticmethod
    def _parse_error_from_output(output: dict[str, Any] | None) -> str | None:
        """Extract error message from a v2 activity output if status is failed.

        Returns the error message string, or None if the output is not a failure.
        """
        if not isinstance(output, dict) or output.get("status") != "failed":
            return None
        error_info = output.get("error", {})
        if isinstance(error_info, dict):
            return str(error_info.get("message", "Activity failed"))
        return str(error_info) if error_info else "Activity failed"

    def _process_activity_completed(self, event: HistoryEvent, metadata: ExecutionMonitorMetadata) -> None:
        """Process ACTIVITY_TASK_COMPLETED event.

        For agentic activities, ``ActivityTaskCompleted`` means the HTTP
        invocation was dispatched — the actual agent result arrives later via
        signal.  These entries are removed from pending updates so the workflow
        completion handler can set the correct terminal status.
        """
        attrs = event.activity_task_completed_event_attributes
        scheduled_id = attrs.scheduled_event_id
        if scheduled_id in metadata.pending_activity_updates:
            activity_id = metadata.pending_activity_updates[scheduled_id]["activity_id"]
            activity_def = metadata.activity_definitions_map.get(activity_id, {})

            if self._is_agentic_activity(activity_def):
                del metadata.pending_activity_updates[scheduled_id]
            else:
                # Check if the activity returned a v2 error (status: "failed" in output)
                status = ActivityStatus.COMPLETED
                error_details = None
                if attrs.result and attrs.result.payloads:
                    try:
                        result_data = json.loads(attrs.result.payloads[0].data)
                        if isinstance(result_data, dict):
                            output = result_data.get("output", result_data)
                            error_msg = self._parse_error_from_output(output)
                            if error_msg is not None:
                                status = ActivityStatus.FAILED
                                error_details = error_msg
                    except Exception:  # noqa: BLE001
                        logger.debug("Failed to parse activity result for v2 error detection", exc_info=True)

                metadata.pending_activity_updates[scheduled_id]["status"] = status
                metadata.pending_activity_updates[scheduled_id]["completed_at"] = ensure_timezone_aware(
                    event.event_time
                )
                if error_details:
                    metadata.pending_activity_updates[scheduled_id]["error_details"] = error_details

    def _process_activity_failed(self, event: HistoryEvent, metadata: ExecutionMonitorMetadata) -> None:
        """Process ACTIVITY_TASK_FAILED event."""
        attrs = event.activity_task_failed_event_attributes
        scheduled_id = attrs.scheduled_event_id
        if scheduled_id in metadata.pending_activity_updates:
            metadata.pending_activity_updates[scheduled_id]["status"] = ActivityStatus.FAILED
            metadata.pending_activity_updates[scheduled_id]["completed_at"] = ensure_timezone_aware(event.event_time)
            if attrs.failure:
                metadata.pending_activity_updates[scheduled_id]["error_details"] = attrs.failure.message

    def _process_activity_timed_out(self, event: HistoryEvent, metadata: ExecutionMonitorMetadata) -> None:
        """Process ACTIVITY_TASK_TIMED_OUT event."""
        attrs = event.activity_task_timed_out_event_attributes
        scheduled_id = attrs.scheduled_event_id
        if scheduled_id in metadata.pending_activity_updates:
            metadata.pending_activity_updates[scheduled_id]["status"] = ActivityStatus.FAILED
            metadata.pending_activity_updates[scheduled_id]["completed_at"] = ensure_timezone_aware(event.event_time)
            if attrs.failure:
                metadata.pending_activity_updates[scheduled_id]["error_details"] = attrs.failure.message

    def _process_activity_canceled(self, event: HistoryEvent, metadata: ExecutionMonitorMetadata) -> None:
        """Process ACTIVITY_TASK_CANCELED event."""
        attrs = event.activity_task_canceled_event_attributes
        scheduled_id = attrs.scheduled_event_id
        if scheduled_id in metadata.pending_activity_updates:
            metadata.pending_activity_updates[scheduled_id]["status"] = ActivityStatus.CANCELLED
            metadata.pending_activity_updates[scheduled_id]["completed_at"] = ensure_timezone_aware(event.event_time)
            metadata.pending_activity_updates[scheduled_id]["error_details"] = "Activity was canceled"

    def _extract_execution_status_from_event(self, event: HistoryEvent) -> tuple[ExecutionStatus, datetime, str | None]:
        """Extract execution status, completion time, and error from workflow completion event.

        Args:
            event: Temporal workflow completion event

        Returns:
            Tuple of (status, completed_at, error_details)

        Raises:
            ValueError: If event is not a workflow completion event

        """
        event_type = event.event_type
        completed_at = ensure_timezone_aware(event.event_time)
        error_details = None

        if event_type == EventType.EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED:
            # Check workflow result for internal failure status (e.g., node failures
            # that don't raise exceptions but return status: "failed" in the result)
            status = ExecutionStatus.COMPLETED
            completed_attrs = event.workflow_execution_completed_event_attributes
            if completed_attrs and completed_attrs.result and completed_attrs.result.payloads:
                try:
                    payload = completed_attrs.result.payloads[0]
                    result_data = json.loads(payload.data)
                    if isinstance(result_data, dict) and result_data.get("status") == "failed":
                        status = ExecutionStatus.FAILED
                        error_details = self._extract_failed_activity_errors(result_data)
                except Exception:  # noqa: BLE001
                    logger.warning("Failed to parse workflow result for failure detection", exc_info=True)
        elif event_type == EventType.EVENT_TYPE_WORKFLOW_EXECUTION_FAILED:
            status = ExecutionStatus.FAILED
            failed_attrs = event.workflow_execution_failed_event_attributes
            if failed_attrs and failed_attrs.failure:
                error_details = failed_attrs.failure.message
        elif event_type == EventType.EVENT_TYPE_WORKFLOW_EXECUTION_CANCELED:
            status = ExecutionStatus.CANCELLED
        elif event_type == EventType.EVENT_TYPE_WORKFLOW_EXECUTION_TIMED_OUT:
            status = ExecutionStatus.FAILED
            error_details = "Workflow execution timed out"
        elif event_type == EventType.EVENT_TYPE_WORKFLOW_EXECUTION_TERMINATED:
            status = ExecutionStatus.CANCELLED
            error_details = "Workflow was forcibly terminated"
        else:
            msg = f"Event type {event_type} is not a workflow completion event"
            raise SafeValueError(msg)

        return status, completed_at, error_details

    @staticmethod
    def _extract_failed_activity_errors(result_data: dict[str, Any]) -> str:
        """Extract error messages from failed workflow activities.

        Uses failed_activities dict from the workflow result, which is always
        present when nodes fail (populated by _build_result in dynamic_workflow.py).

        Args:
            result_data: Workflow result dict containing failed_activities

        Returns:
            Human-readable error string with failed node details

        """
        failed_activities = result_data.get("failed_activities", {})
        if isinstance(failed_activities, dict) and failed_activities:
            errors = [f"{node_id}: {error}" for node_id, error in failed_activities.items()]
            return "; ".join(errors)
        return "One or more workflow activities failed"

    async def _update_execution_status_from_event(  # noqa: C901, PLR0912, PLR0915
        self,
        metadata: ExecutionMonitorMetadata,
        event: HistoryEvent,
        handle: WorkflowHandle[Any, Any],
    ) -> None:
        """Update execution status to terminal state when workflow completes.

        Args:
            metadata: Monitoring metadata containing execution and related data
            event: Temporal workflow completion event
            handle: Temporal workflow handle for querying activity data

        """
        async with self.session_factory() as session:
            try:
                # Load execution with activities (selectinload respects relationship order_by)
                query = select(Execution).where(Execution.id == metadata.execution_id)
                query = query.options(selectinload(Execution.activities))  # type: ignore[arg-type]
                result = await session.exec(query)
                execution = result.one_or_none()

                if not execution:
                    logger.warning(
                        "Execution not found when processing workflow completion", execution_id=metadata.execution_id
                    )
                    return

                terminal_states = {ExecutionStatus.COMPLETED, ExecutionStatus.FAILED, ExecutionStatus.CANCELLED}

                # Only update if not already in terminal state (idempotency)
                if execution.status in terminal_states:
                    logger.debug(
                        "Execution already in terminal state",
                        execution_id=metadata.execution_id,
                        status=execution.status.value,
                    )
                    return

                # Extract status, timestamp, and error details from event
                status, completed_at, error_details = self._extract_execution_status_from_event(event)

                # Ensure completed_at > created_at (database constraint)
                if completed_at <= execution.created_at:
                    completed_at = execution.created_at + timedelta(microseconds=1)
                    logger.warning(
                        "Workflow completed before execution created, adjusting",
                        temporal_workflow_id=execution.temporal_workflow_id,
                        completed_at=completed_at.isoformat(),
                        created_at=execution.created_at.isoformat(),
                        adjusted_completed_at=completed_at.isoformat(),
                    )

                # Update execution to terminal state
                execution.status = status
                execution.completed_at = completed_at
                execution.last_processed_event_id = event.event_id
                if error_details:
                    execution.error_details = error_details
                execution.updated_at = datetime.now(UTC)

                # Finalize agentic activities at workflow completion.
                # Agentic activities skip normal status tracking because the actual
                # result arrives via signal after the Temporal activity returns.
                # At workflow completion, we set the correct terminal status and
                # query output data that wasn't available during event processing.
                if execution.activities:
                    # When workflow failed: fix agentic nodes that are RUNNING or
                    # incorrectly COMPLETED (signal reported failure after sync)
                    # When workflow completed: finalize any still-RUNNING agentic nodes
                    agentic_statuses_to_fix = (
                        {ActivityStatus.RUNNING, ActivityStatus.COMPLETED}
                        if status in {ExecutionStatus.FAILED, ExecutionStatus.CANCELLED}
                        else {ActivityStatus.RUNNING}
                    )
                    agentic_to_finalize = [
                        act
                        for act in execution.activities
                        if act.status in agentic_statuses_to_fix
                        and self._is_agentic_activity(act.activity_definition or {})
                    ]

                    if agentic_to_finalize:
                        if status == ExecutionStatus.COMPLETED:
                            final_status: ActivityStatus | None = ActivityStatus.COMPLETED
                            final_error = None
                        elif status in {ExecutionStatus.FAILED, ExecutionStatus.CANCELLED}:
                            final_status = ActivityStatus.FAILED
                            final_error = error_details
                        else:
                            final_status = None

                        if final_status is not None:
                            for act in agentic_to_finalize:
                                act.status = final_status
                                act.completed_at = completed_at
                                act.error_details = final_error
                                # Query output data from workflow namespace
                                activity_id = act.activity_name or act.temporal_activity_id
                                if activity_id:
                                    try:
                                        output_data = await handle.query("get_activity_output", activity_id)
                                        act.output_data = output_data if isinstance(output_data, dict) else None
                                    except Exception:  # noqa: BLE001
                                        logger.debug(
                                            "Could not retrieve agentic activity output",
                                            activity_id=activity_id,
                                        )

                await session.commit()

                logger.info(
                    "Updated execution to status at time",
                    execution_id=metadata.execution_id,
                    status=status.value,
                    completed_at=completed_at.isoformat(),
                )

                # Publish final snapshot after execution reaches terminal state
                try:
                    await self.activity_publisher.publish_snapshot(execution, "final_snapshot")
                    logger.debug("Published final snapshot for execution", execution_id=metadata.execution_id)
                except Exception:
                    # Log error but don't fail (publishing is best-effort)
                    logger.exception(
                        "Failed to publish final snapshot for execution (non-fatal)", execution_id=metadata.execution_id
                    )

                # Emit workflow completed telemetry (activity counts are now accurate)
                emit_workflow_completed(
                    execution=execution,
                    status=status,
                    completed_at=completed_at,
                    error_details=error_details,
                    request_id=metadata.request_id,
                )

            except Exception:
                await session.rollback()
                logger.exception(
                    "Error updating execution status from workflow completion event", execution_id=metadata.execution_id
                )
                # Don't raise - monitoring should continue

    def _process_activity_event(self, event: HistoryEvent, metadata: ExecutionMonitorMetadata) -> None:
        """Process a single activity event and update metadata's pending updates.

        Args:
            event: Temporal history event
            metadata: Monitoring metadata containing pending activity updates

        """
        event_type = event.event_type

        if event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED:
            self._process_activity_scheduled(event, metadata)
        elif event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_STARTED:
            self._process_activity_started(event, metadata)
        elif event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_COMPLETED:
            self._process_activity_completed(event, metadata)
        elif event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_FAILED:
            self._process_activity_failed(event, metadata)
        elif event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_TIMED_OUT:
            self._process_activity_timed_out(event, metadata)
        elif event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_CANCELED:
            self._process_activity_canceled(event, metadata)

    async def _sync_activities_to_db(  # noqa: C901, PLR0915
        self,
        metadata: ExecutionMonitorMetadata,
        handle: WorkflowHandle[Any, Any],
    ) -> None:
        """Sync activities from pending updates to database (UPDATE only).

        Since all activities are created upfront, this method only updates existing records
        with status changes and runtime data from Temporal events.

        Args:
            metadata: Monitoring metadata containing execution and pending updates
            handle: Temporal workflow handle for queries

        """
        async with self.session_factory() as session:
            try:
                # Load existing activities with proper ordering (matches relationship order_by)
                result = await session.exec(
                    select(ActivityExecution)
                    .where(ActivityExecution.execution_id == metadata.execution_id)
                    .order_by(ActivityExecution.created_at, ActivityExecution.activity_name)  # type: ignore[arg-type]
                )
                existing_activities_list = result.all()
                existing_activities = {activity.activity_name: activity for activity in existing_activities_list}

                # Track which activities were updated for patch generation
                updated_activities: list[tuple[ActivityExecution, dict[str, Any]]] = []

                # Update activities from events
                for activity_data in metadata.pending_activity_updates.values():
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
                            "Activity not found in database for execution (should have been created upfront)",
                            activity_id=activity_id,
                            execution_id=metadata.execution_id,
                        )
                        continue

                    # Query workflow for input/output data
                    input_data: dict[str, Any] = {}
                    output_data: dict[str, Any] | None = None

                    try:
                        input_data = await handle.query("get_activity_input", activity_id) or {}
                        output_data = await handle.query("get_activity_output", activity_id)

                        # Race condition mitigation: If activity is completed but output is None,
                        # retry the query. This handles the case where Temporal emits the
                        # ACTIVITY_TASK_COMPLETED event before the workflow's async loop
                        # stores the result in the resolver namespace.
                        
                        # (e.g., workflow signal after output is stored).
                        if activity_data["status"] == ActivityStatus.COMPLETED and output_data is None:
                            max_retries = _OUTPUT_QUERY_MAX_RETRIES
                            for retry in range(max_retries):
                                delay_ms = _OUTPUT_QUERY_BASE_DELAY_MS * (2**retry)
                                logger.debug(
                                    "Activity completed but output is None, retrying query",
                                    activity_id=activity_id,
                                    retry=retry + 1,
                                    max_retries=max_retries,
                                    delay_ms=delay_ms,
                                )
                                await asyncio.sleep(delay_ms / 1000.0)
                                output_data = await handle.query("get_activity_output", activity_id)
                                if output_data is not None:
                                    logger.debug(
                                        "Successfully retrieved output on retry",
                                        activity_id=activity_id,
                                        retry=retry + 1,
                                    )
                                    break
                            else:
                                # All retries exhausted, log warning
                                logger.warning(
                                    "Activity completed but output still None after retries",
                                    activity_id=activity_id,
                                    max_retries=max_retries,
                                )

                    except (TemporalError, ValueError) as e:
                        logger.debug("Could not query activity data", activity_id=activity_id, error=str(e))

                    # Store old values before updating
                    old_values = {
                        "status": existing.status,
                        "started_at": existing.started_at,
                        "completed_at": existing.completed_at,
                        "error_details": existing.error_details,
                        "retry_count": existing.retry_count,
                    }

                    # Update existing activity
                    existing.status = activity_data["status"]
                    existing.started_at = activity_data["started_at"]
                    existing.completed_at = activity_data["completed_at"]
                    existing.input_data = (
                        input_data
                        if isinstance(input_data, dict)
                        else {"raw": input_data}
                        if input_data is not None
                        else None
                    )
                    existing.output_data = (
                        output_data
                        if isinstance(output_data, dict)
                        else {"raw": output_data}
                        if output_data is not None
                        else None
                    )
                    existing.error_details = activity_data["error_details"]
                    existing.retry_count = activity_data["retry_count"]
                    existing.updated_at = datetime.now(UTC)

                    # Track updated activity with old values for patch generation
                    updated_activities.append((existing, old_values))

                # Clear terminal activities from pending to avoid re-processing
                terminal_statuses = {
                    ActivityStatus.COMPLETED,
                    ActivityStatus.FAILED,
                    ActivityStatus.SKIPPED,
                    ActivityStatus.CANCELLED,
                }
                terminal_scheduled_ids = [
                    scheduled_id
                    for scheduled_id, data in metadata.pending_activity_updates.items()
                    if data.get("status") in terminal_statuses
                ]
                for scheduled_id in terminal_scheduled_ids:
                    del metadata.pending_activity_updates[scheduled_id]

                # Update execution's last processed event ID
                result = await session.exec(select(Execution).where(Execution.id == metadata.execution_id))
                execution = result.one_or_none()
                if execution:
                    execution.last_processed_event_id = metadata.last_processed_event_id

                await session.commit()

                # Publish activity patches after commit
                if updated_activities:
                    await self._publish_activity_patches(metadata, updated_activities)

                # Emit telemetry for activities that reached terminal states
                emit_activities(
                    execution_id=metadata.execution_id,
                    activity_definitions_map=metadata.activity_definitions_map,
                    updated_activities=updated_activities,
                    request_id=metadata.request_id,
                )

            except Exception:
                await session.rollback()
                logger.exception(
                    "Error syncing activities to database for execution", execution_id=metadata.execution_id
                )
                raise

    async def _fetch_activity_definitions_map(self, workflow_version_id: UUID) -> dict[str, dict[str, Any]]:
        """Fetch activity definitions from V2 workflow version.

        Args:
            workflow_version_id: Workflow version ID

        Returns:
            Dictionary mapping activity/node ID to definition

        """
        async with self.session_factory() as session:
            result = await session.exec(select(WorkflowVersion).where(WorkflowVersion.id == workflow_version_id))
            workflow_version = result.one_or_none()

            activity_definitions_map: dict[str, dict[str, Any]] = {}

            if workflow_version and workflow_version.workflow_definition:
                workflow_def = workflow_version.workflow_definition

                # V2 structure: nodes array at top level
                nodes = workflow_def.get("nodes", [])
                triggers = workflow_def.get("triggers", [])

                # Include triggers as nodes (they create activity records in V2)
                all_nodes = triggers + nodes

                # Build map of all nodes by ID
                for node in all_nodes:
                    if "id" in node:
                        activity_definitions_map[node["id"]] = node

            return activity_definitions_map

    async def _sync_skipped_nodes(
        self,
        execution_id: UUID,
        handle: WorkflowHandle[Any, Any],
    ) -> None:
        """Query workflow for skipped nodes and update them in database.

        This method queries the workflow for its current list of skipped nodes
        and marks them as SKIPPED in the database. The DB update is idempotent -
        nodes already marked as SKIPPED will not be updated again.

        Args:
            execution_id: Database execution ID
            handle: Workflow handle for querying

        """
        try:
            # Query workflow for skipped node IDs
            skipped_node_ids = await handle.query("get_skipped_nodes")

            if not skipped_node_ids:
                return

            logger.debug(
                "Syncing skipped nodes to database",
                execution_id=execution_id,
                skipped_count=len(skipped_node_ids),
            )

            # Update skipped nodes in database (idempotent)
            async with self.session_factory() as session:
                # Fetch activities that need to be marked as skipped
                # Only update if current status != SKIPPED (idempotent)
                result = await session.exec(
                    select(ActivityExecution).where(
                        ActivityExecution.execution_id == execution_id,
                        ActivityExecution.activity_name.in_(skipped_node_ids),  # type: ignore[attr-defined]
                        ActivityExecution.status != ActivityStatus.SKIPPED,
                    )
                )
                activities_to_skip = result.all()

                if activities_to_skip:
                    for activity in activities_to_skip:
                        activity.status = ActivityStatus.SKIPPED
                        activity.completed_at = datetime.now(UTC)

                    await session.commit()

                    logger.info(
                        "Marked nodes as skipped in database",
                        execution_id=execution_id,
                        skipped_count=len(activities_to_skip),
                    )

        except Exception:
            # Log but don't re-raise — skipped node sync is best-effort.
            # Skipped activities may remain PENDING in the database until
            # manual reconciliation or the next workflow completion event.
            logger.exception(
                "Error syncing skipped nodes (activities may remain PENDING)",
                execution_id=execution_id,
            )

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
                    logger.debug(
                        "Activities already exist for execution, skipping upfront creation", execution_id=execution_id
                    )
                    return

                # Create ActivityExecution records for all trackable activities
                new_activities: list[ActivityExecution] = []

                for activity_id, activity_def in activity_definitions_map.items():
                    activity_type = activity_def.get("type")

                    # V2 workflows: Create records for all node types (triggers, control, executors)
                    if activity_type in [
                        # V2 triggers
                        NodeType.MANUAL_TRIGGER,
                        # V2 control nodes
                        NodeType.CONDITION,
                        NodeType.CONVERGE,
                        NodeType.LOOP,
                        # V2 executor nodes
                        NodeType.AAP_JOB_TEMPLATE,
                        NodeType.AGENTIC,
                        NodeType.APPROVAL,
                        NodeType.HTTP_REQUEST,
                        NodeType.SCRIPT,
                    ]:
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
                        "Created ActivityExecution records upfront for execution",
                        record_count=len(new_activities),
                        execution_id=execution_id,
                    )

                    # Publish initial snapshot after activities are created
                    await self._publish_snapshot_safely(session, execution_id, "initial_snapshot")

            except Exception:
                await session.rollback()
                logger.exception("Error creating activities upfront for execution", execution_id=execution_id)
                raise

    async def _publish_activity_patches(
        self,
        metadata: ExecutionMonitorMetadata,
        updated_activities: list[tuple[ActivityExecution, dict[str, Any]]],
    ) -> None:
        """Publish activity patches for incremental updates.

        Creates JSON Patch operations manually without costly DB reads by directly
        constructing patch operations for each changed field.

        Args:
            metadata: Monitoring metadata containing execution and activity index map
            updated_activities: List of (activity, old_values) tuples for activities that were updated

        """
        execution_id = metadata.execution_id
        try:
            # Create patch operations for each updated activity
            patch_ops: list[dict[str, Any]] = []

            for activity, old_values in updated_activities:
                # Find the index of this activity in the activities list
                activity_idx = metadata.activity_index_map.get(activity.activity_name)
                if activity_idx is None:
                    logger.warning(
                        "Activity not found in activities list for execution",
                        activity_name=activity.activity_name,
                        execution_id=execution_id,
                    )
                    continue

                # Create patch operations for each changed field
                # Only include fields that are part of ActivityData schema
                fields_to_check = [
                    ("status", activity.status.value if activity.status else None),
                    ("started_at", activity.started_at.isoformat() if activity.started_at else None),
                    ("completed_at", activity.completed_at.isoformat() if activity.completed_at else None),
                    ("error_details", activity.error_details),
                ]

                for field_name, new_value in fields_to_check:
                    old_value = old_values.get(field_name)

                    # Convert old value to comparable format
                    if field_name == "status" and old_value is not None:
                        old_value = old_value.value
                    elif field_name in ("started_at", "completed_at") and old_value is not None:
                        old_value = old_value.isoformat()

                    # Only create patch if value actually changed
                    if old_value != new_value:
                        patch_ops.append(
                            {
                                "op": "replace",
                                "path": f"/activities/{activity_idx}/{field_name}",
                                "value": new_value,
                            }
                        )

            # Publish patches if there are any operations
            if patch_ops:
                # Wrap operations in a JsonPatch object
                json_patch = JsonPatch(patch_ops)
                await self.activity_publisher.publish_activity_patch(execution_id, [json_patch])

                logger.debug(
                    "Published patch operations for execution (activities updated)",
                    operation_count=len(patch_ops),
                    execution_id=execution_id,
                    updated_activity_count=len(updated_activities),
                )

        except Exception:
            # Log error but don't fail database sync (publishing is best-effort)
            logger.exception("Failed to publish activity patches for execution (non-fatal)", execution_id=execution_id)
