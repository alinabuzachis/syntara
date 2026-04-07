"""Audit event tracking decorators for automatic function instrumentation."""

import functools
import inspect
import json
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import structlog

from nexus.core.audit.actor_extractor import extract_actor_context
from nexus.core.audit.emitter import actor_id_context_var, actor_type_context_var, emit_audit_event
from nexus.core.audit.types import ActorContext, AuditEvent, EventCategory

logger = structlog.stdlib.get_logger(__name__)


@dataclass
class AuditContext:
    """Container for audit context setup results."""

    action: str
    component: str
    actor_context: ActorContext
    structured_data: dict[str, Any]
    token_actor_id: Any
    token_actor_type: Any
    event_category: EventCategory
    capture_result: bool | set[str]
    max_payload_bytes: int


_DEFAULT_MAX_PAYLOAD_BYTES = 10_000


def _enforce_payload_limit(structured_data: dict[str, Any], max_bytes: int) -> None:
    """Truncate oversized structured_data in-place to stay within max_bytes total.

    Measures the total serialized size. If over max_bytes, repeatedly truncates
    the largest value (by serialized size) until the total fits. Works on any key.
    """
    suffix = "...<truncated>"

    # Fast bail — check total size first, avoid per-key work if under budget
    try:
        total = len(json.dumps(structured_data, default=str).encode())
    except (TypeError, ValueError):
        return
    if total <= max_bytes:
        return

    # Only compute per-key sizes when we actually need to truncate
    sizes: dict[str, int] = {}
    for key, value in structured_data.items():
        try:
            sizes[key] = len(json.dumps(value, default=str).encode())
        except (TypeError, ValueError):
            sizes[key] = len(str(value).encode())

    while total > max_bytes:
        if not sizes:
            break

        largest_key = max(sizes, key=sizes.get)  # type: ignore[arg-type]
        raw = str(structured_data[largest_key])

        # Can't shrink further if already at or below suffix length
        if len(raw) <= len(suffix):
            break

        overage = total - max_bytes
        cut_to = max(0, len(raw) - overage - len(suffix))
        logger.warning(
            "Structured data exceeds max payload size, truncating %s",
            largest_key,
            total_size_bytes=total,
            max_bytes=max_bytes,
        )
        truncated = raw[:cut_to] + suffix
        structured_data[largest_key] = truncated

        # Update only the changed key's cached size
        old_size = sizes[largest_key]
        new_size = len(json.dumps(truncated, default=str).encode())
        sizes[largest_key] = new_size

        # No-progress guard
        if new_size >= old_size:
            break

        total -= old_size - new_size


def _capture_function_arguments(
    signature: inspect.Signature,
    args: tuple[Any, ...],
    kwargs: dict[str, Any],
    *,
    capture_args: bool | set[str],
    max_payload_bytes: int = _DEFAULT_MAX_PAYLOAD_BYTES,
    func_name: str = "<unknown>",
    func_module: str = "<unknown>",
) -> dict[str, Any]:
    """Capture function arguments for audit logging.

    Args:
        signature: Function signature for binding arguments
        args: Positional arguments passed to the function
        kwargs: Keyword arguments passed to the function
        capture_args: If False, capture nothing. If True, capture all arguments.
                     If set[str], capture only the specified parameter names.
        max_payload_bytes: Maximum size in bytes for captured arguments/results before
                          truncation. Defaults to 10,000 bytes.
        func_name: Function name for logging purposes
        func_module: Function module for logging purposes

    Security Note: Using capture_args=True captures all parameters including
    potentially sensitive data. Use selective capture (set of param names)
    for better security control.

    """
    # Handle no-capture cases: False or empty set both mean "capture nothing"
    if capture_args is False or (isinstance(capture_args, set) and len(capture_args) == 0):
        return {}

    try:
        bound_args = signature.bind(*args, **kwargs)
        bound_args.apply_defaults()
        all_args = dict(bound_args.arguments)

        # If capture_args is True, capture all arguments
        if capture_args is True:
            # Security warning for capture_args=True
            logger.warning(
                "capture_args=True captures ALL function arguments including potential secrets. "
                "Consider using selective capture with a set of safe parameter names instead.",
                function_name=func_name,
                module=func_module,
            )

            captured = {"function_args": all_args}
            _enforce_payload_limit(captured, max_payload_bytes)
            return captured

        # If capture_args is a set, capture only specified parameters
        filtered_args = {key: value for key, value in all_args.items() if key in capture_args}
        captured = {"function_args": filtered_args}
        _enforce_payload_limit(captured, max_payload_bytes)
        return captured
    except (TypeError, ValueError) as exc:
        logger.debug(
            "Function argument capture failed - signature binding error",
            function_name=func_name,
            error_type=type(exc).__name__,
            error_message=str(exc),
        )
        # Return empty dict to prevent sensitive data exposure from raw args/kwargs
        return {"function_args": {"capture_error": "Failed to bind function signature"}}


