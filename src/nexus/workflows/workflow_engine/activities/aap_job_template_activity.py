"""AAP Job Template activity executor.

Launches Ansible Automation Platform job templates and polls for completion.
Reuses httpx patterns from api_activity.py with AAP-specific polling logic.

"""

from __future__ import annotations

import asyncio
import re
import time
from enum import StrEnum
from http import HTTPStatus
from typing import TYPE_CHECKING, Any, NoReturn

import httpx
import structlog
from temporalio import activity
from temporalio.exceptions import ApplicationError, CancelledError

from nexus.core.config.base import Settings, get_settings
from nexus.core.exceptions import SafeValueError
from nexus.workflows.workflow_engine.models import AAPJobTemplateExecutorConfig
from nexus.workflows.workflow_engine.models.aap_types import AAPResourceType
from nexus.workflows.workflow_engine.utils.credential_scrubber import ensure_resolved_credentials_dict

from .common import ActivityExecutionError

if TYPE_CHECKING:
    from httpx._client import UseClientDefault

logger = structlog.stdlib.get_logger(__name__)

# ============================================================================
# SECURITY: AAP Label Creation
# ============================================================================
# WARNING: This module creates labels in AAP Controller. Labels are permanent
# resources (no automatic cleanup) scoped to organizations.
#
# Current limits per workflow execution:
# - MAX_LABELS_PER_WORKFLOW = 100 labels
# - Each label is validated against LABEL_NAME_PATTERN (alphanumeric + ._-)
# - Label names are limited to MAX_LABEL_NAME_LENGTH = 512 characters
#
# DoS Risk: No rate limiting exists between workflow executions. A malicious
# user can execute 1000 workflows * 100 labels = 100,000 permanent labels in
# AAP, causing database bloat and performance degradation.
#
# Mitigation: Implement workflow execution rate limiting or label quota systems
# in future versions. Monitor AAP label count growth via AAP metrics.
# ============================================================================


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


# Security constants for label validation
MAX_LABEL_NAME_LENGTH = 512  # AAP's max label length
# Security: Limit labels per workflow execution to prevent single-workflow DoS.
# NOTE: This does NOT prevent multi-workflow DoS (1000 runs * 100 labels = 100k labels).
# Future: Implement quota system across all workflows in an organization/tenant.
MAX_LABELS_PER_WORKFLOW = 100  # Prevent resource exhaustion per workflow
LABEL_NAME_PATTERN = re.compile(r"^[a-zA-Z0-9 ._-]+$")

# HTTP status codes
HTTP_CONFLICT = 409  # Resource conflict (concurrent creation)


def _validate_label_name(name: str) -> None:
    r"""Validate label name for security (prevent injection, DoS).

    SECURITY: This validation prevents:
    - Injection attacks: Only alphanumeric + ._- characters allowed
    - DoS via large names: Max 512 characters (MAX_LABEL_NAME_LENGTH)
    - Null byte injection: Explicit check for \x00

    NOTE: This does NOT prevent resource exhaustion from creating many labels.
    Workflows are limited to MAX_LABELS_PER_WORKFLOW (100) per execution, but
    no quota exists across multiple workflow executions.

    Args:
        name: Label name to validate

    Raises:
        SafeValueError: If label name is invalid

    """
    if not name:
        msg = "Label name cannot be empty"
        raise SafeValueError(msg)

    if len(name) > MAX_LABEL_NAME_LENGTH:
        msg = f"Label name exceeds maximum length ({len(name)} > {MAX_LABEL_NAME_LENGTH})"
        raise SafeValueError(msg)

    if "\x00" in name:
        msg = "Label name contains null bytes"
        raise SafeValueError(msg)

    if not LABEL_NAME_PATTERN.match(name):
        msg = f"Label name '{name}' contains invalid characters (allowed: alphanumeric, '.', '_', '-')"
        raise SafeValueError(msg)


