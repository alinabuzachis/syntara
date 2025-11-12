"""Execution service for managing workflow executions.

This service provides high-level operations for starting, monitoring, and managing
workflow executions via Temporal.
"""

import logging
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from temporalio.api.enums.v1 import EventType
from temporalio.client import Client, WorkflowHandle, WorkflowHistoryEventFilterType
from temporalio.exceptions import TemporalError

from nexus.api.constants import (
    DEFAULT_TASK_QUEUE,
    DEFAULT_TEMPORAL_ADDRESS,
    DEFAULT_TEMPORAL_NAMESPACE,
)
from nexus.workflows.utils.datetime import ensure_timezone_aware
from nexus.workflows.workflow_engine.dynamic_workflow import DynamicWorkflow
from nexus.workflows.workflow_engine.models.responses import (
    WorkflowCancellationResponse,
    WorkflowResultResponse,
    WorkflowStartResponse,
    WorkflowStatusResponse,
    WorkflowTerminationResponse,
)
from nexus.workflows.workflow_engine.yaml_workflow_parser import parse_workflow_yaml

logger = logging.getLogger(__name__)


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
            logger.warning("Failed to fetch workflow history for failure details: %s", e)
        return None

    async def start_yaml_workflow(
        self,
        workflow_yaml: str,
        workflow_name: str,
        input_data: dict[str, Any] | None = None,
        workflow_id: str | None = None,
    ) -> WorkflowStartResponse:
        """Start a workflow from YAML definition.

        Args:
            workflow_yaml: YAML workflow definition string
            workflow_name: Name for this workflow execution
            input_data: Input parameters for the workflow
            workflow_id: Optional internal workflow ID (auto-generated if not provided)

        Returns:
            WorkflowStartResponse containing:
                - execution_id: Internal execution ID (stub for database record)
                - workflow_id: Internal workflow ID
                - temporal_workflow_id: Temporal workflow ID (for Temporal API calls)
                - temporal_run_id: Temporal run ID (specific execution run)
                - status: Execution status
                - started_at: ISO 8601 timestamp when workflow started

        Raises:
            WorkflowParseError: If YAML is invalid
            Exception: If workflow fails to start

        Example:
            >>> service = TemporalExecutionService(client)
            >>> result = await service.start_yaml_workflow(
            ...     workflow_yaml='...',
            ...     workflow_name='my-workflow',
            ...     input_data={'user_id': 123}
            ... )
            >>> print(result['workflow_id'])  # Internal workflow ID
            >>> print(result['temporal_workflow_id'])  # Use this for Temporal API calls

        """
        try:
            # Parse YAML workflow definition
            logger.info("Parsing YAML workflow: %s", workflow_name)
            workflow_def = parse_workflow_yaml(workflow_yaml)

            # Generate internal workflow ID if not provided
            if workflow_id is None:
                workflow_id = str(uuid4())

            # Create execution record (stub - would be database record)
            execution_id = str(uuid4())

            # Generate Temporal workflow ID (must be unique for Temporal)
            temporal_workflow_id = f"{workflow_name}-{execution_id}"

            logger.info(
                "Starting workflow execution: %s (execution_id: %s, temporal_workflow_id: %s)",
                workflow_id,
                execution_id,
                temporal_workflow_id,
            )

            # Convert Pydantic model to dict for Temporal
            workflow_def_dict = workflow_def.model_dump(mode="json", by_alias=True)

            # Start Temporal workflow
            handle = await self.temporal_client.start_workflow(
                DynamicWorkflow.run,
                args=[workflow_def_dict, execution_id, input_data],
                id=temporal_workflow_id,
                task_queue=self.task_queue,
            )

            logger.info(
                "Workflow started successfully: %s (temporal_run_id: %s)",
                temporal_workflow_id,
                handle.first_execution_run_id,
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
            logger.exception("Failed to start workflow %s", workflow_name)
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
            logger.exception("Failed to get workflow status for %s", temporal_workflow_id)
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
            logger.info("Waiting for workflow %s to complete...", temporal_workflow_id)
            # TODO: This blocks until workflow completes, which is problematic  # noqa: TD002, TD003
            # for HITL workflows that may wait indefinitely for human input.
            # This will be addressed in a future Human-in-the-Loop Approvals ticket.
            result: dict[str, Any] = await handle.result()

        except Exception:
            logger.exception("Workflow %s failed", temporal_workflow_id)
            raise
        else:
            logger.info("Workflow %s completed successfully", temporal_workflow_id)
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

            logger.info("Cancelling workflow %s: %s", temporal_workflow_id, reason or "No reason provided")

            # Cancel the workflow
            await handle.cancel()

            logger.info("Workflow %s cancelled successfully", temporal_workflow_id)

            return WorkflowCancellationResponse(
                temporal_workflow_id=temporal_workflow_id,
                status="cancelled",
                cancelled_at=datetime.now(UTC).isoformat(),
                reason=reason,
            )

        except Exception:
            logger.exception("Failed to cancel workflow %s", temporal_workflow_id)
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

            logger.warning("Terminating workflow %s: %s", temporal_workflow_id, reason or "No reason provided")

            # Terminate the workflow
            await handle.terminate(reason=reason)

            logger.info("Workflow %s terminated successfully", temporal_workflow_id)

            return WorkflowTerminationResponse(
                temporal_workflow_id=temporal_workflow_id,
                status="terminated",
                terminated_at=datetime.now(UTC).isoformat(),
                reason=reason,
            )

        except Exception:
            logger.exception("Failed to terminate workflow %s", temporal_workflow_id)
            raise


async def create_temporal_execution_service(
    temporal_address: str = DEFAULT_TEMPORAL_ADDRESS,
    namespace: str = DEFAULT_TEMPORAL_NAMESPACE,
    task_queue: str = DEFAULT_TASK_QUEUE,
) -> TemporalExecutionService:
    """Create a temporal execution service with a new Temporal client.

    Args:
        temporal_address: Temporal server address
        namespace: Temporal namespace
        task_queue: Task queue name

    Returns:
        TemporalExecutionService instance

    Example:
        >>> service = await create_temporal_execution_service()
        >>> result = await service.start_yaml_workflow(...)

    """
    client = await Client.connect(
        temporal_address,
        namespace=namespace,
    )
    # TODO: Handle how TemporalExecutionService is dispatched/deployed  # noqa: TD002, TD003
    # via containerization. This will be addressed in a future Containerization & Deployment ticket.
    return TemporalExecutionService(client, task_queue)
