"""Approval activity executor for workflow human approval integration.

This module provides functionality to create and expire approval requests
within workflows via the Approvals API client.
"""

from typing import Any, NoReturn
from uuid import UUID

import structlog
from temporalio import activity, workflow

with workflow.unsafe.imports_passed_through():
    from nexus.approvals.audit.approval import ApprovalExpiredEvent
    from nexus.audit.dispatcher import AuditEventDispatcher
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
    approver_user_ids: list[str] | None = None,
    approver_group_ids: list[str] | None = None,
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
        approver_user_ids: List of user UUIDs who can approve (None = any user with permission).
        approver_group_ids: List of group UUIDs whose members can approve.

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
        "approver_user_ids": approver_user_ids,
        "approver_group_ids": approver_group_ids,
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


@activity.defn(name=ActivityName.EXPIRE_APPROVAL)
async def expire_approval_requests_activity(
    execution_id: str,
    node_id: str,
) -> dict[str, Any]:
    """Expire pending approval requests for a specific node after its decision window.

    Looks up pending approvals for the given execution, filters to the node,
    and batch-expires them.

    Args:
        execution_id: Parent workflow execution ID (UUID string).
        node_id: The approval node whose requests should be expired.

    Returns:
        Dict with expired_count and any errors.

    """
    logger.info(
        "Expiring approval requests for timed-out node",
        execution_id=execution_id,
        node_id=node_id,
    )

    try:
        async with ApprovalsApiClient(
            base_url=constants.APPROVALS_API_BASE_URL,
            auth_token=create_service_token(),
        ) as client:
            pending = await client.list_approvals_by_execution(UUID(execution_id), status="pending")
            node_approvals = [a for a in pending if a.get("approval_node_id") == node_id]

            if not node_approvals:
                logger.info(
                    "No pending approvals to expire",
                    execution_id=execution_id,
                    node_id=node_id,
                )
                return {"expired_count": 0}

            approval_ids = [UUID(a["id"]) for a in node_approvals]
            result = await client.batch_expire(approval_ids)

            expired_count = result.get("total_success", 0)
            logger.info(
                "Expired approval requests",
                execution_id=execution_id,
                node_id=node_id,
                expired_count=expired_count,
                failed_count=result.get("total_failed", 0),
            )

            for approval_id in approval_ids:
                AuditEventDispatcher.dispatch(
                    ApprovalExpiredEvent(
                        approval_id=approval_id,
                        execution_id=UUID(execution_id),
                        approval_node_id=node_id,
                    )
                )

            return {"expired_count": expired_count}

    except ApprovalsApiClientError as e:
        logger.warning(
            "Failed to expire approval requests",
            execution_id=execution_id,
            node_id=node_id,
            error=str(e),
        )
        return {"expired_count": 0, "error": str(e)}
    except Exception as e:  # noqa: BLE001
        logger.warning(
            "Unexpected error expiring approval requests",
            execution_id=execution_id,
            node_id=node_id,
            error=str(e),
        )
        return {"expired_count": 0, "error": str(e)}
