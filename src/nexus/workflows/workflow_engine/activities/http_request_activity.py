"""HTTP request activity for v2 workflows."""

import base64
import time
from http import HTTPStatus
from typing import Any

import httpx
import structlog
from pydantic import ValidationError
from temporalio import activity

from nexus.credentials.lib.auth_types import AUTH_TYPE_API_KEY, AUTH_TYPE_BASIC, AUTH_TYPE_BEARER
from nexus.workflows.workflow_engine.models.workflow_definition import (
    ActivityName,
    APIExecutorConfig,
    AuthenticationType,
)
from nexus.workflows.workflow_engine.utils.credential_scrubber import ensure_resolved_credentials_dict

from .common import ActivityExecutionError
from .output_mapping import apply_output_mapping

logger = structlog.stdlib.get_logger(__name__)

DEFAULT_HTTP_TIMEOUT_SECONDS = 30


def _add_credential_auth_headers(headers: dict[str, Any], extra_vars: dict[str, Any]) -> None:
    """Apply authentication from Nexus credential system.

    Takes priority over config-based authentication when a credential is attached.
    Raises ActivityExecutionError if credential values are empty.
    """
    auth_type = extra_vars.get("auth_type", "")

    if auth_type == AUTH_TYPE_BEARER:
        token = extra_vars.get("bearer_token", "")
        if not token:
            msg = "Bearer credential resolved but token is empty. Re-save the credential with a valid token."
            raise ActivityExecutionError(msg)
        headers["Authorization"] = f"Bearer {token}"

    elif auth_type == AUTH_TYPE_BASIC:
        username = extra_vars.get("basic_username", "")
        password = extra_vars.get("basic_password", "")
        if not username:
            msg = "Basic auth credential resolved but username is empty. Re-save the credential."
            raise ActivityExecutionError(msg)
        encoded = base64.b64encode(f"{username}:{password}".encode()).decode("ascii")
        headers["Authorization"] = f"Basic {encoded}"

    elif auth_type == AUTH_TYPE_API_KEY:
        api_key = extra_vars.get("api_key", "") or extra_vars.get("llm_api_key", "")
        if not api_key:
            msg = "API key credential resolved but key is empty. Re-save the credential."
            raise ActivityExecutionError(msg)
        headers["X-API-Key"] = api_key

    elif auth_type:
        msg = f"Unknown credential auth_type: '{auth_type}'. Check the credential type configuration."
        raise ActivityExecutionError(msg)

    else:
        logger.warning("Credential resolved but auth_type is missing from extra_vars — proceeding without auth")


def _apply_authentication(headers: dict[str, Any], config: APIExecutorConfig) -> None:
    """Apply authentication to request headers based on config.

    Mutates the headers dict in place. Credentials references (e.g. ${secrets.token})
    are expected to have been resolved before the activity is called.
    """
    auth = config.authentication
    if auth is None:
        return

    credential_value = auth.credentials

    if auth.type == AuthenticationType.BEARER:
        headers["Authorization"] = f"Bearer {credential_value}"
    elif auth.type == AuthenticationType.BASIC:
        # credentials expected as "username:password"
        if ":" not in credential_value:
            logger.warning("BASIC auth credentials should be in 'username:password' format")
        encoded = base64.b64encode(credential_value.encode()).decode()
        headers["Authorization"] = f"Basic {encoded}"
    elif auth.type == AuthenticationType.API_KEY:
        headers["X-API-Key"] = credential_value
    elif auth.type == AuthenticationType.OAUTH2:
        headers["Authorization"] = f"Bearer {credential_value}"


@activity.defn(name=ActivityName.HTTP_REQUEST)
async def execute_http_request_activity(
    input_config: dict[str, Any],
    output_config: dict[str, str] | None,
) -> dict[str, Any]:
    """Execute HTTP request node for v2 workflows.

    Returns normalized structure with output portion (no control needed for executor nodes).
    Output mapping is applied internally before returning to avoid storing suppressed fields in Temporal.

    Args:
        input_config: Resolved node configuration (templates already resolved)
        output_config: Output mapping configuration (field_name -> template expression)
                       None = return full result, {} = suppress all, {...} = extract specific fields

    Returns:
        {
            "output": {
                "status": "completed",
                "status_code": 200,   # Only if not suppressed by output_config
                "body": {...},        # Only if not suppressed by output_config
                ...
            }
        }

    """
    # Validate config via Pydantic model
    try:
        config = APIExecutorConfig.model_validate(input_config)
    except ValidationError as exc:
        return {
            "output": {
                "status": "failed",
                "error": {"type": "ValidationError", "message": str(exc)},
            }
        }

    # Build headers — Nexus credentials take priority over config-based auth
    headers = dict(config.headers)
    resolved_creds = input_config.get("_resolved_credentials")
    if resolved_creds:
        resolved_creds = ensure_resolved_credentials_dict(resolved_creds)
        _add_credential_auth_headers(headers, resolved_creds.get("extra_vars", {}))
    else:
        _apply_authentication(headers, config)

    timeout_seconds = config.timeout if config.timeout is not None else DEFAULT_HTTP_TIMEOUT_SECONDS

    start_time = time.time()

    try:
        async with httpx.AsyncClient() as client:
            response = await client.request(
                method=config.method.value,
                url=config.url,
                headers=headers,
                params=config.query_params,
                json=config.body if isinstance(config.body, dict) else None,
                content=config.body if isinstance(config.body, str) else None,
                timeout=float(timeout_seconds),
            )

        elapsed = time.time() - start_time

        # Detect HTTP errors (4xx/5xx)
        if response.status_code >= HTTPStatus.BAD_REQUEST:
            try:
                error_body = response.json()
            except Exception:  # noqa: BLE001
                error_body = response.text

            error_result = {
                "status": "failed",
                "status_code": response.status_code,
                "body": error_body,
                "headers": dict(response.headers),
                "elapsed": elapsed,
                "error": {
                    "type": "HTTPError",
                    "message": f"HTTP {response.status_code}: {response.reason_phrase}",
                },
            }
            mapped_output = apply_output_mapping(error_result, output_config)
            return {"output": mapped_output}

        # Try to parse JSON response
        try:
            body_data = response.json()
        except Exception:  # noqa: BLE001
            body_data = response.text

        # Full result before mapping
        full_result = {
            "status": "completed",
            "status_code": response.status_code,
            "body": body_data,
            "headers": dict(response.headers),
            "elapsed": elapsed,
        }

        # Apply output mapping (suppresses fields before Temporal stores it)
        mapped_output = apply_output_mapping(full_result, output_config)

        return {"output": mapped_output}

    except Exception as exc:  # noqa: BLE001
        # Failed result conforming to baseFailedResult schema
        error_result = {
            "status": "failed",
            "error": {
                "type": type(exc).__name__,
                "message": str(exc),
            },
        }
        # No mapping on failures
        return {"output": error_result}
