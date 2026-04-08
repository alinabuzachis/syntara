"""RFC 9457 compliant error handlers for the settings domain."""

from typing import TYPE_CHECKING

import structlog
from fastapi import Request, status
from fastapi.responses import JSONResponse

from nexus.core.error_handlers import PROBLEM_TYPES, create_problem_details_response

if TYPE_CHECKING:
    from nexus.settings.exceptions import SettingValidationError

logger = structlog.stdlib.get_logger(__name__)


def setting_validation_error_handler(request: Request, exc: "SettingValidationError") -> JSONResponse:
    """Handle SettingValidationError with RFC 9457 format."""
    logger.error("Setting validation error", key=exc.key, detail=exc.detail)
    return create_problem_details_response(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        problem_type=PROBLEM_TYPES["validation_error"],
        title="Setting Validation Error",
        detail=exc.detail,
        code="SETTING_VALIDATION_ERROR",
        retryable=False,
        instance=str(request.url),
    )
