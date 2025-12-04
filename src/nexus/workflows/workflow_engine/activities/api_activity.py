"""REST API activity executor.

This module provides functionality to execute HTTP requests as workflow activities.
Supports all HTTP methods (GET, POST, PUT, PATCH, DELETE) with request body,
headers, query parameters, and authentication.
"""

import time
from http import HTTPStatus
from typing import Any, cast

import httpx
from temporalio import activity

from nexus.workflows.workflow_engine import constants
from nexus.workflows.workflow_engine.expression_resolver import ExpressionResolver
from nexus.workflows.workflow_engine.models import APIExecutorConfig, Authentication, AuthenticationType

from .common import ActivityExecutionError

# Type for JSON-serializable values (used for request body resolution)
JsonSerializable = dict[str, Any] | list[Any] | str | int | float | bool | None


class APIExecutionError(ActivityExecutionError):
    """Raised when API request fails."""

    status_code: int | None
    response_body: str | None

    def __init__(
        self,
        message: str,
        status_code: int | None = None,
        response_body: str | None = None,
    ) -> None:
        """Initialize API execution error.

        Args:
            message: Error message
            status_code: HTTP status code (if available)
            response_body: Response body (if available)

        """
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body


def _raise_http_error(status_code: int, reason_phrase: str, response_body: str | dict[str, Any]) -> None:
    """Raise APIExecutionError for HTTP errors.

    Args:
        status_code: HTTP status code
        reason_phrase: HTTP reason phrase
        response_body: Response body

    Raises:
        APIExecutionError: Always raised with formatted error details

    """
    raise APIExecutionError(
        message=f"HTTP {status_code}: {reason_phrase}",
        status_code=status_code,
        response_body=str(response_body),
    )


@activity.defn
async def execute_api_request(config: dict[str, Any], inputs: dict[str, Any]) -> dict[str, Any]:
    """Execute an HTTP API request asynchronously.

    Args:
        config: API executor configuration dict (validated to APIExecutorConfig)
        inputs: Input parameters for expression resolution

    Returns:
        dict with keys:
            - status_code: HTTP status code
            - headers: Response headers (dict)
            - body: Response body (parsed as JSON if possible, otherwise string)
            - elapsed_ms: Request elapsed time in milliseconds

    Raises:
        APIExecutionError: If request fails or network error occurs

    Example:
        >>> config = {"method": "GET", "url": "https://api.example.com/data"}
        >>> result = await execute_api_request(config, {})
        >>> print(result['status_code'])
        200

    """
    # Validate config using Pydantic V2's model_validate (no deprecation warnings)
    api_config = APIExecutorConfig.model_validate(config)

    method = api_config.method.value
    url = api_config.url
    headers = dict(api_config.headers)  # Create mutable copy
    query_params = api_config.query_params
    timeout = api_config.timeout if api_config.timeout is not None else constants.API_TIMEOUT_SECONDS
    body = api_config.body
    authentication = api_config.authentication

    # Record start time for elapsed calculation
    start_time = time.time()

    try:
        # Create minimal workflow state for expression resolution
        # The ExpressionResolver expects workflow_state with "inputs" key
        # For now, secrets are passed as inputs (to be enhanced later with proper secrets management)
        workflow_state = {"inputs": inputs, "secrets": inputs.get("secrets", {})}
        resolver = ExpressionResolver(workflow_definition=None)

        # Process authentication if configured
        _add_authentication_headers(headers, authentication, resolver, workflow_state)

        # Resolve URL from inputs (e.g., ${input.userId} → actual user ID)
        resolved_url = str(resolver.resolve_expression(url, workflow_state))

        # Resolve headers from inputs (e.g., ${input.apiToken} → actual token)
        resolved_headers = _resolve_dict_values(headers, resolver, workflow_state)

        # Resolve query parameters from inputs
        resolved_query_params = _resolve_dict_values(query_params, resolver, workflow_state)

        # Resolve request body from inputs
        resolved_body = _resolve_body_with_resolver(body, resolver, workflow_state)

        async with httpx.AsyncClient(timeout=timeout) as client:
            # Make the HTTP request
            response = await client.request(
                method=method,
                url=resolved_url,
                headers=resolved_headers,
                params=resolved_query_params,
                json=resolved_body if isinstance(resolved_body, dict) else None,
                content=resolved_body if isinstance(resolved_body, str | bytes) else None,
            )

            # Calculate elapsed time
            elapsed_ms = (time.time() - start_time) * 1000

            # Parse response body
            try:
                response_body = response.json()
            except (ValueError, TypeError):
                # Not JSON, use text
                response_body = response.text

            # Check for HTTP errors (4xx, 5xx)
            if response.status_code >= HTTPStatus.BAD_REQUEST:
                _raise_http_error(response.status_code, response.reason_phrase, response_body)

            return {
                "status_code": response.status_code,
                "headers": dict(response.headers),
                "body": response_body,
                "elapsed_ms": elapsed_ms,
            }

    except APIExecutionError:
        # Re-raise APIExecutionError without wrapping
        raise

    except (TypeError, ValueError) as e:
        # Expression resolution or validation errors
        elapsed_ms = (time.time() - start_time) * 1000
        raise APIExecutionError(
            message=f"Invalid configuration or input: {e}",
            status_code=None,
            response_body=None,
        ) from e

    except httpx.TimeoutException as e:
        elapsed_ms = (time.time() - start_time) * 1000
        raise APIExecutionError(
            message=f"Request timeout after {timeout}s ({elapsed_ms:.0f}ms elapsed)",
            status_code=None,
            response_body=None,
        ) from e

    except httpx.HTTPError as e:
        elapsed_ms = (time.time() - start_time) * 1000
        raise APIExecutionError(
            message=f"HTTP error after {elapsed_ms:.0f}ms: {e}",
            status_code=None,
            response_body=None,
        ) from e

    except Exception as e:
        elapsed_ms = (time.time() - start_time) * 1000
        raise APIExecutionError(
            message=f"Unexpected error after {elapsed_ms:.0f}ms: {e}",
            status_code=None,
            response_body=None,
        ) from e


