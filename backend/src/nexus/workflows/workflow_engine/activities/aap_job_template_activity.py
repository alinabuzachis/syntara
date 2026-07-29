"""AAP Job Template activity executor.

Launches Ansible Automation Platform job templates and polls for completion.
Reuses httpx patterns from api_activity.py with AAP-specific polling logic.

"""

from __future__ import annotations

import time
from typing import Any, NoReturn

import httpx
import structlog
from temporalio import activity
from temporalio.exceptions import ApplicationError, CancelledError

from nexus.core.config.base import get_settings
from nexus.core.lib.tls_utils import build_integration_httpx_verify
from nexus.workflows.workflow_engine import constants
from nexus.workflows.workflow_engine.models import AAPJobTemplateExecutorParameters
from nexus.workflows.workflow_engine.models.aap_types import AAPResourceType
from nexus.workflows.workflow_engine.models.workflow_definition import AAPJobTemplateOutput

from .aap_common import (
    AAP_JOB_TERMINAL_STATUSES,
    AAPActivityExecutionError,
    AAPJobTerminalStatus,
    build_aap_job_url,
    lookup_resource_by_name,
    poll_until_complete,
    resolve_aap_auth,
    resolve_label_ids,
)
from .common import HEARTBEAT_PARTIAL_OUTPUT_KEY, HEARTBEAT_STOP_MONITOR, is_retryable_http_status

logger = structlog.stdlib.get_logger(__name__)


class AAPJobExecutionError(AAPActivityExecutionError):
    """Raised when AAP job template execution fails."""


# Mapping of config attribute → AAP launch body key.
# Only truthy values are included to skip None, empty lists, empty dicts, and 0/False.
# Exception: verbosity=0 is meaningful (NORMAL level), so we check is not None for it.
_LAUNCH_BODY_FIELDS: list[tuple[str, str]] = [
    ("job_credentials", "credentials"),
    ("extra_vars", "extra_vars"),
    ("limit", "limit"),
    ("tags", "job_tags"),  # AAP expects "job_tags" not "tags"
    ("skip_tags", "skip_tags"),
    ("verbosity", "verbosity"),
    ("job_type", "job_type"),
    ("forks", "forks"),
    ("job_slicing", "job_slice_count"),  # AAP expects "job_slice_count"
    ("diff_mode", "diff_mode"),
    # Labels removed - need special resolution (name → ID + creation)
]


def _build_launch_body(
    config: AAPJobTemplateExecutorParameters,
    inventory_id: int | None,
    instance_group_id: int | None = None,
) -> dict[str, Any]:
    """Build request body for job launch.

    Args:
        config: AAP job template configuration (with already-resolved templates)
        inventory_id: Resolved inventory ID (from direct ID or name lookup)
        instance_group_id: Resolved instance group ID (if provided)

    Returns:
        Request body dictionary with snake_case keys for AAP API

    """
    body: dict[str, Any] = {}
    if inventory_id is not None:
        body["inventory"] = inventory_id
    if instance_group_id is not None:
        # AAP expects instance_groups as array of IDs
        body["instance_groups"] = [instance_group_id]
    for config_attr, api_key in _LAUNCH_BODY_FIELDS:
        value = getattr(config, config_attr)
        # For verbosity, 0 is valid (NORMAL level), so check is not None
        # For all other fields, use truthiness to skip None, [], {}, "", 0, False
        if config_attr == "verbosity":
            if value is not None:
                body[api_key] = value
        elif value:  # Truthy check: skips None, [], {}, "", 0, False
            body[api_key] = value
    return body


async def _resolve_job_template_id(
    client: httpx.AsyncClient,
    config: AAPJobTemplateExecutorParameters,
    auth_headers: dict[str, str],
    basic_auth: httpx.BasicAuth | None,
    base_url: str,
) -> int:
    """Resolve job template ID from config (ID takes precedence over name).

    Args:
        client: HTTP client
        config: AAP job template configuration
        auth_headers: Authentication headers
        basic_auth: Basic authentication object
        base_url: Base URL for AAP controller

    Returns:
        Job template ID

    Raises:
        AAPJobExecutionError: If resolution fails

    """
    if config.job_template_id is not None:
        return config.job_template_id
    if config.job_template_name:
        return await lookup_resource_by_name(
            client,
            config.job_template_name,
            config.organization_name,  # type: ignore[arg-type]
            AAPResourceType.JOB_TEMPLATES,
            auth_headers,
            basic_auth,
            base_url,
            error_class=AAPJobExecutionError,
        )
    msg = "Either job_template_id or job_template_name must be provided"
    raise AAPJobExecutionError(msg)


