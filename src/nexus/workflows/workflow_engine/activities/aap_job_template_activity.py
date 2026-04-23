"""AAP Job Template activity executor.

Launches Ansible Automation Platform job templates and polls for completion.
Reuses httpx patterns from api_activity.py with AAP-specific polling logic.

"""

from __future__ import annotations

import asyncio
import time
from enum import StrEnum
from http import HTTPStatus
from typing import TYPE_CHECKING, Any

import httpx
import structlog
from temporalio import activity
from temporalio.exceptions import ApplicationError, CancelledError

from nexus.core.config.base import Settings, get_settings
from nexus.workflows.workflow_engine.models import AAPJobTemplateExecutorConfig
from nexus.workflows.workflow_engine.models.aap_types import AAPResourceType
from nexus.workflows.workflow_engine.utils.credential_scrubber import ensure_resolved_credentials_dict

from .common import ActivityExecutionError

if TYPE_CHECKING:
    from httpx._client import UseClientDefault

logger = structlog.stdlib.get_logger(__name__)


class JobStatus(StrEnum):
    """AAP job terminal statuses."""

    SUCCESSFUL = "successful"
    FAILED = "failed"
    ERROR = "error"
    CANCELED = "canceled"


# Set of terminal statuses for efficient lookup (lowercase)
TERMINAL_STATUSES = {status.lower() for status in JobStatus}


async def _lookup_resource_by_name(
    client: httpx.AsyncClient,
    resource_name: str,
    organization_name: str,
    resource_type: AAPResourceType,
    auth_headers: dict[str, str],
    basic_auth: httpx.BasicAuth | None,
    base_url: str,
) -> int:
    """Lookup AAP resource ID by name and organization.

    Args:
        client: HTTP client
        resource_name: Name of the resource (job template or inventory)
        organization_name: Name of organization
        resource_type: Type of resource (AAPResourceType.JOB_TEMPLATES or AAPResourceType.INVENTORIES)
        auth_headers: Authentication headers
        basic_auth: Basic authentication object
        base_url: Base URL for AAP controller

    Returns:
        Resource ID

    Raises:
        AAPJobExecutionError: If resource not found or multiple resources found

    """
    auth_param = basic_auth or httpx.USE_CLIENT_DEFAULT

    # Query AAP API for resources by name and organization
    lookup_url = f"{base_url}/api/controller/v2/{resource_type.value}/"
    params = {
        "name": resource_name,
        "organization__name": organization_name,
    }

    # Get display name from enum for error messages
    display_name = resource_type.display_name

    try:
        response = await client.get(lookup_url, params=params, headers=auth_headers, auth=auth_param)
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        results: list[dict[str, Any]] = data.get("results", [])

        # Validate exactly one result
        if len(results) == 0:
            msg = f"{display_name.capitalize()} '{resource_name}' not found in organization '{organization_name}'"
            raise AAPJobExecutionError(msg, status=None)

        if len(results) > 1:
            msg = (
                f"Multiple {resource_type.display_name_plural} named '{resource_name}' "
                f"found in organization '{organization_name}'"
            )
            raise AAPJobExecutionError(msg, status=None)

        # Return the resource ID
        resource_id = int(results[0]["id"])
        logger.info(
            "Resolved %s to ID",
            display_name,
            resource_name=resource_name,
            organization_name=organization_name,
            resource_id=resource_id,
        )
        return resource_id

    except httpx.HTTPStatusError as e:
        msg = (
            f"Failed to lookup {display_name} '{resource_name}' in org '{organization_name}': "
            f"HTTP {e.response.status_code}"
        )
        raise AAPJobExecutionError(msg, status=None) from e
    except httpx.ConnectError as e:
        msg = f"Failed to connect to AAP for {display_name} lookup: {e}"
        raise ApplicationError(msg, non_retryable=True) from e
    except httpx.HTTPError as e:
        msg = f"Failed to connect to AAP for {display_name} lookup: {e}"
        raise AAPJobExecutionError(msg) from e


