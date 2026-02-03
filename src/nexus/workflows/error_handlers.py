"""RFC 9457 compliant error handlers for Workflows domain.

This module provides error handling for workflow and execution-specific exceptions.
"""

import structlog
from fastapi import Request, status
from fastapi.responses import JSONResponse
from temporalio.service import RPCError

from nexus.core.error_handlers import PROBLEM_TYPES, create_problem_details_response
from nexus.workflows.exceptions import (
    ExecutionNotFoundError,
    TemporalUnavailableError,
    WorkflowDisabledError,
    WorkflowNameConflictError,
    WorkflowNotFoundError,
    WorkflowVersionNotFoundError,
)
from nexus.workflows.validators import ValidationError

logger = structlog.stdlib.get_logger(__name__)


def validation_error_handler(request: Request, exc: ValidationError) -> JSONResponse:
    """Handle core ValidationError with RFC 9457 format."""
    logger.error("Core validation error", exc_info=exc)
    return create_problem_details_response(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        problem_type=PROBLEM_TYPES["validation_error"],
        title="Validation Error",
        detail="The provided data failed validation requirements",
        code="VALIDATION_ERROR",
        retryable=False,
        instance=str(request.url),
    )


def workflow_not_found_handler(request: Request, exc: WorkflowNotFoundError) -> JSONResponse:
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


def execution_not_found_handler(request: Request, exc: ExecutionNotFoundError) -> JSONResponse:
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


def workflow_version_not_found_handler(request: Request, exc: WorkflowVersionNotFoundError) -> JSONResponse:
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


def workflow_name_conflict_handler(request: Request, exc: WorkflowNameConflictError) -> JSONResponse:
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


def workflow_disabled_handler(request: Request, exc: WorkflowDisabledError) -> JSONResponse:
    """Handle WorkflowDisabledError with RFC 9457 format."""
    # Log the full exception for debugging but don't expose workflow IDs to users
    logger.error("Workflow disabled", exc_info=exc)
    return create_problem_details_response(
        status_code=status.HTTP_400_BAD_REQUEST,
        problem_type=PROBLEM_TYPES["resource_disabled"],
        title="Workflow Disabled",
        detail="The requested workflow is currently disabled",
        code="WORKFLOW_DISABLED",
        retryable=False,
        instance=str(request.url),
    )


def temporal_unavailable_handler(request: Request, exc: TemporalUnavailableError) -> JSONResponse:
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
