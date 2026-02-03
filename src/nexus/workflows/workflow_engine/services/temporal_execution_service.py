"""Execution service for managing workflow executions.

This service provides high-level operations for starting, monitoring, and managing
workflow executions via Temporal.
"""

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import structlog
from temporalio.api.enums.v1 import EventType
from temporalio.client import Client, WorkflowHandle, WorkflowHistoryEventFilterType
from temporalio.exceptions import TemporalError

from nexus.core.config.base import get_settings
from nexus.workflows.utils.datetime import ensure_timezone_aware
from nexus.workflows.workflow_engine.dynamic_workflow import DynamicWorkflow
from nexus.workflows.workflow_engine.models.responses import (
    WorkflowCancellationResponse,
    WorkflowResultResponse,
    WorkflowStartResponse,
    WorkflowStatusResponse,
    WorkflowTerminationResponse,
)
from nexus.workflows.workflow_engine.models.workflow_definition import WorkflowDefinition

logger = structlog.stdlib.get_logger(__name__)


class TemporalExecutionService:
    """Service for managing workflow executions."""

    def __init__(
        self,
        temporal_client: Client,
        task_queue: str,
    ) -> None:
        """Initialize temporal execution service.

        Note:
            For most use cases, use create_temporal_execution_service() factory function instead,
            which provides sensible defaults for temporal_address, namespace, and task_queue.

        Args:
            temporal_client: Temporal client for workflow operations
            task_queue: Task queue name for workflow execution

        """
        self.temporal_client = temporal_client
        self.task_queue = task_queue

    async def _extract_failure_message(self, handle: WorkflowHandle[Any, Any]) -> str | None:
        """Extract failure message from workflow history using optimized filtered query.

        Uses filtered history fetch to only retrieve close event, avoiding the overhead
        of fetching the entire workflow history.

        Args:
            handle: Temporal workflow handle

        Returns:
            Failure message if found, None otherwise

        """
        try:
            # Fetch only the close event using filter - much more efficient than full history
            history = await handle.fetch_history(event_filter_type=WorkflowHistoryEventFilterType.CLOSE_EVENT)

            # Look for WorkflowExecutionFailed event in the filtered results
            for event in history.events:
                if event.event_type == EventType.EVENT_TYPE_WORKFLOW_EXECUTION_FAILED:
                    failed_attrs = event.workflow_execution_failed_event_attributes
                    if failed_attrs and failed_attrs.failure:
                        return failed_attrs.failure.message
                    break
        except TemporalError as e:
            logger.warning("Failed to fetch workflow history for failure details", error=str(e))
        return None

    async def start_workflow(
        self,
        workflow_def: dict[str, Any],
        workflow_name: str,
        input_data: dict[str, Any] | None = None,
        workflow_id: str | None = None,
    ) -> WorkflowStartResponse:
        """Start a workflow from dict definition.

        Args:
            workflow_def: Workflow definition as dict
            workflow_name: Name for this workflow execution
            input_data: Input parameters for the workflow
            workflow_id: Optional workflow ID (auto-generated if not provided)

        Returns:
            WorkflowStartResponse containing:
                - execution_id: Internal execution ID (stub for database record)
                - workflow_id: Internal workflow ID
                - temporal_workflow_id: Temporal workflow ID (for Temporal API calls)
                - temporal_run_id: Temporal run ID (specific execution run)
                - status: Execution status
                - started_at: ISO 8601 timestamp when workflow started

        Raises:
            ValidationError: If workflow definition is invalid
            Exception: If workflow fails to start

        Example:
            >>> service = TemporalExecutionService(client)
            >>> result = await service.start_workflow(
            ...     workflow_def={'schemaVersion': '1.0.0', ...},
            ...     workflow_name='my-workflow',
            ...     input_data={'user_id': 123}
            ... )
            >>> print(result['workflow_id'])  # Internal workflow ID
            >>> print(result['temporal_workflow_id'])  # Use this for Temporal API calls

        """
        try:
            # Validate workflow definition
            logger.info("Validating workflow definition", workflow_name=workflow_name)
            _workflow_definition = WorkflowDefinition(**workflow_def)

            # Generate internal workflow ID if not provided
            if workflow_id is None:
                workflow_id = str(uuid4())

            # Create execution record (will be the database record id)
            execution_id = str(uuid4())

            # Generate Temporal workflow ID (must be unique for Temporal)
            temporal_workflow_id = f"{workflow_name}-{execution_id}"

            logger.info(
                "Starting workflow execution",
                workflow_id=workflow_id,
                execution_id=execution_id,
                temporal_workflow_id=temporal_workflow_id,
            )

            # Start Temporal workflow with the original dict
            handle = await self.temporal_client.start_workflow(
                DynamicWorkflow.run,
                args=[workflow_def, execution_id, input_data],
                id=temporal_workflow_id,
                task_queue=self.task_queue,
            )

            logger.info(
                "Workflow started successfully",
                temporal_workflow_id=temporal_workflow_id,
                temporal_run_id=handle.first_execution_run_id,
            )

            # Return execution information
            return WorkflowStartResponse(
                execution_id=execution_id,
                workflow_id=workflow_id,
                temporal_workflow_id=temporal_workflow_id,
                temporal_run_id=handle.first_execution_run_id,
                status="running",
                started_at=datetime.now(UTC).isoformat(),
            )

        except Exception:
            logger.exception("Failed to start workflow", workflow_name=workflow_name)
            raise

    async def get_workflow_status(self, temporal_workflow_id: str) -> WorkflowStatusResponse:
        """Get the status of a running workflow.

        Args:
            temporal_workflow_id: Temporal workflow ID

        Returns:
            WorkflowStatusResponse containing workflow status information

        Raises:
            Exception: If workflow not found or status check fails

        """
        try:
            handle = self.temporal_client.get_workflow_handle(temporal_workflow_id)

            # Get workflow status
            description = await handle.describe()

            status_name = description.status.name if description.status else "unknown"

            # Extract failure message if workflow failed
            failure_message = None
            if status_name.lower() == "failed":
                failure_message = await self._extract_failure_message(handle)

            # Format timestamps consistently with 'Z' suffix for UTC
            start_time = None
            if description.start_time:
                start_time = ensure_timezone_aware(description.start_time).isoformat()

            close_time = None
            if description.close_time:
                close_time = ensure_timezone_aware(description.close_time).isoformat()

            return WorkflowStatusResponse(
                temporal_workflow_id=temporal_workflow_id,
                temporal_run_id=description.run_id,
                status=status_name.lower(),
                start_time=start_time,
                close_time=close_time,
                failure_message=failure_message,
            )

        except Exception:
            logger.exception("Failed to get workflow status", temporal_workflow_id=temporal_workflow_id)
            raise

    async def get_workflow_result(self, temporal_workflow_id: str) -> WorkflowResultResponse:
        """Wait for workflow to complete and get result.

        Args:
            temporal_workflow_id: Temporal workflow ID

        Returns:
            WorkflowResultResponse containing workflow result

        Raises:
            Exception: If workflow fails or result cannot be retrieved

        """
        try:
            handle = self.temporal_client.get_workflow_handle(temporal_workflow_id)

            # Wait for workflow to complete
            logger.info("Waiting for workflow to complete", temporal_workflow_id=temporal_workflow_id)
            # TODO: This blocks until workflow completes, which is problematic  # noqa: TD002, TD003
            # for HITL workflows that may wait indefinitely for human input.
            # This will be addressed in a future Human-in-the-Loop Approvals ticket.
            result: dict[str, Any] = await handle.result()

        except Exception:
            logger.exception("Workflow failed", temporal_workflow_id=temporal_workflow_id)
            raise
        else:
            logger.info("Workflow completed successfully", temporal_workflow_id=temporal_workflow_id)
            # Convert dict result to typed response
            return WorkflowResultResponse(**result)

    async def cancel_workflow(
        self,
        temporal_workflow_id: str,
        reason: str | None = None,
    ) -> WorkflowCancellationResponse:
        """Cancel a running workflow.

        Args:
            temporal_workflow_id: Temporal workflow ID
            reason: Optional reason for cancellation

        Returns:
            WorkflowCancellationResponse containing cancellation information

        Raises:
            Exception: If cancellation fails

        """
        try:
            handle = self.temporal_client.get_workflow_handle(temporal_workflow_id)

            logger.info(
                "Cancelling workflow", temporal_workflow_id=temporal_workflow_id, reason=reason or "No reason provided"
            )

            # Cancel the workflow
            await handle.cancel()

            logger.info("Workflow cancelled successfully", temporal_workflow_id=temporal_workflow_id)

            return WorkflowCancellationResponse(
                temporal_workflow_id=temporal_workflow_id,
                status="cancelled",
                cancelled_at=datetime.now(UTC).isoformat(),
                reason=reason,
            )

        except Exception:
            logger.exception("Failed to cancel workflow", temporal_workflow_id=temporal_workflow_id)
            raise

    async def terminate_workflow(
        self,
        temporal_workflow_id: str,
        reason: str | None = None,
    ) -> WorkflowTerminationResponse:
        """Terminate a running workflow immediately.

        Unlike cancel, terminate stops the workflow immediately without cleanup.

        Args:
            temporal_workflow_id: Temporal workflow ID
            reason: Optional reason for termination

        Returns:
            WorkflowTerminationResponse containing termination information

        Raises:
            Exception: If termination fails

        """
        try:
            handle = self.temporal_client.get_workflow_handle(temporal_workflow_id)

            logger.warning(
                "Terminating workflow", temporal_workflow_id=temporal_workflow_id, reason=reason or "No reason provided"
            )

            # Terminate the workflow
            await handle.terminate(reason=reason)

            logger.info("Workflow terminated successfully", temporal_workflow_id=temporal_workflow_id)

            return WorkflowTerminationResponse(
                temporal_workflow_id=temporal_workflow_id,
                status="terminated",
                terminated_at=datetime.now(UTC).isoformat(),
                reason=reason,
            )

        except Exception:
            logger.exception("Failed to terminate workflow", temporal_workflow_id=temporal_workflow_id)
            raise

    async def send_activity_signal(
        self,
        temporal_workflow_id: str,
        activity_id: str,
        signal_data: dict[str, Any],
    ) -> None:
        """Send a signal to a specific activity in a workflow.

        This method sends a signal to the workflow's activity_signal handler,
        which stores the signal data for the specified activity to process.

        Args:
            temporal_workflow_id: Temporal workflow ID
            activity_id: Activity ID from workflow definition
            signal_data: Signal payload data (arbitrary JSON structure)

        Raises:
            Exception: If signal fails to send

        """
        try:
            handle = self.temporal_client.get_workflow_handle(temporal_workflow_id)

            logger.info(
                "Sending signal to activity in workflow",
                activity_id=activity_id,
                temporal_workflow_id=temporal_workflow_id,
            )

            # Send signal to the workflow's activity_signal handler
            await handle.signal(
                "activity_signal",
                args=[activity_id, signal_data],
            )

            logger.info(
                "Signal sent successfully to activity in workflow",
                activity_id=activity_id,
                temporal_workflow_id=temporal_workflow_id,
            )

        except Exception:
            logger.exception(
                "Failed to send signal to activity in workflow",
                activity_id=activity_id,
                temporal_workflow_id=temporal_workflow_id,
            )
            raise


async def create_temporal_execution_service(
    temporal_address: str | None = None,
    namespace: str | None = None,
    task_queue: str | None = None,
) -> TemporalExecutionService:
    """Create a temporal execution service with a new Temporal client.

    Args:
        temporal_address: Temporal server address (default from settings)
        namespace: Temporal namespace (default from settings)
        task_queue: Task queue name (default from settings)

    Returns:
        TemporalExecutionService instance

    Example:
        >>> service = await create_temporal_execution_service()
        >>> result = await service.start_yaml_workflow(...)

    """
    settings = get_settings()
    temporal_address = temporal_address or settings.temporal_address
    namespace = namespace or settings.temporal_namespace
    task_queue = task_queue or settings.task_queue

    client = await Client.connect(
        temporal_address,
        namespace=namespace,
    )
    # TODO: Handle how TemporalExecutionService is dispatched/deployed  # noqa: TD002, TD003
    # via containerization. This will be addressed in a future Containerization & Deployment ticket.
    return TemporalExecutionService(client, task_queue)