class AAPJobExecutionError(ActivityExecutionError):
    """Raised when AAP job template execution fails."""

    def __init__(
        self,
        message: str,
        job_id: int | None = None,
        status: str | None = None,
        output: str | None = None,
    ) -> None:
        """Initialize AAP job execution error.

        Args:
            message: Error message
            job_id: AAP job ID (if available)
            status: Job status (if available)
            output: Job output/logs (if available)

        """
        super().__init__(message)
        self.job_id = job_id
        self.status = status
        self.output = output


def _get_aap_auth_headers(settings: Settings) -> dict[str, str]:
    """Get AAP authentication headers (token preferred).

    Args:
        settings: Application settings

    Returns:
        Dictionary of auth headers for token auth, or empty dict for basic auth

    Raises:
        AAPJobExecutionError: If no authentication configured

    """
    # NOTE: Change to get settings from AAP Tool integration once it is implemented.
    if settings.aap_token:
        # Token authentication (preferred)
        return {"Authorization": f"Bearer {settings.aap_token.get_secret_value()}"}
    if settings.aap_username and settings.aap_password:
        # Basic authentication will be handled via auth parameter
        return {}
    msg = "AAP authentication not configured. Set APP_AAP_TOKEN or APP_AAP_USERNAME/PASSWORD"
    raise AAPJobExecutionError(msg)


def _get_aap_basic_auth(settings: Settings) -> httpx.BasicAuth | None:
    """Get AAP basic authentication object.

    Args:
        settings: Application settings

    Returns:
        BasicAuth object if using basic auth, None otherwise

    """
    if settings.aap_username and settings.aap_password and not settings.aap_token:
        return httpx.BasicAuth(settings.aap_username, settings.aap_password.get_secret_value())
    return None


def _get_aap_auth_from_credentials(
    resolved_creds: dict[str, Any],
) -> tuple[dict[str, str], httpx.BasicAuth | None, str | None]:
    """Extract AAP auth headers and host override from resolved Nexus credentials.

    Args:
        resolved_creds: Resolved credential data with extra_vars from InjectorResolver.

    Returns:
        Tuple of (auth_headers, basic_auth, host_override).
        host_override is None if credential doesn't specify aap_host.

    """
    extra_vars = resolved_creds.get("extra_vars", {})
    host = extra_vars.get("aap_host")
    host_override = host.rstrip("/") if host else None

    token = extra_vars.get("aap_oauth_token", "")
    if token:
        return {"Authorization": f"Bearer {token}"}, None, host_override

    username = extra_vars.get("aap_username", "")
    password = extra_vars.get("aap_password", "")
    if username:
        return {}, httpx.BasicAuth(username, password), host_override

    logger.warning(
        "AAP credential resolved but contains no auth fields (oauth_token or username). "
        "Verify the correct credential type is linked to this activity."
    )
    return {}, None, host_override


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
]


def _build_launch_body(config: AAPJobTemplateExecutorConfig, inventory_id: int | None) -> dict[str, Any]:
    """Build request body for job launch.

    Args:
        config: AAP job template configuration (with already-resolved templates)
        inventory_id: Resolved inventory ID (from direct ID or name lookup)

    Returns:
        Request body dictionary with snake_case keys for AAP API

    """
    body: dict[str, Any] = {}
    if inventory_id is not None:
        body["inventory"] = inventory_id
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


