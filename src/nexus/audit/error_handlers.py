"""RFC 9457 compliant error handlers for Audit domain.

This module provides error handling for audit-specific exceptions.
"""

from typing import TYPE_CHECKING

import structlog
from fastapi import Request, status
from fastapi.responses import JSONResponse

from nexus.core.error_handlers import PROBLEM_TYPES, create_problem_details_response

if TYPE_CHECKING:
    from nexus.audit.exceptions import AuditExportNotFoundError, AuditExportNotReadyError

logger = structlog.stdlib.get_logger(__name__)


def export_not_found_handler(request: Request, exc: "AuditExportNotFoundError") -> JSONResponse:
    """Handle AuditExportNotFoundError with RFC 9457 format."""
    logger.error("Audit export not found", exc_info=exc)
    return create_problem_details_response(
        status_code=status.HTTP_404_NOT_FOUND,
        problem_type=PROBLEM_TYPES["resource_not_found"],
        title="Export Not Found",
        detail=exc.message,
        code="EXPORT_NOT_FOUND",
        retryable=False,
        instance=str(request.url),
    )


def export_not_ready_handler(request: Request, exc: "AuditExportNotReadyError") -> JSONResponse:
    """Handle AuditExportNotReadyError with RFC 9457 format."""
    logger.info("Audit export download attempted before completion", export_id=exc.export_id)
    return create_problem_details_response(
        status_code=status.HTTP_409_CONFLICT,
        problem_type=PROBLEM_TYPES["resource_conflict"],
        title="Export Not Ready",
        detail=exc.message,
        code="EXPORT_NOT_READY",
        retryable=True,
        instance=str(request.url),
    )