async def _resolve_inventory_id(
    client: httpx.AsyncClient,
    config: AAPJobTemplateExecutorParameters,
    auth_headers: dict[str, str],
    basic_auth: httpx.BasicAuth | None,
    base_url: str,
) -> int | None:
    """Resolve inventory ID from config (ID takes precedence over name).

    Args:
        client: HTTP client
        config: AAP job template configuration
        auth_headers: Authentication headers
        basic_auth: Basic authentication object
        base_url: Base URL for AAP controller

    Returns:
        Inventory ID or None if no override specified

    """
    if config.inventory_id is not None:
        return config.inventory_id
    if config.inventory_name:
        return await lookup_resource_by_name(
            client,
            config.inventory_name,
            config.organization_name,  # type: ignore[arg-type]
            AAPResourceType.INVENTORIES,
            auth_headers,
            basic_auth,
            base_url,
            error_class=AAPJobExecutionError,
        )
    return None


async def _resolve_instance_group_id(
    client: httpx.AsyncClient,
    config: AAPJobTemplateExecutorParameters,
    auth_headers: dict[str, str],
    basic_auth: httpx.BasicAuth | None,
    base_url: str,
) -> int | None:
    """Resolve instance group ID from config (ID takes precedence over name).

    Args:
        client: HTTP client
        config: AAP job template configuration
        auth_headers: Authentication headers
        basic_auth: Basic authentication object
        base_url: Base URL for AAP controller

    Returns:
        Instance group ID or None if no override specified

    """
    if config.instance_group_id is not None:
        logger.info("Using instance group ID directly", instance_group_id=config.instance_group_id)
        return config.instance_group_id
    if config.instance_group_name:
        instance_group_id = await lookup_resource_by_name(
            client,
            config.instance_group_name,
            config.organization_name,  # type: ignore[arg-type]
            AAPResourceType.INSTANCE_GROUPS,
            auth_headers,
            basic_auth,
            base_url,
            error_class=AAPJobExecutionError,
        )
        logger.info(
            "Resolved instance group name to ID",
            instance_group_name=config.instance_group_name,
            instance_group_id=instance_group_id,
        )
        return instance_group_id
    return None


def _get_template_reference_info(config: AAPJobTemplateExecutorParameters, job_template_id: int) -> str:
    """Build reference info string for logging/errors (ID or name+org)."""
    if config.job_template_id is not None:
        return f"ID {job_template_id}"
    return f"'{config.job_template_name}' in org '{config.organization_name}'"


def _log_launch_success(config: AAPJobTemplateExecutorParameters, job_template_id: int, job_id: int) -> None:
    """Log successful job template launch (by ID or by name)."""
    if config.job_template_id is not None:
        logger.info("Launched AAP job template by ID", job_template_id=job_template_id, job_id=job_id)
    else:
        logger.info(
            "Launched job template by name",
            job_template_name=config.job_template_name,
            organization_name=config.organization_name,
            job_template_id=job_template_id,
            job_id=job_id,
        )


def _handle_http_status_error(
    e: httpx.HTTPStatusError,
    config: AAPJobTemplateExecutorParameters,
    job_template_id: int,
    body: dict[str, Any],
) -> NoReturn:
    """Handle HTTP status errors during job launch.

    SECURITY: Does not log AAP response body to prevent leaking sensitive error details
    (credentials, internal paths, configuration values, etc.).
    """
    ref_info = _get_template_reference_info(config, job_template_id)
    msg = f"Failed to launch job template {ref_info}: HTTP {e.response.status_code}"
    safe_body_keys = [k for k in body if k not in ("extra_vars", "credentials")]
    logger.exception(
        "Job template launch failed",
        job_template_id=job_template_id,
        status_code=e.response.status_code,
        launch_body_keys=safe_body_keys,
    )
    raise AAPJobExecutionError(msg, status=None, retryable=is_retryable_http_status(e.response.status_code)) from e