def _setup_audit_context(
    func: Callable[..., Any],
    args: tuple[Any, ...],
    kwargs: dict[str, Any],
    event_action: str | None,
    source_component: str | None,
    actor_param: str | None,
    actor_fallback: ActorContext | None,
    event_category: EventCategory,
    *,
    capture_args: bool | set[str],
    capture_result: bool | set[str],
    max_payload_bytes: int = _DEFAULT_MAX_PAYLOAD_BYTES,
) -> AuditContext:
    """Set up audit context and capture initial data.

    IMPORTANT: This function captures actor_context in the returned AuditContext object.
    This is critical for nested @track_event decorators - the captured actor_context
    must be used for event emission rather than reading from ContextVars, because
    inner decorators' finally blocks reset ContextVars before outer decorators emit.
    """
    # Get function signature once and reuse it
    try:
        signature = inspect.signature(func)
    except (ValueError, TypeError) as exc:
        logger.debug(
            "Failed to get function signature",
            function_name=func.__name__,
            error_type=type(exc).__name__,
        )
        # Create a dummy signature for fallback
        signature = inspect.Signature()

    # Determine event details
    action = event_action or func.__name__
    component = source_component or func.__module__

    # Extract actor context using flexible strategies
    # CRITICAL: This must be captured here and stored in AuditContext for later use
    actor_context = extract_actor_context(
        signature, args, kwargs, actor_param, actor_fallback, func.__name__, func.__module__
    )

    # Set actor context using context variables for async-safe operations
    token_actor_id = actor_id_context_var.set(actor_context.actor_id)
    token_actor_type = actor_type_context_var.set(actor_context.actor_type)

    # Capture function arguments
    structured_data = _capture_function_arguments(
        signature,
        args,
        kwargs,
        capture_args=capture_args,
        max_payload_bytes=max_payload_bytes,
        func_name=func.__name__,
        func_module=func.__module__,
    )

    return AuditContext(
        action=action,
        component=component,
        actor_context=actor_context,
        structured_data=structured_data,
        token_actor_id=token_actor_id,
        token_actor_type=token_actor_type,
        event_category=event_category,
        capture_result=capture_result,
        max_payload_bytes=max_payload_bytes,
    )


def _handle_success_result(result: Any, audit_context: AuditContext) -> Any:  # noqa: ANN401
    """Handle successful function execution and emit audit event.

    IMPORTANT: Uses captured audit_context.actor_context rather than reading from
    ContextVars to ensure correct actor data in nested @track_event scenarios.
    """
    # Capture result if requested (False and empty set both mean "capture nothing")
    if audit_context.capture_result is not False and not (
        isinstance(audit_context.capture_result, set) and len(audit_context.capture_result) == 0
    ):
        # If capture_result is True, capture the entire result
        if audit_context.capture_result is True:
            audit_context.structured_data["function_result"] = result
        # If capture_result is a set, capture only specified fields from dict/object result
        elif isinstance(audit_context.capture_result, set):
            # Handle dict-like results
            if isinstance(result, dict):
                captured_result = {key: value for key, value in result.items() if key in audit_context.capture_result}
                audit_context.structured_data["function_result"] = captured_result
            # Handle object-like results with attributes
            elif hasattr(result, "__dict__"):
                result_dict = result.__dict__
                captured_result = {
                    key: value for key, value in result_dict.items() if key in audit_context.capture_result
                }
                audit_context.structured_data["function_result"] = captured_result
            # Handle primitive types - log warning and do not capture
            else:
                logger.warning(
                    "Selective result capture not supported for primitive return type, not capturing result",
                    function_name=audit_context.action,
                    result_type=type(result).__name__,
                    requested_fields=list(audit_context.capture_result),
                )

    # Truncate captured result if oversized
    _enforce_payload_limit(audit_context.structured_data, audit_context.max_payload_bytes)

    # Create and emit success audit event
    # NOTE: Must use audit_context.actor_context, NOT ContextVars, for nested decorator safety
    event = AuditEvent(
        event_category=audit_context.event_category,
        event_action=audit_context.action,
        event_message=f"Function {audit_context.action} executed successfully",
        source_component=audit_context.component,
        structured_data=audit_context.structured_data,
        actor_id=audit_context.actor_context.actor_id,
        actor_type=audit_context.actor_context.actor_type,
        workflow_id=None,
        activity_id=None,
        execution_id=None,
    )
    emit_audit_event(event)

    return result


