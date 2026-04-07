"""Actor context extraction utilities for audit decorators."""

import inspect
from typing import Any
from uuid import UUID

import structlog

from nexus.core.audit.emitter import actor_id_context_var, actor_type_context_var
from nexus.core.audit.types import ActorContext, ActorType

logger = structlog.stdlib.get_logger(__name__)


def _try_fastapi_dependency_extraction(kwargs: dict[str, Any]) -> ActorContext | None:
    """Try to extract actor from FastAPI dependency injection."""
    try:
        # Look for common FastAPI patterns
        if "current_user" in kwargs:
            user = kwargs["current_user"]
            return ActorContext(actor_id=getattr(user, "id", None), actor_type=ActorType.USER)

        if "user_context" in kwargs:
            context = kwargs["user_context"]
            return ActorContext(actor_id=getattr(context, "user_id", None), actor_type=ActorType.USER)
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
    signature: inspect.Signature, args: tuple[Any, ...], kwargs: dict[str, Any]
) -> ActorContext | None:
    """Auto-detect actor from common parameter patterns.

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
                    return _convert_to_actor_context(value)
    except (TypeError, ValueError) as exc:
        logger.debug(
            "Actor parameter auto-detection failed",
            error_type=type(exc).__name__,
        )
    return None


def _convert_to_actor_context(value: Any) -> ActorContext:  # noqa: ANN401
    """Convert various value types to ActorContext."""
    if isinstance(value, ActorContext):
        return value

    if isinstance(value, UUID):
        return ActorContext(actor_id=value, actor_type=ActorType.USER)

    if isinstance(value, str):
        try:
            return ActorContext(actor_id=UUID(value), actor_type=ActorType.USER)
        except ValueError:
            pass

    # Handle user objects with common attributes
    if hasattr(value, "id"):
        actor_id = value.id
        if isinstance(actor_id, (UUID, str)):
            try:
                return ActorContext(
                    actor_id=UUID(actor_id) if isinstance(actor_id, str) else actor_id,
                    actor_type=ActorType.USER,
                )
            except ValueError:
                pass

    # Default to unknown if we can't determine actor identity
    return ActorContext(actor_id=None, actor_type=ActorType.UNKNOWN)


def extract_actor_context(
    signature: inspect.Signature,
    args: tuple[Any, ...],
    kwargs: dict[str, Any],
    actor_param: str | None = None,
    actor_fallback: ActorContext | None = None,
    func_name: str = "<unknown>",
    func_module: str = "<unknown>",
) -> ActorContext:
    """Extract actor context using multiple fallback strategies."""
    # Strategy 1: Use existing context variable (highest priority)
    if actor_id_context_var.get() is not None:
        return ActorContext(actor_id=actor_id_context_var.get(), actor_type=actor_type_context_var.get())

    # Strategy 2: FastAPI dependency injection
    fastapi_actor = _try_fastapi_dependency_extraction(kwargs)
    if fastapi_actor:
        return fastapi_actor

    # Strategy 3: Explicit parameter specification
    if actor_param:
        actor_value = _extract_from_param(signature, args, kwargs, actor_param)
        if actor_value:
            return _convert_to_actor_context(actor_value)

    # Strategy 4: Auto-detect common parameter patterns
    auto_detected = _auto_detect_actor_params(signature, args, kwargs)
    if auto_detected:
        return auto_detected

    # Strategy 5: Use provided fallback
    if actor_fallback:
        return actor_fallback

    # Strategy 6: Default to unknown actor with warning
    logger.warning(
        "Actor extraction failed - defaulting to UNKNOWN actor",
        function_name=func_name,
        module=func_module,
    )
    return ActorContext(actor_id=None, actor_type=ActorType.UNKNOWN)