async def _launch_aap_job(
    client: httpx.AsyncClient,
    config: AAPJobTemplateExecutorParameters,
    auth_headers: dict[str, str],
    basic_auth: httpx.BasicAuth | None,
    base_url: str,
) -> int:
    """Launch AAP job template.

    Args:
        client: HTTP client
        config: AAP job template configuration
        auth_headers: Authentication headers
        basic_auth: Basic authentication object
        base_url: Base URL for AAP controller

    Returns:
        Job ID

    Raises:
        AAPJobExecutionError: If launch fails

    """
    job_template_id = await _resolve_job_template_id(client, config, auth_headers, basic_auth, base_url)
    inventory_id = await _resolve_inventory_id(client, config, auth_headers, basic_auth, base_url)
    instance_group_id = await _resolve_instance_group_id(client, config, auth_headers, basic_auth, base_url)

    # Resolve labels to IDs if provided (creates new labels if needed)
    label_ids: list[int] | None = None
    if config.labels:
        label_ids = await resolve_label_ids(
            client,
            config.labels,
            config.organization_name,
            config.organization_id,
            auth_headers,
            basic_auth,
            base_url,
            error_class=AAPJobExecutionError,
        )
        logger.info("Resolved label names to IDs", label_names=config.labels, label_ids=label_ids)

    # Build launch body with resolved IDs
    body = _build_launch_body(config, inventory_id, instance_group_id)
    if label_ids:
        body["labels"] = label_ids

    logger.debug("Launching job template with body", job_template_id=job_template_id, launch_body=body)

    launch_url = f"{base_url}/api/controller/v2/job_templates/{job_template_id}/launch/"
    auth_param = basic_auth or httpx.USE_CLIENT_DEFAULT

    try:
        response = await client.post(launch_url, json=body, headers=auth_headers, auth=auth_param)
        response.raise_for_status()
        launch_data: dict[str, Any] = response.json()
        job_id = int(launch_data["id"])
        _log_launch_success(config, job_template_id, job_id)
        return job_id
    except httpx.HTTPStatusError as e:
        _handle_http_status_error(e, config, job_template_id, body)
    except httpx.ConnectError as e:
        msg = f"Failed to connect to AAP: {e}"
        raise ApplicationError(msg, non_retryable=True) from e
    except httpx.HTTPError as e:
        msg = f"Failed to connect to AAP: {e}"
        raise AAPJobExecutionError(msg) from e


def _is_terminal_status(status: Any) -> bool:  # noqa: ANN401
    """Check if job status is terminal.

    Args:
        status: Job status value

    Returns:
        True if status is terminal, False otherwise

    """
    return isinstance(status, str) and status.lower() in AAP_JOB_TERMINAL_STATUSES


def _log_terminal_status(job_id: int, status: str, job_data: dict[str, Any]) -> None:
    """Log terminal job status with failure details if applicable.

    Args:
        job_id: AAP job ID
        status: Job status string
        job_data: Full job data dictionary

    """
    logger.info("Job reached terminal status", job_id=job_id, status=status)
    if status.lower() in {AAPJobTerminalStatus.FAILED.lower(), AAPJobTerminalStatus.ERROR.lower()}:
        logger.error(
            "Job failed with status",
            job_id=job_id,
            status=status,
            result_traceback=job_data.get("result_traceback", "N/A"),
        )


