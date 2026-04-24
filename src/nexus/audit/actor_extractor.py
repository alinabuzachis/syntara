"""Actor context extraction utilities for audit decorators."""

import inspect
from typing import Any

import structlog

from nexus.audit.emitter import actor_context_var
from nexus.core.models.user import User

logger = structlog.stdlib.get_logger(__name__)


def _try_fastapi_dependency_extraction(kwargs: dict[str, Any]) -> Any:  # noqa: ANN401
    """Try to extract actor from FastAPI dependency injection.

    Returns the extracted value (typically a User object) or None.
    Caller must validate and convert using _convert_to_actor_context.
    """
    try:
        # Look for common FastAPI patterns
        if "current_user" in kwargs:
            return kwargs["current_user"]

        if "user_context" in kwargs:
            return kwargs["user_context"]
    except (AttributeError, KeyError, TypeError) as e:
        logger.debug(
            "FastAPI dependency extraction failed",
            error_type=type(e).__name__,
        )
    return None


def _extract_from_param(
    signature: inspect.Signature, args: tuple[Any, ...], kwargs: dict[str, Any], param_name: str
) -> Any:  # noqa: ANN401
    """Extract value from specific parameter name."""
    try:
        bound_args = signature.bind(*args, **kwargs)
        bound_args.apply_defaults()
        return bound_args.arguments.get(param_name)
    except (TypeError, ValueError) as exc:
        logger.debug(
            "Parameter extraction failed",
            param_name=param_name,
            error_type=type(exc).__name__,
        )
        return None


def _auto_detect_actor_params(
    signature: inspect.Signature,
    args: tuple[Any, ...],
    kwargs: dict[str, Any],
) -> Any:  # noqa: ANN401
    """Auto-detect actor from common parameter patterns.

    Returns the extracted value or None. Caller must validate and convert
    using _convert_to_actor_context.

    WARNING: This method blindly trusts parameter values and should only be used
    on endpoints protected by authentication middleware. In non-authenticated
    contexts, malicious callers can spoof user identities by passing forged
    parameter values, undermining audit integrity and non-repudiation.

    For security-sensitive operations, consider using explicit actor_param
    specification or context variables instead of auto-detection.
    """
    try:
        bound_args = signature.bind(*args, **kwargs)
        bound_args.apply_defaults()

        # Common parameter name patterns (in priority order)
        user_patterns = ["user_id", "current_user", "user", "actor_id", "requestor_id"]

        for param_name in user_patterns:
            if param_name in bound_args.arguments:
                value = bound_args.arguments[param_name]
                if value is not None:
                    return value
    except (TypeError, ValueError) as exc:
        logger.debug(
            "Actor parameter auto-detection failed",
            error_type=type(exc).__name__,
        )
    return None


def extract_actor(
    signature: inspect.Signature,
    args: tuple[Any, ...],
    kwargs: dict[str, Any],
    actor_param: str | None = None,
) -> User | None:
    """Extract actor context using multiple fallback strategies."""
    # Strategy 1: Use existing context variable (highest priority)
    actor = actor_context_var.get()
    if actor is not None:
        return actor

    # Strategy 2: FastAPI dependency injection
    fastapi_value = _try_fastapi_dependency_extraction(kwargs)
    if isinstance(fastapi_value, User):
        return fastapi_value

    # Strategy 3: Explicit parameter specification
    if actor_param is not None:
        actor_value = _extract_from_param(signature, args, kwargs, actor_param)
        if isinstance(actor_value, User):
            return actor_value

    # Strategy 4: Auto-detect common parameter patterns
    auto_detected_value = _auto_detect_actor_params(signature, args, kwargs)
    if isinstance(auto_detected_value, User):
        return auto_detected_value

    return None
