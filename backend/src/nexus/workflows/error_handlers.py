"""RFC 9457 compliant error handlers for Workflows domain.

This module provides error handling for workflow and execution-specific exceptions.
"""

from typing import TYPE_CHECKING

import structlog
from fastapi import Request, status
from fastapi.responses import JSONResponse
from sqlmodel import SQLModel
from temporalio.service import RPCError

from nexus.core.error_handlers import PROBLEM_TYPES, create_problem_details_response

if TYPE_CHECKING:
    from nexus.workflows.exceptions import (
        ExecutionInTerminalStateError,
        ExecutionNotFoundError,
        PayloadTooLargeError,
        TemporalUnavailableError,
        TriggerValidationError,
        WebhookTriggerNotFoundError,
        WebhookTriggerPathConflictError,
        WorkflowDefinitionInvalidError,
        WorkflowNameConflictError,
        WorkflowNotFoundError,
        WorkflowNotPublishedError,
        WorkflowValidationError,
        WorkflowVersionNotFoundError,
    )

logger = structlog.stdlib.get_logger(__name__)


def build_validation_problem_response(
    request: Request,
    result: SQLModel,
) -> JSONResponse:
    """Build an RFC 9457 problem details response for workflow validation failures."""
    content = {
        "type": PROBLEM_TYPES["validation_error"],
        "title": "Workflow Definition Invalid",
        "detail": "The workflow definition failed validation",
        "code": "WORKFLOW_DEFINITION_INVALID",
        "retryable": False,
        "instance": str(request.url),
        "validation_result": result.model_dump(mode="json"),
    }
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=content,
        media_type="application/problem+json",
    )


def definition_invalid_handler(request: Request, exc: "WorkflowDefinitionInvalidError") -> JSONResponse:
    """Return RFC 9457 problem details with validation_result extension."""
    result = exc.validation_result if exc.validation_result is not None else exc.result
    return build_validation_problem_response(request, result)


def validation_error_handler(request: Request, exc: "WorkflowValidationError") -> JSONResponse:
    """Handle core WorkflowValidationError with RFC 9457 format."""
    logger.error("Core validation error", exc_info=exc)

    err_detail = exc.message
    detail = "The provided data failed validation requirements" if len(err_detail) == 0 else err_detail
    return create_problem_details_response(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        problem_type=PROBLEM_TYPES["validation_error"],
        title="Validation Error",
        detail=detail,
        code="VALIDATION_ERROR",
        retryable=False,
        instance=str(request.url),
    )


def workflow_not_found_handler(request: Request, exc: "WorkflowNotFoundError") -> JSONResponse:
    """Handle WorkflowNotFoundError with RFC 9457 format."""
    # Log the full exception for debugging but don't expose workflow IDs to users
    logger.error("Workflow not found", exc_info=exc)
    return create_problem_details_response(
        status_code=status.HTTP_404_NOT_FOUND,
        problem_type=PROBLEM_TYPES["resource_not_found"],
        title="Workflow Not Found",
        detail="The requested workflow was not found",
        code="WORKFLOW_NOT_FOUND",
        retryable=False,
        instance=str(request.url),
    )


def execution_not_found_handler(request: Request, exc: "ExecutionNotFoundError") -> JSONResponse:
    """Handle ExecutionNotFoundError with RFC 9457 format."""
    # Log the full exception for debugging but don't expose execution IDs to users
    logger.error("Execution not found", exc_info=exc)
    return create_problem_details_response(
        status_code=status.HTTP_404_NOT_FOUND,
        problem_type=PROBLEM_TYPES["resource_not_found"],
        title="Execution Not Found",
        detail="The requested execution was not found",
        code="EXECUTION_NOT_FOUND",
        retryable=False,
        instance=str(request.url),
    )


def execution_terminal_state_handler(request: Request, exc: "ExecutionInTerminalStateError") -> JSONResponse:
    """Handle ExecutionInTerminalStateError with RFC 9457 format."""
    logger.error(
        "Cannot modify execution in terminal state",
        execution_id=str(exc.execution_id),
        status=exc.status,
        operation=exc.operation,
        exc_info=exc,
    )
    return create_problem_details_response(
        status_code=status.HTTP_400_BAD_REQUEST,
        problem_type=PROBLEM_TYPES["validation_error"],
        title="Execution In Terminal State",
        detail=f"Cannot {exc.operation} execution in {exc.status} state",
        code="EXECUTION_TERMINAL_STATE",
        retryable=False,
        instance=str(request.url),
    )


def workflow_version_not_found_handler(request: Request, exc: "WorkflowVersionNotFoundError") -> JSONResponse:
    """Handle WorkflowVersionNotFoundError with RFC 9457 format."""
    # Log the full exception for debugging but don't expose workflow IDs to users
    logger.error("Workflow version not found", exc_info=exc)
    return create_problem_details_response(
        status_code=status.HTTP_404_NOT_FOUND,
        problem_type=PROBLEM_TYPES["resource_not_found"],
        title="Workflow Version Not Found",
        detail="The requested workflow version was not found",
        code="WORKFLOW_VERSION_NOT_FOUND",
        retryable=False,
        instance=str(request.url),
    )


