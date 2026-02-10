"""Approval activity executor for workflow human approval integration.

This module provides functionality to create approval requests within workflows,
integrating with external approval systems (placeholder for now).
"""

from typing import Any
from uuid import UUID, uuid4

import structlog
from temporalio import activity

from nexus.workflows.utils.url import generate_activity_signal_url

logger = structlog.stdlib.get_logger(__name__)


class ApprovalActivityError(Exception):
    """Base exception for approval activity errors."""


@activity.defn
async def create_approval_request_activity(
    approval_config: dict[str, Any],
    workflow_context: dict[str, Any],
) -> dict[str, Any]:
    """Create an approval request for human decision-making.

    This activity creates an approval request and returns immediately with metadata.
    The workflow will wait for a signal containing the approval decision.

    Args:
        approval_config: Approval configuration containing:
            - description: Approval prompt/question for approvers
            - timeout: Optional timeout in seconds
        workflow_context: Context about the workflow execution:
            - workflow_inputs: All workflow inputs
            - previous_step: Output from previous activity
            - execution_id: Workflow execution ID
            - workflow_name: Name of the workflow

    Returns:
        Approval request metadata containing:
            - approval_id: Generated approval request ID
            - status: "pending"
            - callback_url: URL for submitting approval decision
            - description: Approval prompt/description

    Raises:
        ApprovalActivityError: If approval request creation fails

    """
    correlation_id = str(uuid4())
    logger.info("Creating approval request", correlation_id=correlation_id)

    # Generate approval ID
    approval_id = f"apr_{uuid4()}"

    # Extract execution ID for callback URL generation
    execution_id = workflow_context.get("execution_id")

    # Get activity ID from activity context
    try:
        activity_info = activity.info()
        activity_id = activity_info.activity_id
    except RuntimeError:
        activity_id = "unknown"

    # Generate callback URL if execution context is available
    callback_url = None
    if execution_id and activity_id:
        try:
            callback_url = generate_activity_signal_url(UUID(execution_id), activity_id)
            logger.info(
                "Generated callback URL for approval",
                correlation_id=correlation_id,
                callback_url=callback_url,
            )
        except (ValueError, TypeError) as e:
            logger.warning(
                "Failed to generate callback URL",
                correlation_id=correlation_id,
                error=str(e),
            )

    # PLACEHOLDER: Replace with actual HTTP call to approval service
    # For now, just log the approval request details
    logger.info(
        "Approval request created (PLACEHOLDER - no HTTP call yet)",
        approval_id=approval_id,
        description=approval_config.get("description"),
        timeout=approval_config.get("timeout"),
        execution_id=execution_id,
        activity_id=activity_id,
        callback_url=callback_url,
        correlation_id=correlation_id,
    )

    # Return metadata for workflow tracking
    return {
        "approval_id": approval_id,
        "status": "pending",
        "callback_url": callback_url,
        "description": approval_config.get("description"),
        "timeout": approval_config.get("timeout"),
        "workflow_context": workflow_context,
        "correlation_id": correlation_id,
    }