def _handle_error(error: Exception, audit_context: AuditContext) -> None:
    """Handle function execution error and emit audit event.

    IMPORTANT: Uses captured audit_context.actor_context rather than reading from
    ContextVars to ensure correct actor data in nested @track_event scenarios.
    """
    # Log error type to operational logs without full stack trace to avoid
    # leaking sensitive data (e.g., credentials in SQLAlchemy connection strings,
    # request bodies in FastAPI exceptions) through exc_info.
    logger.error(
        "Function failed with exception",
        function_name=audit_context.action,
        error_type=type(error).__name__,
    )

    # Create and emit error audit event
    error_structured_data = {
        **audit_context.structured_data,
        "error_type": type(error).__name__,
        "error_message": "Look at the Operational Logs for full diagnosis",
    }

    # NOTE: Must use audit_context.actor_context, NOT ContextVars, for nested decorator safety
    error_event = AuditEvent(
        event_category=audit_context.event_category,
        event_action=f"{audit_context.action}_error",
        event_message=f"Function {audit_context.action} failed with {type(error).__name__}",
        source_component=audit_context.component,
        structured_data=error_structured_data,
        actor_id=audit_context.actor_context.actor_id,
        actor_type=audit_context.actor_context.actor_type,
        workflow_id=None,
        activity_id=None,
        execution_id=None,
    )
    emit_audit_event(error_event)


def _cleanup_audit_context(audit_context: AuditContext) -> None:
    """Clean up audit context variables."""
    actor_id_context_var.reset(audit_context.token_actor_id)
    actor_type_context_var.reset(audit_context.token_actor_type)


def track_event[F: Callable[..., Any]](
    event_category: EventCategory,
    event_action: str | None = None,
    source_component: str | None = None,
    *,
    capture_args: bool | set[str] = False,
    capture_result: bool | set[str] = False,
    actor_param: str | None = None,
    actor_fallback: ActorContext | None = None,
    max_payload_bytes: int = _DEFAULT_MAX_PAYLOAD_BYTES,
) -> Callable[[F], F]:
    """Track function execution with flexible actor detection.

    Actor detection priority (first match wins):
    1. Current context variable (from actor_context manager)
    2. FastAPI dependency injection (if available)
    3. Explicit actor_param specification
    4. Function parameter auto-detection
    5. Fallback actor context
    6. System actor (last resort)

    NESTED DECORATOR SAFETY:
    This decorator supports stacking (multiple @track_event decorators on the same function).
    The implementation captures actor context early and uses the captured data for event
    emission rather than reading from ContextVars at emission time. This prevents issues
    where inner decorators' finally blocks reset ContextVars before outer decorators emit.

    Args:
        event_category: Category of the audit event
        event_action: Custom action name (defaults to function name)
        source_component: Component generating the event (defaults to module name)
        capture_args: Whether to capture function arguments. Can be:
                     - False: capture nothing (default, safest)
                     - True: capture all arguments (security risk)
                     - set[str]: capture only specified parameter names (recommended)
        capture_result: Whether to capture function return value. Can be:
                       - False: capture nothing (default)
                       - True: capture entire return value
                       - set[str]: capture only specified fields from dict/object return

                       CAUTION: When using set[str] with primitive return types (str, int, etc.),
                       no result is captured and a warning is logged (safer audit default).
                       Selective capture only works with dict-like objects and objects with __dict__.
        actor_param: Optional parameter name to extract actor from
        actor_fallback: Fallback actor context if no actor detected
        max_payload_bytes: Maximum size in bytes for captured arguments/results before
                          truncation. Defaults to 10,000 bytes.

    Security Notes:
        - Using capture_args=True captures ALL parameters including sensitive data
        - Use selective capture (set of param names) for better security control
        - Consider PII risks when capturing arguments or results

    """

    def decorator(func: F) -> F:
        if inspect.iscoroutinefunction(func):

            @functools.wraps(func)
            async def async_wrapper(*args: Any, **kwargs: Any) -> Any:  # noqa: ANN401
                audit_context = _setup_audit_context(
                    func,
                    args,
                    kwargs,
                    event_action,
                    source_component,
                    actor_param,
                    actor_fallback,
                    event_category,
                    capture_args=capture_args,
                    capture_result=capture_result,
                    max_payload_bytes=max_payload_bytes,
                )

                try:
                    # Execute the async function
                    result = await func(*args, **kwargs)
                    return _handle_success_result(result, audit_context)

                except Exception as e:
                    _handle_error(e, audit_context)
                    raise
                finally:
                    _cleanup_audit_context(audit_context)

            return async_wrapper  # type: ignore[return-value]

        @functools.wraps(func)
        def sync_wrapper(*args: Any, **kwargs: Any) -> Any:  # noqa: ANN401
            audit_context = _setup_audit_context(
                func,
                args,
                kwargs,
                event_action,
                source_component,
                actor_param,
                actor_fallback,
                event_category,
                capture_args=capture_args,
                capture_result=capture_result,
                max_payload_bytes=max_payload_bytes,
            )

            try:
                # Execute the function
                result = func(*args, **kwargs)
                return _handle_success_result(result, audit_context)

            except Exception as e:
                _handle_error(e, audit_context)
                raise
            finally:
                _cleanup_audit_context(audit_context)

        return sync_wrapper  # type: ignore[return-value]

    return decorator