def workflow_name_conflict_handler(request: Request, exc: "WorkflowNameConflictError") -> JSONResponse:
    """Handle WorkflowNameConflictError with RFC 9457 format."""
    logger.error("Workflow name conflict", exc_info=exc)
    return create_problem_details_response(
        status_code=status.HTTP_409_CONFLICT,
        problem_type=PROBLEM_TYPES["name_conflict"],
        title="Workflow Name Conflict",
        detail="A workflow with this name already exists",
        code="WORKFLOW_NAME_CONFLICT",
        retryable=False,
        instance=str(request.url),
    )


def workflow_not_published_handler(request: Request, exc: "WorkflowNotPublishedError") -> JSONResponse:
    """Handle WorkflowNotPublishedError with RFC 9457 format."""
    logger.error("Workflow not published", exc_info=exc)
    return create_problem_details_response(
        status_code=status.HTTP_400_BAD_REQUEST,
        problem_type=PROBLEM_TYPES["resource_not_published"],
        title="Workflow Not Published",
        detail="The requested workflow has no published version",
        code="WORKFLOW_NOT_PUBLISHED",
        retryable=False,
        instance=str(request.url),
    )


def temporal_unavailable_handler(request: Request, exc: "TemporalUnavailableError") -> JSONResponse:
    """Handle TemporalUnavailableError with RFC 9457 format."""
    logger.error("Temporal service unavailable", exc_info=exc)
    return create_problem_details_response(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        problem_type=PROBLEM_TYPES["service_unavailable"],
        title="Temporal Service Unavailable",
        detail="Temporal workflow service is currently unavailable",
        code="TEMPORAL_UNAVAILABLE",
        retryable=True,
        instance=str(request.url),
    )


# ============================================================================
# Trigger Error Handlers
# ============================================================================


def webhook_trigger_not_found_handler(request: Request, exc: "WebhookTriggerNotFoundError") -> JSONResponse:
    """Handle WebhookTriggerNotFoundError with RFC 9457 format."""
    logger.warning("Webhook trigger not found", exc_info=exc)
    return create_problem_details_response(
        status_code=status.HTTP_404_NOT_FOUND,
        problem_type=PROBLEM_TYPES["resource_not_found"],
        title="Webhook Trigger Not Found",
        detail="No webhook trigger is configured for the requested path",
        code="WEBHOOK_TRIGGER_NOT_FOUND",
        retryable=False,
        instance=str(request.url),
    )


def webhook_trigger_path_conflict_handler(request: Request, exc: "WebhookTriggerPathConflictError") -> JSONResponse:
    """Handle WebhookTriggerPathConflictError with RFC 9457 format."""
    logger.warning("Webhook trigger path conflict", exc_info=exc)
    return create_problem_details_response(
        status_code=status.HTTP_409_CONFLICT,
        problem_type=PROBLEM_TYPES["name_conflict"],
        title="Webhook Path Conflict",
        detail="The requested webhook path is already in use by another trigger",
        code="WEBHOOK_TRIGGER_PATH_CONFLICT",
        retryable=False,
        instance=str(request.url),
    )


def trigger_validation_handler(request: Request, exc: "TriggerValidationError") -> JSONResponse:
    """Handle TriggerValidationError with RFC 9457 format."""
    logger.warning("Trigger payload validation failed", exc_info=exc)
    return create_problem_details_response(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        problem_type=PROBLEM_TYPES["validation_error"],
        title="Trigger Payload Validation Failed",
        detail=exc.message,
        code="TRIGGER_VALIDATION_ERROR",
        retryable=False,
        instance=str(request.url),
    )


def payload_too_large_handler(request: Request, exc: "PayloadTooLargeError") -> JSONResponse:
    """Handle PayloadTooLargeError with RFC 9457 format."""
    logger.warning("Webhook payload too large", exc_info=exc)
    return create_problem_details_response(
        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        problem_type=PROBLEM_TYPES["payload_too_large"],
        title="Payload Too Large",
        detail=exc.message,
        code="PAYLOAD_TOO_LARGE",
        retryable=False,
        instance=str(request.url),
    )


def temporal_rpc_error_handler(request: Request, exc: RPCError) -> JSONResponse:
    """Handle Temporal RPCError with RFC 9457 format."""
    # Log the full error for debugging but don't expose it to users
    logger.error("Temporal RPC error", exc_info=exc)

    return create_problem_details_response(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        problem_type=PROBLEM_TYPES["internal_error"],
        title="Temporal Workflow Error",
        detail="Temporal workflow operation failed",
        code="TEMPORAL_WORKFLOW_ERROR",
        retryable=True,
        instance=str(request.url),
    )