async def _launch_aap_job(  # noqa: PLR0912
    client: httpx.AsyncClient,
    config: AAPJobTemplateExecutorConfig,
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
    # Resolve job template ID - ID takes precedence over name if both provided
    if config.job_template_id is not None:
        # Use numeric ID directly (takes precedence per schema)
        job_template_id = config.job_template_id
    elif config.job_template_name:
        # Lookup job template by name and organization
        job_template_id = await _lookup_resource_by_name(
            client,
            config.job_template_name,
            # we ignore arg-type because Pydantic ensures this is not None if name is provided
            config.organization_name,  # type: ignore[arg-type]
            AAPResourceType.JOB_TEMPLATES,
            auth_headers,
            basic_auth,
            base_url,
        )
    else:
        # Should never reach here due to model validation
        msg = "Either job_template_id or job_template_name must be provided"
        raise AAPJobExecutionError(msg)

    # Resolve inventory ID - ID takes precedence over name if both provided
    if config.inventory_id is not None:
        # Use inventory ID directly (takes precedence per schema)
        inventory_id: int | None = config.inventory_id
    elif config.inventory_name:
        # Lookup inventory by name and organization
        inventory_id = await _lookup_resource_by_name(
            client,
            config.inventory_name,
            # we ignore arg-type because Pydantic ensures this is not None if name is provided
            config.organization_name,  # type: ignore[arg-type]
            AAPResourceType.INVENTORIES,
            auth_headers,
            basic_auth,
            base_url,
        )
    else:
        # No inventory override specified - will use job template's default
        inventory_id = None

    # Build launch body with single source of truth for inventory_id
    body = _build_launch_body(config, inventory_id)

    # Log the launch body for debugging
    logger.debug(
        "Launching job template with body",
        job_template_id=job_template_id,
        launch_body=body,
    )

    launch_url = f"{base_url}/api/controller/v2/job_templates/{job_template_id}/launch/"

    auth_param = basic_auth or httpx.USE_CLIENT_DEFAULT

    try:
        response = await client.post(launch_url, json=body, headers=auth_headers, auth=auth_param)
        response.raise_for_status()
        launch_data: dict[str, Any] = response.json()
        job_id = int(launch_data["id"])

        # Log based on which reference method was actually used
        if config.job_template_id is not None:
            # Was resolved via ID
            logger.info("Launched AAP job template by ID", job_template_id=job_template_id, job_id=job_id)
        else:
            # Was resolved via name lookup
            logger.info(
                "Launched job template by name",
                job_template_name=config.job_template_name,
                organization_name=config.organization_name,
                job_template_id=job_template_id,
                job_id=job_id,
            )

        return job_id
    except httpx.HTTPStatusError as e:
        # Build reference info for error message based on which method was used
        if config.job_template_id is not None:
            ref_info = f"ID {job_template_id}"
        else:
            ref_info = f"'{config.job_template_name}' in org '{config.organization_name}'"
        msg = f"Failed to launch job template {ref_info}: HTTP {e.response.status_code}"
        raise AAPJobExecutionError(msg, status=None) from e
    except httpx.ConnectError as e:
        msg = f"Failed to connect to AAP: {e}"
        raise ApplicationError(msg, non_retryable=True) from e
    except httpx.HTTPError as e:
        msg = f"Failed to connect to AAP: {e}"
        raise AAPJobExecutionError(msg) from e


def _check_timeout(elapsed: float, timeout_seconds: int, job_id: int) -> None:
    """Check if job execution has exceeded timeout.

    Args:
        elapsed: Elapsed time in seconds
        timeout_seconds: Timeout threshold in seconds
        job_id: AAP job ID

    Raises:
        AAPJobExecutionError: If timeout exceeded

    """
    if elapsed >= timeout_seconds:
        msg = f"Job {job_id} timed out after {timeout_seconds} seconds"
        raise AAPJobExecutionError(msg, job_id=job_id)


async def _handle_cancellation(
    client: httpx.AsyncClient,
    job_id: int,
    auth_headers: dict[str, str],
    auth_param: httpx.BasicAuth | UseClientDefault,
    base_url: str,
) -> None:
    """Handle activity cancellation by cancelling AAP job.

    Args:
        client: HTTP client
        job_id: AAP job ID
        auth_headers: Authentication headers
        auth_param: Authentication parameter for request
        base_url: Base URL for AAP controller

    Raises:
        CancelledError: Always raised after attempting to cancel job

    """
    if activity.is_cancelled():
        logger.warning("Activity cancelled, cancelling AAP job", job_id=job_id)
        cancel_url = f"{base_url}/api/controller/v2/jobs/{job_id}/cancel/"
        try:
            await client.post(cancel_url, headers=auth_headers, auth=auth_param)
        except httpx.HTTPError:
            logger.exception("Failed to cancel AAP job", job_id=job_id)
        msg = "Activity cancelled, AAP job cancelled"
        raise CancelledError(msg)


async def _fetch_job_status(
    client: httpx.AsyncClient,
    status_url: str,
    auth_headers: dict[str, str],
    auth_param: httpx.BasicAuth | UseClientDefault,
    job_id: int,
) -> dict[str, Any]:
    """Fetch current job status from AAP.

    Args:
        client: HTTP client
        status_url: URL to fetch job status
        auth_headers: Authentication headers
        auth_param: Authentication parameter for request
        job_id: AAP job ID

    Returns:
        Job data dictionary

    Raises:
        AAPJobExecutionError: If status fetch fails

    """
    try:
        status_response = await client.get(status_url, headers=auth_headers, auth=auth_param)
        status_response.raise_for_status()
        job_data: dict[str, Any] = status_response.json()
        return job_data
    except httpx.HTTPError as e:
        msg = f"Failed to poll job {job_id} status: {e}"
        raise AAPJobExecutionError(msg, job_id=job_id) from e


def _is_terminal_status(status: Any) -> bool:  # noqa: ANN401
    """Check if job status is terminal.

    Args:
        status: Job status value

    Returns:
        True if status is terminal, False otherwise

    """
    return isinstance(status, str) and status.lower() in TERMINAL_STATUSES


def _log_terminal_status(job_id: int, status: str, job_data: dict[str, Any]) -> None:
    """Log terminal job status with failure details if applicable.

    Args:
        job_id: AAP job ID
        status: Job status string
        job_data: Full job data dictionary

    """
    logger.info("Job reached terminal status", job_id=job_id, status=status)
    if status.lower() in {JobStatus.FAILED.lower(), JobStatus.ERROR.lower()}:
        logger.error(
            "Job failed with status",
            job_id=job_id,
            status=status,
            result_traceback=job_data.get("result_traceback", "N/A"),
        )


async def _poll_until_complete(
    client: httpx.AsyncClient,
    settings: Settings,
    job_id: int,
    auth_headers: dict[str, str],
    basic_auth: httpx.BasicAuth | None,
    base_url: str,
    timeout_seconds: int,
    start_time: float,
) -> dict[str, Any]:
    """Poll job status until completion.

    Args:
        client: HTTP client
        settings: Application settings
        job_id: AAP job ID
        auth_headers: Authentication headers
        basic_auth: Basic authentication object
        base_url: Base URL for AAP controller
        timeout_seconds: Timeout for job execution in seconds
        start_time: Start time of job execution (from time.time())

    Returns:
        Final job data

    Raises:
        AAPJobExecutionError: If polling fails or timeout is exceeded
        CancelledError: If activity is cancelled

    """
    poll_interval = settings.aap_poll_interval_seconds
    status_url = f"{base_url}/api/controller/v2/jobs/{job_id}/"
    auth_param = basic_auth or httpx.USE_CLIENT_DEFAULT

    while True:
        # Check timeout deadline
        elapsed = time.time() - start_time
        _check_timeout(elapsed, timeout_seconds, job_id)

        # Check for cancellation (Temporal best practice)
        await _handle_cancellation(client, job_id, auth_headers, auth_param, base_url)

        # Poll job status
        job_data = await _fetch_job_status(client, status_url, auth_headers, auth_param, job_id)
        status = job_data["status"]

        logger.info("Job status", job_id=job_id, status=status, response_keys=list(job_data.keys()))

        # Check if job reached terminal state
        if _is_terminal_status(status):
            _log_terminal_status(job_id, status, job_data)
            return job_data

        # Send heartbeat to keep activity alive (Temporal best practice)
        activity.heartbeat({"job_id": job_id, "status": status})

        # Sleep before next poll (global setting)
        await asyncio.sleep(poll_interval)


async def _get_job_output(
    client: httpx.AsyncClient,
    job_id: int,
    auth_headers: dict[str, str],
    basic_auth: httpx.BasicAuth | None,
    base_url: str,
) -> str:
    """Get job output text.

    Args:
        client: HTTP client
        job_id: AAP job ID
        auth_headers: Authentication headers
        basic_auth: Basic authentication object
        base_url: Base URL for AAP controller

    Returns:
        Job output text (empty string if fetch fails)

    """
    output_url = f"{base_url}/api/controller/v2/jobs/{job_id}/stdout/?format=txt"
    auth_param = basic_auth or httpx.USE_CLIENT_DEFAULT

    try:
        output_response = await client.get(output_url, headers=auth_headers, auth=auth_param)
        return output_response.text if output_response.status_code == HTTPStatus.OK else ""
    except httpx.HTTPError:
        return ""  # Output fetch is best-effort


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
    # Import here to avoid circular dependency
    from .output_mapping import apply_output_mapping  # noqa: PLC0415

    logger.info("Starting AAP job template activity")

    try:
        config = AAPJobTemplateExecutorConfig.model_validate(input_config)
    except Exception as e:  # noqa: BLE001
        logger.warning("AAP config validation failed", error=str(e))
        return {
            "output": {
                "status": "failed",
                "error": {"type": "ConfigError", "message": f"Invalid configuration: {e}"},
            }
        }

    settings = get_settings()

    # Resolve authentication — credential takes priority over env vars
    resolved_creds = input_config.get("_resolved_credentials")
    try:
        if resolved_creds:
            resolved_creds = ensure_resolved_credentials_dict(resolved_creds)
            auth_headers, basic_auth, cred_host = _get_aap_auth_from_credentials(resolved_creds)
            base_url = cred_host or (settings.aap_base_url or "").rstrip("/")
            verify_ssl = settings.aap_verify_ssl
            # Check aap_verify_ssl from credential if available
            extra_vars = resolved_creds.get("extra_vars", {})
            if "aap_verify_ssl" in extra_vars:
                verify_ssl = str(extra_vars["aap_verify_ssl"]).lower() not in ("false", "0", "no")
        else:
            base_url = (settings.aap_base_url or "").rstrip("/")
            verify_ssl = settings.aap_verify_ssl
            auth_headers = _get_aap_auth_headers(settings)
            basic_auth = _get_aap_basic_auth(settings)
    except (AAPJobExecutionError, TypeError, KeyError, ValueError) as e:
        logger.warning("AAP auth resolution failed", error=str(e), exc_info=True)
        return {
            "output": {
                "status": "failed",
                "error": {"type": "ConfigError", "message": f"Authentication error: {e}"},
            }
        }

    if not base_url:
        return {
            "output": {
                "status": "failed",
                "error": {
                    "type": "ConfigError",
                    "message": "AAP host not configured. Set APP_AAP_BASE_URL or attach an AAP credential.",
                },
            }
        }

    start_time = time.time()
    job_id = None

    try:
        async with httpx.AsyncClient(
            verify=verify_ssl,
        ) as client:
            job_id = await _launch_aap_job(client, config, auth_headers, basic_auth, base_url)

            job_data = await _poll_until_complete(
                client, settings, job_id, auth_headers, basic_auth, base_url, config.timeout, start_time
            )

            output = await _get_job_output(client, job_id, auth_headers, basic_auth, base_url)
            elapsed_ms = (time.time() - start_time) * 1000

            final_status = job_data["status"]
            if isinstance(final_status, str) and final_status.lower() in {
                JobStatus.FAILED.lower(),
                JobStatus.ERROR.lower(),
            }:
                error_result = {
                    "status": "failed",
                    "job_id": job_id,
                    "job_status": final_status,
                    "output": output,
                    "artifacts": job_data.get("artifacts", {}),
                    "elapsed_ms": elapsed_ms,
                    "error": {
                        "type": "AAPJobExecutionError",
                        "message": f"AAP job {job_id} failed with status: {final_status}",
                    },
                }
                mapped_output = apply_output_mapping(error_result, output_config)
                return {"output": mapped_output}

            full_result = {
                "status": "completed",
                "job_id": job_id,
                "job_status": final_status,
                "output": output,
                "artifacts": job_data.get("artifacts", {}),
                "elapsed_ms": elapsed_ms,
            }
            mapped_output = apply_output_mapping(full_result, output_config)
            return {"output": mapped_output}

    except (ApplicationError, CancelledError):
        # Re-raise non-retryable and cancellation errors for Temporal retry semantics
        raise
    except Exception as e:
        logger.exception("Unexpected error in AAP activity", job_id=job_id)
        error_result = {
            "status": "failed",
            "job_id": job_id,
            "error": {
                "type": type(e).__name__,
                "message": f"Unexpected error executing AAP job template: {e}",
            },
        }
        mapped_output = apply_output_mapping(error_result, output_config)
        return {"output": mapped_output}
