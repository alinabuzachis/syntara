"""RFC 9457 compliant error handlers for Files domain.

This module provides error handling for file processing and validation exceptions.
"""

import structlog
from fastapi import Request, status
from fastapi.responses import JSONResponse

from nexus.core.error_handlers import PROBLEM_TYPES, create_problem_details_response
from nexus.files.validators import ValidationError as FileValidationError

logger = structlog.stdlib.get_logger(__name__)


def file_validation_error_handler(request: Request, exc: FileValidationError) -> JSONResponse:
    """Handle file ValidationError with RFC 9457 format."""
    logger.error("File validation error", exc_info=exc)
    return create_problem_details_response(
        status_code=status.HTTP_400_BAD_REQUEST,
        problem_type=PROBLEM_TYPES["validation_error"],
        title="File Validation Error",
        detail=exc.message,
        code="FILE_VALIDATION_ERROR",
        retryable=False,
        instance=str(request.url),
    )
