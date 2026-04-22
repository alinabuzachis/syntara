"""Approval activity executor for workflow human approval integration.

This module provides functionality to create approval requests within workflows,
integrating with external approval systems (placeholder for now).
"""

from typing import Any
from uuid import UUID, uuid4

import structlog
from temporalio import activity

from nexus.workflows.utils.url import generate_activity_signal_url
from nexus.workflows.workflow_engine.models.workflow_definition import ActivityName

from .common import ActivityExecutionError
from .output_mapping import apply_output_mapping

logger = structlog.stdlib.get_logger(__name__)


class ApprovalActivityError(ActivityExecutionError):
    """Base exception for approval activity errors."""


@activity.defn(name=ActivityName.APPROVAL)
async def execute_approval_activity(
    input_config: dict[str, Any],
    output_config: dict[str, str] | None,
    execution_id: str = "",
) -> dict[str, Any]:
    """V2 approval activity with normalized signature.

    Args:
        input_config: Activity configuration containing description and timeout
        output_config: Output mapping configuration
        execution_id: Workflow execution ID for callback URL generation

    Returns:
        dict with keys:
            - output: Mapped output containing approval request metadata

    """
    logger.info("Creating approval request (v2)")

    # Generate approval ID
    approval_id = f"apr_{uuid4()}"

    # Get activity ID from activity context
    try:
        activity_info = activity.info()
        activity_id = activity_info.activity_id
    except RuntimeError:
        activity_id = "unknown"

    # Generate callback URL for external services to signal back results
    callback_url = generate_activity_signal_url(UUID(execution_id), activity_id) if execution_id else None

    # PLACEHOLDER: Replace with actual HTTP call to approval service
    logger.info(
        "Approval request created (PLACEHOLDER - no HTTP call yet)",
        approval_id=approval_id,
        description=input_config.get("description"),
        timeout=input_config.get("timeout"),
        activity_id=activity_id,
        callback_url=callback_url,
    )

    # Build full result
    full_result = {
        "status": "completed",
        "approval_id": approval_id,
        "approval_status": "pending",
        "callback_url": callback_url,
        "description": input_config.get("description"),
        "timeout": input_config.get("timeout"),
    }

    # Apply output mapping
    mapped_output = apply_output_mapping(full_result, output_config)

    return {"output": mapped_output}