@activity.defn
async def execute_aap_job_template_activity(
    input_config: dict[str, Any],
    output_config: dict[str, str] | None,
) -> dict[str, Any]:
    """Execute AAP job template activity for v2 workflows.

    Follows v2 activity pattern (same as script and HTTP activities):
    1. Validate config using Pydantic (templates already resolved by dispatcher)
    2. Launch job via AAP REST API
    3. Poll job status until completion
    4. Send heartbeats during polling (Temporal best practice)
    5. Handle cancellation (cancel AAP job if activity cancelled)
    6. Apply output mapping and return normalized result

    Args:
        input_config: Resolved node configuration (templates already resolved by dispatcher).
                      Expected keys: job_template_id or job_template_name, plus optional
                      inventory, extra_vars, credentials, limit, tags, skip_tags, verbosity,
                      timeout, credential_id, _resolved_credentials.
        output_config: Output mapping configuration (field_name -> template expression)
                       None = return full result, {} = suppress all, {...} = extract specific fields

    Returns:
        {
            "output": {
                "status": "completed",
                "job_id": 123,
                "job_status": "successful",
                ...
            }
        }

    """
    logger.info("Starting AAP job template activity")

    try:
        config = AAPJobTemplateExecutorParameters.model_validate(input_config)
    except Exception as e:  # noqa: BLE001
        # Log full details internally; omit values from user-facing message (may contain credentials)
        logger.warning("AAP config validation failed", error=str(e))
        msg = "Invalid configuration — check AAP job template activity settings"
        raise ApplicationError(msg, type="ConfigError", non_retryable=True) from None

    settings = get_settings()

    resolved_auth = resolve_aap_auth(input_config, settings)
    base_url = resolved_auth.base_url
    auth_headers = resolved_auth.auth_headers
    basic_auth = resolved_auth.basic_auth
    verify = build_integration_httpx_verify(
        insecure_skip_tls_verify=not resolved_auth.verify_ssl,
        ca_certificate=resolved_auth.ca_certificate,
    )

    if not base_url:
        msg = "AAP host not configured. Attach an AAP credential."
        raise ApplicationError(msg, type="ConfigError", non_retryable=True) from None

    start_time = time.time()
    job_id = None
    job_url = None

    try:
        # Increase timeout for AAP connections (default 5s can be too short for remote AAP servers)
        timeout = httpx.Timeout(30.0, connect=10.0)
        async with httpx.AsyncClient(
            verify=verify,
            timeout=timeout,
        ) as client:
            job_id = await _launch_aap_job(client, config, auth_headers, basic_auth, base_url)
            job_url = build_aap_job_url(base_url, job_id, "playbook")
            partial_output: dict[str, Any] = {"job_id": job_id, "job_url": job_url}

            activity.heartbeat(
                {
                    HEARTBEAT_STOP_MONITOR: True,
                    HEARTBEAT_PARTIAL_OUTPUT_KEY: partial_output,
                }
            )

            aap_timeout = int(input_config.get(constants.ENGINE_TIMEOUT_SECONDS_KEY, 3600))
            job_data = await poll_until_complete(
                client,
                settings,
                job_id,
                auth_headers,
                basic_auth,
                base_url,
                aap_timeout,
                start_time,
                job_type="jobs",  # Plural: AAP API expects /api/controller/v2/jobs/{id}/cancel/
                terminal_statuses=AAP_JOB_TERMINAL_STATUSES,
                error_class=AAPJobExecutionError,
                partial_output=partial_output,
            )

            final_status = job_data["status"]
            output = AAPJobTemplateOutput(
                job_id=job_id,
                job_url=job_url,
                job_status=final_status,
                artifacts=job_data.get("artifacts", {}),
                created=job_data.get("created", ""),
                started=job_data.get("started", ""),
                finished=job_data.get("finished", ""),
            )
            if isinstance(final_status, str) and final_status.lower() in {
                AAPJobTerminalStatus.FAILED.lower(),
                AAPJobTerminalStatus.ERROR.lower(),
                AAPJobTerminalStatus.CANCELED.lower(),
            }:
                msg = f"AAP job {job_id} failed with status: {final_status}"
                raise ApplicationError(  # noqa: TRY301
                    msg, {"output": output.dump(output_config)}, type="AAPJobExecutionError", non_retryable=True
                )

            return {"output": output.dump(output_config)}

    except (ApplicationError, CancelledError):
        raise
    except AAPActivityExecutionError as e:
        output = AAPJobTemplateOutput(job_id=e.job_id, job_url=job_url, job_status=e.status)
        raise ApplicationError(
            str(e), {"output": output.dump(output_config)}, type="AAPJobExecutionError", non_retryable=not e.retryable
        ) from e
    except Exception as e:
        logger.exception("Unexpected error in AAP activity", job_id=job_id)
        output = AAPJobTemplateOutput(job_id=job_id, job_url=job_url)
        msg = f"Unexpected error executing AAP job template (job_id={job_id})"
        raise ApplicationError(
            msg, {"output": output.dump(output_config)}, type=type(e).__name__, non_retryable=True
        ) from None
