"""AAP Workflow Job Template activity executor.

Launches Ansible Automation Platform workflow job templates and polls for completion.
Reuses shared AAP utilities from aap_common.py.

"""

from __future__ import annotations

import time
from typing import Any, NoReturn

import httpx
import structlog
from temporalio import activity
from temporalio.exceptions import ApplicationError, CancelledError

from nexus.core.config.base import get_settings
from nexus.workflows.workflow_engine import constants
from nexus.workflows.workflow_engine.models import AAPWorkflowJobTemplateExecutorParameters
from nexus.workflows.workflow_engine.models.aap_types import AAPResourceType
from nexus.workflows.workflow_engine.models.workflow_definition import AAPWorkflowJobTemplateOutput

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


class AAPWorkflowJobExecutionError(AAPActivityExecutionError):
    """Raised when AAP workflow job template execution fails."""


# Mapping of config attribute → AAP launch body key.
# Only truthy values are included to skip None, empty lists, empty dicts, and 0/False.
_LAUNCH_BODY_FIELDS: list[tuple[str, str]] = [
    ("extra_vars", "extra_vars"),
    ("limit", "limit"),
    ("scm_branch", "scm_branch"),
    ("tags", "job_tags"),  # AAP expects "job_tags" not "tags"
    ("skip_tags", "skip_tags"),
    # Labels removed - need special resolution (name → ID + creation)
]


def _build_launch_body(
    config: AAPWorkflowJobTemplateExecutorParameters,
    inventory_id: int | None,
) -> dict[str, Any]:
    """Build request body for workflow job launch.

    Args:
        config: AAP workflow job template configuration (with already-resolved templates)
        inventory_id: Resolved inventory ID (from direct ID or name lookup)

    Returns:
        Request body dictionary with snake_case keys for AAP API

    """
    body: dict[str, Any] = {}
    if inventory_id is not None:
        body["inventory"] = inventory_id
    for config_attr, api_key in _LAUNCH_BODY_FIELDS:
        value = getattr(config, config_attr)
        # Use truthiness to skip None, [], {}, "", 0, False
        if value:
            body[api_key] = value
    return body


async def _resolve_workflow_job_template_id(
    client: httpx.AsyncClient,
    config: AAPWorkflowJobTemplateExecutorParameters,
    auth_headers: dict[str, str],
    basic_auth: httpx.BasicAuth | None,
    base_url: str,
) -> int:
    """Resolve workflow job template ID from config (ID takes precedence over name).

    Args:
        client: HTTP client
        config: AAP workflow job template configuration
        auth_headers: Authentication headers
        basic_auth: Basic authentication object
        base_url: Base URL for AAP controller

    Returns:
        Workflow job template ID

    Raises:
        AAPWorkflowJobExecutionError: If resolution fails

    """
    if config.workflow_job_template_id is not None:
        return config.workflow_job_template_id
    if config.workflow_job_template_name:
        return await lookup_resource_by_name(
            client,
            config.workflow_job_template_name,
            config.organization_name,  # type: ignore[arg-type]
            AAPResourceType.WORKFLOW_JOB_TEMPLATES,
            auth_headers,
            basic_auth,
            base_url,
            AAPWorkflowJobExecutionError,
        )
    msg = "Either workflow_job_template_id or workflow_job_template_name must be provided"
    raise AAPWorkflowJobExecutionError(msg)


