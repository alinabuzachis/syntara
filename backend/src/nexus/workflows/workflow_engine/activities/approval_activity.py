"""Approval activity executor for workflow human approval integration.

This module provides functionality to create approval requests within workflows
via the Approvals API client.
"""

from typing import Any, NoReturn

import structlog
from temporalio import activity, workflow

with workflow.unsafe.imports_passed_through():
    from nexus.auth import create_service_token
    from nexus.workflows.clients.approvals_client import (
        ApprovalsApiClient,
        ApprovalsApiClientError,
    )
    from nexus.workflows.workflow_engine import constants
from nexus.workflows.workflow_engine.models.workflow_definition import ActivityName

from .common import ActivityExecutionError

logger = structlog.stdlib.get_logger(__name__)


class ApprovalActivityError(ActivityExecutionError):
    """Base exception for approval activity errors."""


@activity.defn(name=ActivityName.APPROVAL)
async def create_approval_request_activity(
    execution_id: str,
    approval_node_id: str,
    name: str,
    next_step_approved: dict[str, Any] | None,
    workflow_context: dict[str, Any],
    timeout_at: str | None = None,
    next_step_rejected: dict[str, Any] | None = None,
) -> NoReturn:
    """Create an approval request via the Approvals API.

    Called as a Temporal activity with async completion. Creates the approval
    request in the database, then calls raise_complete_async() so the activity
    stays STARTED in Temporal until externally completed via the callback endpoint.

    Args:
        execution_id: Parent workflow execution ID (UUID string).
        approval_node_id: Activity ID from workflow definition.
        name: Display name for the approval request.
        next_step_approved: First activity if approved (id, name, type), or None.
        workflow_context: Context dict (workflow_version_id, workflow_name, inputs, previous_step).
        timeout_at: ISO datetime string when the request expires, or None.
        next_step_rejected: First activity if rejected (id, name, type), or None.

    Raises:
        ApprovalActivityError: If approval request creation fails.

    """
    logger.info(
        "Creating approval request via Approvals API",
        base_url=constants.APPROVALS_API_BASE_URL,
        execution_id=execution_id,
        approval_node_id=approval_node_id,
        name=name,
    )

    request_data: dict[str, Any] = {
        "execution_id": execution_id,
        "approval_node_id": approval_node_id,
        "name": name,
        "next_step_approved": next_step_approved,
        "workflow_context": workflow_context,
        "timeout_at": timeout_at,
        "next_step_rejected": next_step_rejected,
    }

    try:
        async with ApprovalsApiClient(
            base_url=constants.APPROVALS_API_BASE_URL,
            auth_token=create_service_token(),
        ) as client:
            await client.create_approval(request_data)
    except ApprovalsApiClientError as e:
        logger.exception(
            "Approval request creation failed",
            execution_id=execution_id,
            approval_node_id=approval_node_id,
            error=str(e),
        )
        raise ApprovalActivityError(str(e)) from e
    except Exception as e:
        msg = f"Unexpected error creating approval request: {e}"
        logger.exception(msg, execution_id=execution_id, approval_node_id=approval_node_id)
        raise ApprovalActivityError(msg) from e

    activity.raise_complete_async()