async def _lookup_organization_id(
    client: httpx.AsyncClient,
    organization_name: str,
    auth_headers: dict[str, str],
    auth_param: httpx.BasicAuth | httpx._client.UseClientDefault,
    base_url: str,
) -> int:
    """Look up organization ID by name.

    Args:
        client: HTTP client
        organization_name: Organization name to look up
        auth_headers: Authentication headers
        auth_param: Authentication parameter for requests
        base_url: Base URL for AAP controller

    Returns:
        Organization ID

    Raises:
        AAPJobExecutionError: If organization lookup fails or not found

    """
    org_lookup_url = f"{base_url}/api/controller/v2/organizations/"
    org_params = {"name": organization_name}
    try:
        org_response = await client.get(org_lookup_url, params=org_params, headers=auth_headers, auth=auth_param)
        org_response.raise_for_status()
        org_data: dict[str, Any] = org_response.json()
        org_results: list[dict[str, Any]] = org_data.get("results", [])
        if not org_results:
            msg = f"Organization '{organization_name}' not found"
            raise AAPJobExecutionError(msg, status=None)
        organization_id = int(org_results[0]["id"])
        logger.info(
            "Resolved organization to ID for label operations",
            organization_name=organization_name,
            organization_id=organization_id,
        )
        return organization_id
    except httpx.HTTPStatusError as e:
        response_text = e.response.text if hasattr(e.response, "text") else ""
        msg = f"Failed to lookup organization '{organization_name}': HTTP {e.response.status_code} - {response_text}"
        raise AAPJobExecutionError(msg, status=None) from e


async def _resolve_single_label(
    client: httpx.AsyncClient,
    name: str,
    organization_id: int,
    organization_name: str | None,
    auth_headers: dict[str, str],
    auth_param: httpx.BasicAuth | httpx._client.UseClientDefault,
    base_url: str,
) -> int:
    """Resolve a single label name to ID, creating if needed.

    SECURITY NOTE: This function creates labels as a side effect. Labels are
    permanent AAP resources with no automatic cleanup. Each workflow execution
    can create up to MAX_LABELS_PER_WORKFLOW (100) labels.

    Concurrent Creation: Uses optimistic concurrency control - if a 409 Conflict
    occurs during label creation (another workflow created the same label), this
    function retries the query to retrieve the newly created label ID.

    Args:
        client: HTTP client
        name: Label name to resolve
        organization_id: Organization ID for label scoping
        organization_name: Organization name (for logging)
        auth_headers: Authentication headers
        auth_param: Authentication parameter for requests
        base_url: Base URL for AAP controller

    Returns:
        Label ID (either existing or newly created)

    Raises:
        AAPJobExecutionError: If label resolution or creation fails
        SafeValueError: If label name fails validation (see _validate_label_name)

    """
    lookup_url = f"{base_url}/api/controller/v2/labels/"
    params = {"name": name, "page_size": "200"}

    try:
        response = await client.get(lookup_url, params=params, headers=auth_headers, auth=auth_param)
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        all_results: list[dict[str, Any]] = data.get("results", [])

        # AAP labels API doesn't filter by organization in query - filter client-side
        results = [r for r in all_results if r.get("organization") == organization_id]

        logger.debug(
            "Label query result",
            label_name=name,
            organization_name=organization_name,
            organization_id=organization_id,
            total_found=len(all_results),
            org_filtered_count=len(results),
            results=results or None,
        )

        if results:
            # Label exists in this organization - use its ID
            label_id = int(results[0]["id"])
            logger.info("Resolved label to ID", label_name=name, label_id=label_id, organization_id=organization_id)
            return label_id

        # Label doesn't exist in this organization - create it
        create_url = f"{base_url}/api/controller/v2/labels/"
        create_body = {"name": name, "organization": organization_id}

        create_response = await client.post(create_url, json=create_body, headers=auth_headers, auth=auth_param)
        create_response.raise_for_status()
        created_data: dict[str, Any] = create_response.json()
        label_id = int(created_data["id"])
        logger.info("Created new label", label_name=name, label_id=label_id)
        return label_id

    except httpx.HTTPStatusError as e:
        # Handle concurrent creation (409 Conflict)
        if e.response.status_code == HTTP_CONFLICT:
            # Label was created by another workflow - re-query to get its ID
            logger.info("Label creation conflict, re-querying", label_name=name, organization_id=organization_id)
            try:
                retry_response = await client.get(lookup_url, params=params, headers=auth_headers, auth=auth_param)
                retry_response.raise_for_status()
                retry_data: dict[str, Any] = retry_response.json()
                retry_results: list[dict[str, Any]] = retry_data.get("results", [])
                # Filter by organization
                filtered_results = [r for r in retry_results if r.get("organization") == organization_id]

                if filtered_results:
                    label_id = int(filtered_results[0]["id"])
                    logger.info(
                        "Resolved label after conflict",
                        label_name=name,
                        label_id=label_id,
                        organization_id=organization_id,
                    )
                    return label_id

                # Label still not found after retry - this is unexpected
                msg = f"Label '{name}' not found after 409 Conflict retry"
                raise AAPJobExecutionError(msg, status=None) from e
            except httpx.HTTPError as retry_error:
                msg = f"Failed to re-query label '{name}' after 409 Conflict: {retry_error}"
                raise AAPJobExecutionError(msg) from retry_error

        # Generic error for all other status codes
        response_text = e.response.text if hasattr(e.response, "text") else ""
        msg = f"Failed to resolve/create label '{name}': HTTP {e.response.status_code} - {response_text}"
        raise AAPJobExecutionError(msg, status=None) from e
    except httpx.HTTPError as e:
        msg = f"Failed to connect to AAP for label resolution: {e}"
        raise AAPJobExecutionError(msg) from e


