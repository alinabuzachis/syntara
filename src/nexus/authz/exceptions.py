"""Authorization exceptions."""

from fastapi import Request, status
from fastapi.responses import JSONResponse

from nexus.core.error_handlers import PROBLEM_TYPES, create_problem_details_response
from nexus.core.exception_registry import fastapi_exception
from nexus.core.exceptions import NexusError


def authorization_denied_handler(
    request: Request,
    exc: "AuthorizationDeniedError",
) -> JSONResponse:
    """Handle authorization denied errors with RFC 9457 problem details."""
    return create_problem_details_response(
        status_code=status.HTTP_403_FORBIDDEN,
        problem_type=PROBLEM_TYPES["forbidden"],
        title="Authorization Denied",
        detail=exc.message,
        code="AUTHORIZATION_DENIED",
        instance=str(request.url),
    )


@fastapi_exception(handler=authorization_denied_handler)
class AuthorizationDeniedError(NexusError):
    """Raised when a user is not authorized to perform an action."""


def _not_found_handler(request: Request, exc: NexusError) -> JSONResponse:
    return create_problem_details_response(
        status_code=status.HTTP_404_NOT_FOUND,
        problem_type=PROBLEM_TYPES["resource_not_found"],
        title="Not Found",
        detail=exc.message,
        code="RESOURCE_NOT_FOUND",
        instance=str(request.url),
    )


def _conflict_handler(request: Request, exc: NexusError) -> JSONResponse:
    return create_problem_details_response(
        status_code=status.HTTP_409_CONFLICT,
        problem_type=PROBLEM_TYPES["name_conflict"],
        title="Name Conflict",
        detail=exc.message,
        code="NAME_CONFLICT",
        instance=str(request.url),
    )


def _builtin_protection_handler(request: Request, exc: NexusError) -> JSONResponse:
    return create_problem_details_response(
        status_code=status.HTTP_403_FORBIDDEN,
        problem_type=PROBLEM_TYPES["forbidden"],
        title="Builtin Resource Protected",
        detail=exc.message,
        code="BUILTIN_PROTECTED",
        instance=str(request.url),
    )


@fastapi_exception(handler=_not_found_handler)
class PolicyNotFoundError(NexusError):
    """Raised when a policy is not found."""


@fastapi_exception(handler=_not_found_handler)
class RoleNotFoundError(NexusError):
    """Raised when a role is not found."""


@fastapi_exception(handler=_not_found_handler)
class ProjectNotFoundError(NexusError):
    """Raised when a project is not found."""


@fastapi_exception(handler=_builtin_protection_handler)
class BuiltinProtectionError(NexusError):
    """Raised when attempting to modify or delete a builtin resource."""


@fastapi_exception(handler=_conflict_handler)
class PolicyNameConflictError(NexusError):
    """Raised when a policy name already exists in the same scope."""


@fastapi_exception(handler=_conflict_handler)
class RoleNameConflictError(NexusError):
    """Raised when a role name already exists in the same scope."""