async def _resolve_inventory_id(
    client: httpx.AsyncClient,
    config: AAPWorkflowJobTemplateExecutorParameters,
    auth_headers: dict[str, str],
    basic_auth: httpx.BasicAuth | None,
    base_url: str,
) -> int | None:
    """Resolve inventory ID from config (ID takes precedence over name).

    Args:
        client: HTTP client
        config: AAP workflow job template configuration
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
            AAPWorkflowJobExecutionError,
        )
    return None


def _get_template_reference_info(
    config: AAPWorkflowJobTemplateExecutorParameters, workflow_job_template_id: int
) -> str:
    """Build reference info string for logging/errors (ID or name+org)."""
    if config.workflow_job_template_id is not None:
        return f"ID {workflow_job_template_id}"
    return f"'{config.workflow_job_template_name}' in org '{config.organization_name}'"


def _log_launch_success(
    config: AAPWorkflowJobTemplateExecutorParameters, workflow_job_template_id: int, job_id: int
) -> None:
    """Log successful workflow job template launch (by ID or by name)."""
    if config.workflow_job_template_id is not None:
        logger.info(
            "Launched AAP workflow job template by ID", workflow_job_template_id=workflow_job_template_id, job_id=job_id
        )
    else:
        logger.info(
            "Launched workflow job template by name",
            workflow_job_template_name=config.workflow_job_template_name,
            organization_name=config.organization_name,
            workflow_job_template_id=workflow_job_template_id,
            job_id=job_id,
        )


def _handle_http_status_error(
    e: httpx.HTTPStatusError,
    config: AAPWorkflowJobTemplateExecutorParameters,
    workflow_job_template_id: int,
    body: dict[str, Any],
) -> NoReturn:
    """Handle HTTP status errors during workflow job launch.

    SECURITY: Does not log AAP response body to prevent leaking sensitive error details
    (credentials, internal paths, configuration values, etc.).
    """
    ref_info = _get_template_reference_info(config, workflow_job_template_id)
    msg = f"Failed to launch workflow job template {ref_info}: HTTP {e.response.status_code}"
    safe_body_keys = [k for k in body if k not in ("extra_vars", "credentials")]
    logger.exception(
        "Workflow job template launch failed",
        workflow_job_template_id=workflow_job_template_id,
        status_code=e.response.status_code,
        launch_body_keys=safe_body_keys,
    )
    raise AAPWorkflowJobExecutionError(
        msg, status=None, retryable=is_retryable_http_status(e.response.status_code)
    ) from e


async def _launch_aap_workflow_job(
    client: httpx.AsyncClient,
    config: AAPWorkflowJobTemplateExecutorParameters,
    auth_headers: dict[str, str],
    basic_auth: httpx.BasicAuth | None,
    base_url: str,
) -> int:
    """Launch AAP workflow job template.

    Args:
        client: HTTP client
        config: AAP workflow job template configuration
        auth_headers: Authentication headers
        basic_auth: Basic authentication object
        base_url: Base URL for AAP controller

    Returns:
        Workflow job ID

    Raises:
        AAPWorkflowJobExecutionError: If launch fails

    """
    workflow_job_template_id = await _resolve_workflow_job_template_id(
        client, config, auth_headers, basic_auth, base_url
    )
    inventory_id = await _resolve_inventory_id(client, config, auth_headers, basic_auth, base_url)

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
            AAPWorkflowJobExecutionError,
        )
        logger.info("Resolved label names to IDs", label_names=config.labels, label_ids=label_ids)

    # Build launch body with resolved IDs
    body = _build_launch_body(config, inventory_id)
    if label_ids:
        body["labels"] = label_ids

    logger.debug(
        "Launching workflow job template with body", workflow_job_template_id=workflow_job_template_id, launch_body=body
    )

    launch_url = f"{base_url}/api/controller/v2/workflow_job_templates/{workflow_job_template_id}/launch/"
    auth_param = basic_auth or httpx.USE_CLIENT_DEFAULT

    try:
        response = await client.post(launch_url, json=body, headers=auth_headers, auth=auth_param)
        response.raise_for_status()
        launch_data: dict[str, Any] = response.json()
        job_id = int(launch_data["id"])
        _log_launch_success(config, workflow_job_template_id, job_id)
        return job_id
    except httpx.HTTPStatusError as e:
        _handle_http_status_error(e, config, workflow_job_template_id, body)
    except httpx.ConnectError as e:
        msg = f"Failed to connect to AAP: {e}"
        raise ApplicationError(msg, non_retryable=True) from e
    except httpx.HTTPError as e:
        msg = f"Failed to connect to AAP: {e}"
        raise AAPWorkflowJobExecutionError(msg) from e


@activity.defn
async def execute_aap_workflow_job_template_activity(
    input_config: dict[str, Any],
    output_config: dict[str, str] | None,
) -> dict[str, Any]:
    """Execute AAP workflow job template activity for v2 workflows.

    Follows v2 activity pattern (same as script and HTTP activities):
    1. Validate config using Pydantic (templates already resolved by dispatcher)
    2. Launch workflow job via AAP REST API
    3. Poll workflow job status until completion
    4. Send heartbeats during polling (Temporal best practice)
    5. Handle cancellation (cancel AAP workflow job if activity cancelled)
    6. Apply output mapping and return normalized result

    Args:
        input_config: Resolved node configuration (templates already resolved by dispatcher).
                      Expected keys: workflow_job_template_id or workflow_job_template_name, plus optional
                      inventory, extra_vars, limit, scm_branch, tags, skip_tags, labels, timeout,
                      credential_id, _resolved_credentials.
        output_config: Output mapping configuration (field_name -> template expression)
                       None = return full result, {} = suppress all, {...} = extract specific fields

    Returns:
        {
            "output": {
                "status": "completed",
                "workflow_job_id": 123,
                "workflow_job_status": "successful",
                ...
            }
        }

    """
    logger.info("Starting AAP workflow job template activity")

    try:
        config = AAPWorkflowJobTemplateExecutorParameters.model_validate(input_config)
    except Exception as e:  # noqa: BLE001
        # Log full details internally; omit values from user-facing message (may contain credentials)
        logger.warning("AAP workflow job template config validation failed", error=str(e))
        msg = "Invalid configuration — check AAP workflow job template activity settings"
        raise ApplicationError(msg, type="ConfigError", non_retryable=True) from None

    settings = get_settings()

    resolved_auth = resolve_aap_auth(input_config, settings)
    base_url = resolved_auth.base_url
    auth_headers = resolved_auth.auth_headers
    basic_auth = resolved_auth.basic_auth
    verify_ssl = resolved_auth.verify_ssl

    if not base_url:
        msg = "AAP host not configured. Attach an AAP credential."
        raise ApplicationError(msg, type="ConfigError", non_retryable=True) from None

    start_time = time.time()
    job_id = None
    workflow_job_url = None

    try:
        # Increase timeout for AAP connections (default 5s can be too short for remote AAP servers)
        timeout = httpx.Timeout(30.0, connect=10.0)
        async with httpx.AsyncClient(
            verify=verify_ssl,
            timeout=timeout,
        ) as client:
            job_id = await _launch_aap_workflow_job(client, config, auth_headers, basic_auth, base_url)
            workflow_job_url = build_aap_job_url(base_url, job_id, "workflow")
            partial_output: dict[str, Any] = {"workflow_job_id": job_id, "workflow_job_url": workflow_job_url}

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
                "workflow_jobs",
                AAP_JOB_TERMINAL_STATUSES,
                AAPWorkflowJobExecutionError,
                partial_output=partial_output,
            )

            final_status = job_data["status"]
            output = AAPWorkflowJobTemplateOutput(
                workflow_job_id=job_id,
                workflow_job_url=workflow_job_url,
                workflow_job_status=final_status,
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
                msg = f"AAP workflow job {job_id} failed with status: {final_status}"
                raise ApplicationError(  # noqa: TRY301
                    msg, {"output": output.dump(output_config)}, type="AAPWorkflowJobExecutionError", non_retryable=True
                )

            return {"output": output.dump(output_config)}

    except (ApplicationError, CancelledError):
        raise
    except AAPActivityExecutionError as e:
        output = AAPWorkflowJobTemplateOutput(
            workflow_job_id=e.job_id, workflow_job_url=workflow_job_url, workflow_job_status=e.status
        )
        raise ApplicationError(
            str(e),
            {"output": output.dump(output_config)},
            type="AAPWorkflowJobExecutionError",
            non_retryable=not e.retryable,
        ) from e
    except Exception as e:
        logger.exception("Unexpected error in AAP workflow job template activity", job_id=job_id)
        output = AAPWorkflowJobTemplateOutput(workflow_job_id=job_id, workflow_job_url=workflow_job_url)
        msg = f"Unexpected error executing AAP workflow job template (job_id={job_id})"
        raise ApplicationError(
            msg, {"output": output.dump(output_config)}, type=type(e).__name__, non_retryable=True
        ) from None
