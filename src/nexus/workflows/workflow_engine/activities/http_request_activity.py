"""HTTP request activity for v2 workflows."""

import base64
import time
from http import HTTPStatus
from typing import Any

import httpx
import structlog
from pydantic import ValidationError
from temporalio import activity

from nexus.workflows.workflow_engine.models.workflow_definition import (
    APIExecutorConfig,
    AuthenticationType,
)

from .output_mapping import apply_output_mapping

logger = structlog.stdlib.get_logger(__name__)

DEFAULT_HTTP_TIMEOUT_SECONDS = 30


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


@activity.defn(name="execute_http_request_activity")
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

    # Build headers from validated model and apply authentication
    headers = dict(config.headers)
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
