"""Signal processor for workflow activity signals.

This module provides centralized signal processing logic for workflow activities,
handling both success and failure signals received from external services (e.g., agent orchestrator).
"""

import contextlib
from typing import Any

from temporalio import workflow

from nexus.workflows.workflow_engine.activities.common import ActivityExecutionError


class WorkflowSignalProcessor:
    """Processor for workflow activity signals.

    This class provides static methods for processing activity signals,
    validating their status, and transforming them into appropriate
    responses or exceptions for workflow execution.

    This mirrors the WorkflowSignalClient on the agent orchestrator side,
    creating a symmetric signal handling architecture.
    """

    @staticmethod
    def process_signal(signal_data: dict[str, Any], activity_id: str, execution_id: str) -> dict[str, Any]:
        """Process activity signal and handle both success and failure cases.

        Args:
            signal_data: The signal data from the activity (contains status, result, or error)
            activity_id: ID of the activity that sent the signal
            execution_id: Workflow execution ID for logging

        Returns:
            Signal data for successful signals (status="completed")

        Raises:
            ActivityExecutionError: If signal indicates failure (status="failed")

        """
        signal_status = signal_data.get("status")

        if signal_status == "failed":
            # Extract error information and raise exception
            error_info = signal_data.get("error", {})
            error_message = error_info.get("message", "Agent execution failed")
            error_type = error_info.get("error_type", "UnknownError")

            # Log only if in workflow context (workflow.logger requires workflow event loop)
            with contextlib.suppress(Exception):  # Silently skip logging if not in workflow context
                workflow.logger.error(
                    f"Agentic activity {activity_id} failed: {error_type}: {error_message}",
                    extra={
                        "activity_id": activity_id,
                        "execution_id": execution_id,
                        "error_type": error_type,
                        "error_message": error_message,
                    },
                )

            msg = f"{error_type}: {error_message}"
            raise ActivityExecutionError(msg)

        # Success case - return signal data for output mapping
        # The signal_data contains the agent result
        # Pass it directly to output mapping processing (don't extract "result" field)
        # The output mappings (e.g., $.result.answer) will navigate the full structure
        return signal_data
