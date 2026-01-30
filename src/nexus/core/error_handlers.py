"""RFC 9457 compliant error handlers for FastAPI - Core Domain.

This module provides centralized error handling utilities and framework-level
error handlers that are shared across all domains.
"""

import logging

from fastapi import HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy.exc import IntegrityError

from nexus.agent_orchestrator.utils import is_retryable_error
from nexus.core.models.base.error import ErrorData

logger = logging.getLogger(__name__)

INTERNAL_SERVER_ERROR: str = "Internal Server Error"
REQUEST_VALIDATION_ERROR: str = "Request Validation Error"

# Problem type URIs for common error scenarios
PROBLEM_TYPES = {
    "resource_not_found": "https://api.nexus.com/errors/resource-not-found",
    "name_conflict": "https://api.nexus.com/errors/name-conflict",
    "validation_error": "https://api.nexus.com/errors/validation-error",
    "integrity_constraint": "https://api.nexus.com/errors/integrity-constraint",
    "service_unavailable": "https://api.nexus.com/errors/service-unavailable",
    "resource_disabled": "https://api.nexus.com/errors/resource-disabled",
    "provider_error": "https://api.nexus.com/errors/provider-error",
    "internal_error": "https://api.nexus.com/errors/internal-error",
}


def create_problem_details_response(
    status_code: int,
    problem_type: str,
    title: str,
    detail: str,
    code: str,
    *,
    retryable: bool = False,
    instance: str | None = None,
) -> JSONResponse:
    """Create RFC 9457 compliant error response.

    Args:
        status_code: HTTP status code
        problem_type: URI identifying the problem type
        title: Short summary of the problem
        detail: Detailed explanation of the problem
        code: Machine-readable error code
        retryable: Whether the error is retryable
        instance: URI identifying the specific occurrence

    Returns:
        JSONResponse with RFC 9457 Problem Details format

    """
    error_data = ErrorData(
        type=problem_type,
        title=title,
        detail=detail,
        code=code,
        retryable=retryable,
        instance=instance,
    )

    logger.debug("Created ErrorData %s", error_data.to_dict())

    return JSONResponse(
        status_code=status_code,
        content=error_data.to_dict(),
        media_type="application/problem+json",
    )


def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Handle HTTPException with RFC 9457 format.

    Args:
        request: FastAPI request object
        exc: HTTP exception

    Returns:
        RFC 9457 compliant error response

    """
    # Extract detail from HTTPException
    detail_content = exc.detail if isinstance(exc.detail, str) else str(exc.detail)

    # Map status codes to problem types and titles
    status_mapping = {
        400: ("validation_error", "Bad Request"),
        401: ("validation_error", "Unauthorized"),
        403: ("validation_error", "Forbidden"),
        404: ("resource_not_found", "Not Found"),
        409: ("name_conflict", "Conflict"),
        422: ("validation_error", "Unprocessable Entity"),
        500: ("internal_error", "Internal Server Error"),
        503: ("service_unavailable", "Service Unavailable"),
    }

    problem_key, title = status_mapping.get(exc.status_code, ("internal_error", "Error"))

    logger.error("HTTPException %s, %s", problem_key, title, exc_info=exc)
    return create_problem_details_response(
        status_code=exc.status_code,
        problem_type=PROBLEM_TYPES[problem_key],
        title=title,
        detail=detail_content,
        code=f"HTTP_{exc.status_code}",
        retryable=is_retryable_error(exc),
        instance=str(request.url),
    )


def validation_error_handler(request: Request, exc: PydanticValidationError | RequestValidationError) -> JSONResponse:
    """Handle Pydantic ValidationError with RFC 9457 format."""
    logger.error("Validation error", exc_info=exc)

    # Format Pydantic validation errors nicely
    error_details = []
    for error in exc.errors():
        field = " -> ".join(str(x) for x in error["loc"]) if error["loc"] else "root"
        error_details.append(f"{field}: {error['msg']}")

    detail = "Validation failed: " + "; ".join(error_details)

    return create_problem_details_response(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        problem_type=PROBLEM_TYPES["validation_error"],
        title=REQUEST_VALIDATION_ERROR,
        detail=detail,
        code="REQUEST_VALIDATION_ERROR",
        retryable=False,
        instance=str(request.url),
    )


def integrity_error_handler(request: Request, exc: IntegrityError) -> JSONResponse:
    """Handle SQLAlchemy IntegrityError with RFC 9457 format.

    Returns 409 for name conflicts (handled by ProviderNameConflictError handler)
    and 400 for other constraint violations.
    """
    # Log the full error for debugging but don't expose it to users
    logger.error("Database integrity constraint violation", exc_info=exc)

    # Check if this is likely a name conflict by examining the exception type and message
    # without exposing the actual message content
    error_str = str(exc).lower()
    is_name_conflict = "unique" in error_str and "name" in error_str

    if is_name_conflict:
        # This should not normally happen as name conflicts should be caught by
        # ProviderNameConflictError handler, but handle it as 409 for consistency
        return create_problem_details_response(
            status_code=status.HTTP_409_CONFLICT,
            problem_type=PROBLEM_TYPES["name_conflict"],
            title="Name Conflict",
            detail="A resource with this name already exists",
            code="INTEGRITY_NAME_CONFLICT",
            retryable=False,
            instance=str(request.url),
        )

    # Non-name-conflict constraint violations return 400 Bad Request
    return create_problem_details_response(
        status_code=status.HTTP_400_BAD_REQUEST,
        problem_type=PROBLEM_TYPES["integrity_constraint"],
        title="Integrity Constraint Violation",
        detail="A database constraint was violated - please check your input data",
        code="INTEGRITY_CONSTRAINT_VIOLATION",
        retryable=False,
        instance=str(request.url),
    )


def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
    """Handle ValueError with RFC 9457 format.

    ValueError is commonly used for validation errors in the application,
    particularly for cursor validation, UUID parsing, and other input validation.
    This handler treats all ValueError instances as validation errors returning 422.
    """
    logger.error("Value error", exc_info=exc)

    return create_problem_details_response(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        problem_type=PROBLEM_TYPES["validation_error"],
        title="Validation Error",
        detail="Invalid input value",
        code="VALIDATION_ERROR",
        retryable=False,
        instance=str(request.url),
    )


def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle unexpected exceptions with RFC 9457 format.

    This is the catch-all handler for any unhandled exceptions.
    It logs the full exception details for debugging while returning
    a generic error to the client for security.
    """
    logger.error("Unhandled exception in API request", exc_info=exc)

    return create_problem_details_response(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        problem_type=PROBLEM_TYPES["internal_error"],
        title=INTERNAL_SERVER_ERROR,
        detail="An unexpected error occurred while processing the request",
        code="INTERNAL_SERVER_ERROR",
        retryable=True,
        instance=str(request.url),
    )
