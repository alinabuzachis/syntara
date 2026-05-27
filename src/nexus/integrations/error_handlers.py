"""RFC 9457 compliant error handlers for the integrations domain."""

from typing import TYPE_CHECKING

import structlog
from fastapi import Request, status
from fastapi.responses import JSONResponse

from nexus.core.error_handlers import PROBLEM_TYPES, create_problem_details_response

if TYPE_CHECKING:
    from nexus.integrations.exceptions import (
        IntegrationError,
        IntegrationNameConflictError,
        IntegrationNotFoundError,
    )

logger = structlog.stdlib.get_logger(__name__)


def integration_not_found_handler(request: Request, exc: "IntegrationNotFoundError") -> JSONResponse:
    """Handle IntegrationNotFoundError with RFC 9457 format."""
    logger.error("Integration not found", exc_info=exc)
    return create_problem_details_response(
        status_code=status.HTTP_404_NOT_FOUND,
        problem_type=PROBLEM_TYPES["resource_not_found"],
        title="Integration Not Found",
        detail=exc.message,
        code="INTEGRATION_NOT_FOUND",
        retryable=False,
        instance=str(request.url),
    )


def integration_name_conflict_handler(request: Request, exc: "IntegrationNameConflictError") -> JSONResponse:
    """Handle IntegrationNameConflictError with RFC 9457 format."""
    logger.error("Integration name conflict", exc_info=exc)
    return create_problem_details_response(
        status_code=status.HTTP_409_CONFLICT,
        problem_type=PROBLEM_TYPES["name_conflict"],
        title="Integration Name Conflict",
        detail=exc.message,
        code="INTEGRATION_NAME_CONFLICT",
        retryable=False,
        instance=str(request.url),
    )


def integration_error_handler(request: Request, exc: "IntegrationError") -> JSONResponse:
    """Handle generic IntegrationError with RFC 9457 format."""
    logger.error("Integration error", exc_info=exc)
    return create_problem_details_response(
        status_code=status.HTTP_400_BAD_REQUEST,
        problem_type=PROBLEM_TYPES["integration_error"],
        title="Integration Error",
        detail=exc.message,
        code="INTEGRATION_ERROR",
        retryable=False,
        instance=str(request.url),
    )
