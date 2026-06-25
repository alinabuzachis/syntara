"""RFC 9457 compliant error handlers for the integrations domain."""

from typing import TYPE_CHECKING

import structlog
from fastapi import Request, status
from fastapi.responses import JSONResponse

from nexus.core.error_handlers import PROBLEM_TYPES, create_problem_details_response

if TYPE_CHECKING:
    from nexus.integrations.exceptions import (
        IntegrationCredentialNotFoundError,
        IntegrationCredentialRequiredError,
        IntegrationCredentialTypeMismatchError,
        IntegrationError,
        IntegrationNameConflictError,
        IntegrationNotFoundError,
        IntegrationRefreshNotSupportedError,
    )

logger = structlog.stdlib.get_logger(__name__)


def integration_not_found_handler(request: Request, exc: "IntegrationNotFoundError") -> JSONResponse:
    """Handle IntegrationNotFoundError with RFC 9457 format."""
    logger.exception("Integration not found", integration_id=str(exc.integration_id))
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
    logger.exception("Integration name conflict", name=exc.name)
    return create_problem_details_response(
        status_code=status.HTTP_409_CONFLICT,
        problem_type=PROBLEM_TYPES["name_conflict"],
        title="Integration Name Conflict",
        detail=exc.message,
        code="INTEGRATION_NAME_CONFLICT",
        retryable=False,
        instance=str(request.url),
    )


def integration_credential_required_handler(
    request: Request,
    exc: "IntegrationCredentialRequiredError",
) -> JSONResponse:
    """Handle IntegrationCredentialRequiredError with RFC 9457 format."""
    logger.exception("Integration credential required for health check", integration_id=str(exc.integration_id))
    return create_problem_details_response(
        status_code=status.HTTP_400_BAD_REQUEST,
        problem_type=PROBLEM_TYPES["integration_error"],
        title="Credential Required",
        detail=exc.message,
        code="INTEGRATION_CREDENTIAL_REQUIRED",
        retryable=False,
        instance=str(request.url),
    )


def integration_credential_not_found_handler(
    request: Request,
    exc: "IntegrationCredentialNotFoundError",
) -> JSONResponse:
    """Handle IntegrationCredentialNotFoundError with RFC 9457 format."""
    logger.exception("Integration credential not found", credential_id=str(exc.credential_id))
    return create_problem_details_response(
        status_code=status.HTTP_404_NOT_FOUND,
        problem_type=PROBLEM_TYPES["resource_not_found"],
        title="Credential Not Found",
        detail=exc.message,
        code="INTEGRATION_CREDENTIAL_NOT_FOUND",
        retryable=False,
        instance=str(request.url),
    )


def integration_credential_type_mismatch_handler(
    request: Request,
    exc: "IntegrationCredentialTypeMismatchError",
) -> JSONResponse:
    """Handle IntegrationCredentialTypeMismatchError with RFC 9457 format."""
    logger.exception(
        "Credential type mismatch",
        integration_type=exc.integration_type,
        credential_type_name=exc.credential_type_name,
    )
    return create_problem_details_response(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        problem_type=PROBLEM_TYPES["validation_error"],
        title="Invalid Credential Type",
        detail=exc.message,
        code="INTEGRATION_CREDENTIAL_TYPE_MISMATCH",
        retryable=False,
        instance=str(request.url),
    )


def integration_refresh_not_supported_handler(
    request: Request,
    exc: "IntegrationRefreshNotSupportedError",
) -> JSONResponse:
    """Handle IntegrationRefreshNotSupportedError with RFC 9457 format."""
    logger.warning(
        "Integration refresh not supported",
        integration_id=str(exc.integration_id),
        integration_type=exc.integration_type,
    )
    return create_problem_details_response(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        problem_type=PROBLEM_TYPES["validation_error"],
        title="Refresh Not Supported",
        detail=exc.message,
        code="INTEGRATION_REFRESH_NOT_SUPPORTED",
        retryable=False,
        instance=str(request.url),
    )


def integration_error_handler(request: Request, exc: "IntegrationError") -> JSONResponse:
    """Handle generic IntegrationError with RFC 9457 format."""
    logger.exception("Integration error")
    return create_problem_details_response(
        status_code=status.HTTP_400_BAD_REQUEST,
        problem_type=PROBLEM_TYPES["integration_error"],
        title="Integration Error",
        detail=exc.message,
        code="INTEGRATION_ERROR",
        retryable=False,
        instance=str(request.url),
    )