def _resolve_dict_values(
    data: dict[str, Any],
    resolver: ExpressionResolver,
    workflow_state: dict[str, Any],
) -> dict[str, str]:
    """Resolve dict values using ExpressionResolver, converting all values to strings.

    Supports ${input.field} and other expressions.

    Args:
        data: Dictionary configuration (may contain expressions)
        resolver: ExpressionResolver instance
        workflow_state: Workflow state for resolution

    Returns:
        Resolved dictionary with string values

    """
    resolved = {}
    for key, value in data.items():
        resolved_value = resolver.resolve_expression(value, workflow_state)
        resolved[key] = str(resolved_value)
    return resolved


def _add_authentication_headers(
    headers: dict[str, str],
    authentication: Authentication | None,
    resolver: ExpressionResolver,
    workflow_state: dict[str, Any],
) -> None:
    """Add authentication headers based on authentication configuration.

    Args:
        headers: Headers dict to modify (mutated in place)
        authentication: Authentication configuration
        resolver: ExpressionResolver instance
        workflow_state: Workflow state for resolution

    """
    if authentication is None:
        return

    # Resolve credentials from secrets
    credentials = str(resolver.resolve_expression(authentication.credentials, workflow_state))

    # Add appropriate authentication header based on type
    if authentication.type == AuthenticationType.BEARER:
        headers["Authorization"] = f"Bearer {credentials}"
    elif authentication.type == AuthenticationType.BASIC:
        # Credentials should be base64-encoded username:password
        headers["Authorization"] = f"Basic {credentials}"
    elif authentication.type == AuthenticationType.API_KEY:
        # For API key, use X-API-Key header by convention
        headers["X-API-Key"] = credentials
    elif authentication.type == AuthenticationType.OAUTH2:
        # OAuth2 uses Bearer token format
        headers["Authorization"] = f"Bearer {credentials}"


def _resolve_body_with_resolver(
    body: JsonSerializable,
    resolver: ExpressionResolver,
    workflow_state: dict[str, Any],
) -> JsonSerializable:
    """Resolve request body using ExpressionResolver.

    Supports ${input.field} and other expressions in body structure, including nested objects and lists.
    Handles all JSON-serializable types (dict, list, str, int, float, bool, None).

    Args:
        body: Request body configuration (may contain expressions, nested dicts, or lists)
        resolver: ExpressionResolver instance
        workflow_state: Workflow state for resolution

    Returns:
        Resolved request body with all nested expressions resolved to JSON-serializable values

    """
    if body is None:
        return None

    if isinstance(body, str):
        # If body is a string expression, resolve it directly
        # Returns any JSON-serializable value (dict, list, str, int, float, bool, None)
        return cast("JsonSerializable", resolver.resolve_expression(body, workflow_state))

    if isinstance(body, list):
        # Recursively resolve expressions in list items
        return [_resolve_body_with_resolver(item, resolver, workflow_state) for item in body]

    if isinstance(body, dict):
        # Recursively resolve expressions in dict values
        resolved = {}
        for key, value in body.items():
            resolved[key] = _resolve_body_with_resolver(value, resolver, workflow_state)
        return resolved

    # For other types (int, bool, etc.), return as-is
    return body