async def _resolve_label_ids(
    client: httpx.AsyncClient,
    label_names: list[str],
    organization_name: str | None,
    organization_id: int | None,
    auth_headers: dict[str, str],
    basic_auth: httpx.BasicAuth | None,
    base_url: str,
) -> list[int]:
    """Resolve label names to AAP label IDs, creating new labels if needed.

    Queries AAP for each label by name within the organization.
    Creates new labels if they don't exist (per AAP's on-launch behavior).

    Security: Validates label names and enforces limits to prevent injection and DoS.

    Args:
        client: HTTP client
        label_names: List of label names to resolve
        organization_name: Organization name (labels are org-scoped, used for lookup if ID not provided)
        organization_id: Organization ID (takes precedence over name, skips lookup)
        auth_headers: Authentication headers
        basic_auth: Basic authentication object
        base_url: Base URL for AAP controller

    Returns:
        List of label IDs corresponding to input names

    Raises:
        AAPJobExecutionError: If label resolution or creation fails
        SafeValueError: If label validation fails

    """
    # Security: Prevent resource exhaustion
    if len(label_names) > MAX_LABELS_PER_WORKFLOW:
        msg = f"Cannot process more than {MAX_LABELS_PER_WORKFLOW} labels per workflow (got {len(label_names)})"
        raise SafeValueError(msg)

    # Security: Validate all label names upfront
    for name in label_names:
        _validate_label_name(name)

    auth_param = basic_auth or httpx.USE_CLIENT_DEFAULT

    # Use provided organization_id or look it up from name
    resolved_org_id: int
    if organization_id is not None:
        resolved_org_id = organization_id
        logger.info("Using organization ID directly for label resolution", organization_id=organization_id)
    elif organization_name is not None:
        resolved_org_id = await _lookup_organization_id(client, organization_name, auth_headers, auth_param, base_url)
        logger.info(
            "Resolved organization name to ID for label resolution",
            organization_name=organization_name,
            organization_id=resolved_org_id,
        )
    else:
        msg = "Either organization_id or organization_name must be provided for label resolution"
        raise SafeValueError(msg)

    # Resolve each label name to its ID
    label_ids: list[int] = []
    for name in label_names:
        label_id = await _resolve_single_label(
            client, name, resolved_org_id, organization_name, auth_headers, auth_param, base_url
        )
        label_ids.append(label_id)

    return label_ids


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
    # Labels removed - need special resolution (name → ID + creation)
]


