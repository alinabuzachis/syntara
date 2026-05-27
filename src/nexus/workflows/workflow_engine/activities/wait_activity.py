"""Wait node activities for v2 workflows.

Contains two activities:
- wait: Validates config and defers via async completion (raise_complete_async).
- complete_wait: Local activity that externally completes the async wait activity
  after the durable timer fires.
"""

from typing import Any, NoReturn

import structlog
from temporalio import activity
from temporalio.exceptions import ApplicationError
from temporalio.service import RPCError

from nexus.settings.cache.settings_cache import get_runtime_settings
from nexus.workflows.workflow_engine.models.workflow_definition import ActivityName
from nexus.workflows.workflow_engine.services.activity_sync_registry import get_activity_sync_service
from nexus.workflows.workflow_engine.utils.duration import compute_wait_seconds

logger = structlog.stdlib.get_logger(__name__)

_FIELD_LIMITS: dict[str, tuple[int, int | None]] = {
    "days": (0, None),
    "hours": (0, 23),
    "minutes": (0, 59),
    "seconds": (0, 59),
}


@activity.defn(name=ActivityName.WAIT)
async def wait(
    input_config: dict[str, Any],
    output_config: dict[str, str] | None,  # noqa: ARG001
) -> NoReturn:
    """Validate wait config then defer to async completion.

    Args:
        input_config: Wait node configuration with duration fields:
            - "days": int >= 0
            - "hours": int 0-23
            - "minutes": int 0-59
            - "seconds": int 0-59
        output_config: Output mapping configuration (unused; kept for dispatch signature)

    Raises:
        ApplicationError: If config validation fails (non-retryable).

    """
    for field_name, (min_val, max_val) in _FIELD_LIMITS.items():
        value = input_config.get(field_name, 0)
        if isinstance(value, bool) or not isinstance(value, int):
            msg = f"'{field_name}' must be a non-negative integer, got: {value!r}"
            raise ApplicationError(msg, type="ConfigError", non_retryable=True)
        if value < min_val:
            msg = f"'{field_name}' must be >= {min_val}, got: {value}"
            raise ApplicationError(msg, type="ConfigError", non_retryable=True)
        if max_val is not None and value > max_val:
            msg = f"'{field_name}' must be between {min_val} and {max_val}, got: {value}"
            raise ApplicationError(msg, type="ConfigError", non_retryable=True)

    total_seconds = compute_wait_seconds(input_config)

    if total_seconds <= 0:
        msg = "Total wait duration must be greater than zero"
        raise ApplicationError(msg, type="ConfigError", non_retryable=True)

    cache = get_runtime_settings()
    max_wait = await cache.get_int("workflow_engine.max_wait_duration_seconds")
    if total_seconds > max_wait:
        msg = f"Wait duration ({total_seconds}s) exceeds maximum allowed ({max_wait}s)"
        raise ApplicationError(msg, type="ConfigError", non_retryable=True)

    activity.raise_complete_async()


@activity.defn(name="__internal__complete_wait")
async def complete_wait(
    workflow_id: str,
    run_id: str | None,
    activity_id: str,
) -> dict[str, Any]:
    """Complete the async wait activity after workflow.sleep() finishes.

    Called as a local activity from the workflow. Retrieves the Temporal client
    via the activity sync service registry and completes the wait activity
    that is in STARTED state (via raise_complete_async).

    Args:
        workflow_id: Temporal workflow ID
        run_id: Temporal workflow run ID (or None)
        activity_id: The wait activity's node ID

    Returns:
        Completion result with status "completed"

    """
    result: dict[str, Any] = {"output": {"status": "completed"}}

    sync_service = get_activity_sync_service()
    if sync_service is None:
        msg = "Activity sync service not available; cannot complete async activity"
        logger.error(msg, activity_id=activity_id, workflow_id=workflow_id)
        raise ApplicationError(msg, type="InternalError", non_retryable=False)

    client = sync_service.temporal_client
    try:
        handle = client.get_async_activity_handle(
            workflow_id=workflow_id,
            run_id=run_id,
            activity_id=activity_id,
        )
        await handle.complete(result)
        logger.info(
            "Wait activity completed via async handle",
            activity_id=activity_id,
            workflow_id=workflow_id,
        )
    except RPCError as e:
        err_msg = str(e).lower()
        if "not found" in err_msg or "already completed" in err_msg or "cannot find" in err_msg:
            logger.info(
                "Wait activity already completed (idempotent)",
                activity_id=activity_id,
                workflow_id=workflow_id,
            )
        else:
            raise

    return result
