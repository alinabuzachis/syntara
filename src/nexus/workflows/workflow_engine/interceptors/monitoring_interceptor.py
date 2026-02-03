"""Workflow interceptor for automatically scheduling activity monitoring.

This interceptor ensures that activity monitoring is started for every workflow
execution, even if the temporal worker restarts. It replaces the signal-based
approach which could be lost on worker restart.
"""

from datetime import timedelta
from typing import Any

import structlog
from temporalio import workflow
from temporalio.worker import (
    ExecuteWorkflowInput,
    Interceptor,
    WorkflowInboundInterceptor,
    WorkflowInterceptorClassInput,
)

logger = structlog.stdlib.get_logger(__name__)


class _MonitoringWorkflowInboundInterceptor(WorkflowInboundInterceptor):
    """Inbound interceptor that automatically starts activity monitoring for workflows.

    This interceptor is called when a workflow execution starts and schedules
    the activity monitoring task. It runs the monitoring activity outside the
    sandbox to perform I/O operations.
    """

    async def execute_workflow(self, input: ExecuteWorkflowInput) -> Any:  # noqa: A002, ANN401
        """Execute workflow with automatic monitoring setup.

        This method is called when a workflow starts. It schedules the monitoring
        activity and then proceeds with normal workflow execution.

        Args:
            input: Workflow execution input containing args and metadata

        Returns:
            Workflow execution result

        """
        # Get execution_id from workflow args (second argument to DynamicWorkflow.run)
        # Args are: [workflow_def_dict, execution_id, input_data]
        min_args_for_monitoring = 2
        if len(input.args) >= min_args_for_monitoring:
            execution_id = input.args[1]
            temporal_workflow_id = workflow.info().workflow_id

            logger.info(
                "Starting activity monitoring for execution",
                execution_id=execution_id,
                temporal_workflow_id=temporal_workflow_id,
            )

            # Start activity monitoring in background (non-blocking)
            # This activity will handle:
            # 1. Waiting for the Execution record to be created in DB
            # 2. Checking if monitoring is already running
            # 3. Starting the monitoring if needed
            workflow.start_activity(
                "register_activity_monitoring",
                args=[execution_id, temporal_workflow_id],
                activity_id="__internal__register_monitoring",
                start_to_close_timeout=timedelta(seconds=30),
                retry_policy=None,  # No automatic retry - activity handles retries internally
            )

        # Continue with normal workflow execution
        return await super().execute_workflow(input)


class MonitoringWorkflowInterceptor(Interceptor):
    """Interceptor that provides workflow monitoring functionality.

    This interceptor is registered with the Temporal worker and ensures that
    every workflow execution automatically starts activity monitoring.
    """

    def workflow_interceptor_class(
        self,
        input: WorkflowInterceptorClassInput,  # noqa: A002, ARG002
    ) -> type[WorkflowInboundInterceptor]:
        """Return the workflow inbound interceptor class.

        Args:
            input: Interceptor class input

        Returns:
            The monitoring workflow inbound interceptor class

        """
        return _MonitoringWorkflowInboundInterceptor