def _build_launch_body(
    config: AAPJobTemplateExecutorConfig,
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
    config: AAPJobTemplateExecutorConfig,
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
        return await _lookup_resource_by_name(
            client,
            config.job_template_name,
            config.organization_name,  # type: ignore[arg-type]
            AAPResourceType.JOB_TEMPLATES,
            auth_headers,
            basic_auth,
            base_url,
        )
    msg = "Either job_template_id or job_template_name must be provided"
    raise AAPJobExecutionError(msg)


async def _resolve_inventory_id(
    client: httpx.AsyncClient,
    config: AAPJobTemplateExecutorConfig,
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
        return await _lookup_resource_by_name(
            client,
            config.inventory_name,
            config.organization_name,  # type: ignore[arg-type]
            AAPResourceType.INVENTORIES,
            auth_headers,
            basic_auth,
            base_url,
        )
    return None


async def _resolve_instance_group_id(
    client: httpx.AsyncClient,
    config: AAPJobTemplateExecutorConfig,
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
        instance_group_id = await _lookup_resource_by_name(
            client,
            config.instance_group_name,
            config.organization_name,  # type: ignore[arg-type]
            AAPResourceType.INSTANCE_GROUPS,
            auth_headers,
            basic_auth,
            base_url,
        )
        logger.info(
            "Resolved instance group name to ID",
            instance_group_name=config.instance_group_name,
            instance_group_id=instance_group_id,
        )
        return instance_group_id
    return None


def _get_template_reference_info(config: AAPJobTemplateExecutorConfig, job_template_id: int) -> str:
    """Build reference info string for logging/errors (ID or name+org)."""
    if config.job_template_id is not None:
        return f"ID {job_template_id}"
    return f"'{config.job_template_name}' in org '{config.organization_name}'"


def _log_launch_success(config: AAPJobTemplateExecutorConfig, job_template_id: int, job_id: int) -> None:
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
    config: AAPJobTemplateExecutorConfig,
    job_template_id: int,
    body: dict[str, Any],
) -> NoReturn:
    """Handle HTTP status errors during job launch."""
    ref_info = _get_template_reference_info(config, job_template_id)
    response_text = e.response.text if hasattr(e.response, "text") else ""
    msg = f"Failed to launch job template {ref_info}: HTTP {e.response.status_code} - {response_text}"
    # Security: Don't log sensitive fields (extra_vars may contain secrets, credentials are IDs)
    safe_body_keys = [k for k in body if k not in ("extra_vars", "credentials")]
    logger.exception(
        "Job template launch failed",
        job_template_id=job_template_id,
        status_code=e.response.status_code,
        response_body=response_text,
        launch_body_keys=safe_body_keys,  # Log structure, not values
    )
    raise AAPJobExecutionError(msg, status=None) from e


async def _launch_aap_job(
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
    job_template_id = await _resolve_job_template_id(client, config, auth_headers, basic_auth, base_url)
    inventory_id = await _resolve_inventory_id(client, config, auth_headers, basic_auth, base_url)
    instance_group_id = await _resolve_instance_group_id(client, config, auth_headers, basic_auth, base_url)

    # Resolve labels to IDs if provided (creates new labels if needed)
    label_ids: list[int] | None = None
    if config.labels:
        label_ids = await _resolve_label_ids(
            client,
            config.labels,
            config.organization_name,
            config.organization_id,
            auth_headers,
            basic_auth,
            base_url,
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
        # Increase timeout for AAP connections (default 5s can be too short for remote AAP servers)
        timeout = httpx.Timeout(30.0, connect=10.0)
        async with httpx.AsyncClient(
            verify=verify_ssl,
            timeout=timeout,
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
