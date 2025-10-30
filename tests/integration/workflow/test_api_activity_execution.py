"""Integration tests for REST API activity execution.

Tests API activities (executor: api) including:
- Simple HTTP GET request
- HTTP POST with request body and headers
- Authentication headers from inputs
- Timeout and retry behavior
"""

from collections.abc import Awaitable, Callable
from datetime import timedelta
from typing import Any

import pytest
import respx

from nexus.workflows.workflow_engine.models import WorkflowDefinition


@pytest.mark.integration
@pytest.mark.asyncio
async def test_simple_http_get_request(
    run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    mock_api_server: respx.MockRouter,
) -> None:
    """Test simple HTTP GET request (T005).

    The API activity should make an HTTP GET request and capture:
    - Response status code
    - Response body
    - Response headers
    """
    result = await run_workflow_from_file(
        "examples/api/simple-get-request.yaml", execution_timeout=timedelta(seconds=5)
    )

    # Verify workflow completed successfully
    assert result["status"] == "completed", f"Workflow failed: {result.get('error')}"

    # Verify API activity executed and captured response
    api_output = result["activity_outputs"]["fetch_data"]
    assert api_output is not None, "API activity output missing"

    # Check response structure (API activity returns status_code, body, headers directly)
    assert "status_code" in api_output
    assert "body" in api_output
    assert "headers" in api_output

    # Verify successful HTTP response
    assert api_output["status_code"] == 200 or api_output["status_code"] == 201


@pytest.mark.integration
@pytest.mark.asyncio
async def test_http_post_with_body(
    run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    mock_api_server: respx.MockRouter,
) -> None:
    """Test HTTP POST request with JSON body and headers (T006).

    The API activity should:
    - Send POST request with JSON body from inputs
    - Include custom headers
    - Capture response status and body
    """
    result = await run_workflow_from_file("examples/api/post-with-body.yaml", execution_timeout=timedelta(seconds=5))

    # Verify workflow completed
    assert result["status"] == "completed"

    # Verify POST request was made successfully
    post_output = result["activity_outputs"]["create_resource"]
    assert "status_code" in post_output
    assert post_output["status_code"] in [200, 201, 204]  # Successful creation

    # Verify response body contains expected data
    assert "body" in post_output
    # Response should confirm the posted data was received
    body = post_output["body"]
    assert body is not None


@pytest.mark.integration
@pytest.mark.asyncio
async def test_api_request_with_authentication(
    run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    mock_api_server: respx.MockRouter,
) -> None:
    """Test API request with Authorization header from inputs (T007).

    The API activity should:
    - Resolve ${input.apiToken} to actual token value
    - Include Authorization header in request
    - Successfully authenticate with the API
    """
    result = await run_workflow_from_file(
        "examples/api/authenticated-request.yaml", execution_timeout=timedelta(seconds=5)
    )

    # Verify workflow completed
    assert result["status"] == "completed"

    # Verify authenticated request succeeded
    auth_output = result["activity_outputs"]["authenticated_fetch"]
    assert auth_output["status_code"] == 200

    # Verify response indicates authentication succeeded
    # (Mock server should verify the auth header was present)
    assert "body" in auth_output
    assert auth_output["body"] is not None


@pytest.mark.integration
@pytest.mark.asyncio
async def test_api_timeout_and_retry(
    run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    mock_api_server: respx.MockRouter,
) -> None:
    """Test API request timeout and exponential backoff retry (T008).

    The API activity should:
    - Timeout if server responds slowly
    - Retry with exponential backoff strategy
    - Eventually succeed or fail after max retries
    """
    result = await run_workflow_from_file("examples/api/timeout-retry.yaml", execution_timeout=timedelta(seconds=5))

    # Workflow may succeed after retry or fail after max attempts
    # Check that retry logic was applied
    timeout_activity = result["activity_outputs"]["slow_endpoint"]

    # If it succeeded, verify response captured
    if result["status"] == "completed":
        assert "status_code" in timeout_activity
        assert timeout_activity["status_code"] == 200
    # If it failed, verify timeout/retry error captured
    else:
        assert result["status"] == "failed"
        assert "timeout" in result.get("error", "").lower() or "retry" in result.get("error", "").lower()


@pytest.mark.integration
@pytest.mark.asyncio
async def test_api_workflow_definition_parsing(
    load_workflow: Callable[[str], WorkflowDefinition],
) -> None:
    """Test that API workflow definitions are parsed correctly.

    Verifies the YAML parser correctly identifies:
    - executor: api
    - HTTP method (GET, POST, etc.)
    - URL configuration
    - Headers and body configuration
    """
    workflow_def = load_workflow("examples/api/simple-get-request.yaml")

    # Verify workflow has activities
    assert len(workflow_def.workflow.activities) > 0

    # Verify first activity is an API task
    activity = workflow_def.workflow.activities[0]
    assert activity.task is not None
    assert activity.task.executor == "api"
    assert activity.task.config is not None
    assert hasattr(activity.task.config, "method")
    assert hasattr(activity.task.config, "url")
    assert activity.task.config.method in ["GET", "POST", "PUT", "PATCH", "DELETE"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_api_header_resolution(
    run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    mock_api_server: respx.MockRouter,
) -> None:
    """Test header resolution from inputs and variables.

    Headers should support:
    - Static values
    - ${input.field} expressions
    - ${variables.field} expressions
    """
    result = await run_workflow_from_file(
        "examples/api/headers-resolution.yaml", execution_timeout=timedelta(seconds=5)
    )

    # Verify workflow completed
    assert result["status"] == "completed"

    # Verify request with resolved headers succeeded
    headers_output = result["activity_outputs"]["headers_test"]
    assert headers_output["status_code"] == 200

    # Mock server should validate that headers were correctly resolved and sent
    assert "body" in headers_output


@pytest.mark.integration
@pytest.mark.asyncio
async def test_api_query_parameters(
    run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    mock_api_server: respx.MockRouter,
) -> None:
    """Test query parameter construction from config.

    Query parameters should be properly URL-encoded and appended to the URL.
    """
    result = await run_workflow_from_file("examples/api/query-params.yaml", execution_timeout=timedelta(seconds=5))

    # Verify workflow completed
    assert result["status"] == "completed"

    # Verify query parameters were sent correctly
    query_output = result["activity_outputs"]["query_test"]
    assert query_output["status_code"] == 200

    # Response should confirm query params were received
    assert "body" in query_output


@pytest.mark.integration
@pytest.mark.asyncio
async def test_api_all_http_methods(
    run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    mock_api_server: respx.MockRouter,
) -> None:
    """Test all HTTP methods (GET, POST, PUT, PATCH, DELETE).

    Verify that all standard HTTP methods are supported.
    """
    result = await run_workflow_from_file("examples/api/all-http-methods.yaml", execution_timeout=timedelta(seconds=5))

    # Verify workflow completed
    assert result["status"] == "completed"

    # Verify all method activities executed successfully
    for method in ["get", "post", "put", "patch", "delete"]:
        activity_name = f"{method}_request"
        assert activity_name in result["activity_outputs"]
        assert result["activity_outputs"][activity_name]["status_code"] in [
            200,
            201,
            204,
        ]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_api_bearer_authentication(
    run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    mock_api_server: respx.MockRouter,
) -> None:
    """Test API request with bearer token authentication.

    The API activity should:
    - Use the authentication.type=bearer configuration
    - Resolve ${secrets.api_token} to actual token value
    - Add Authorization: Bearer <token> header to request
    - Successfully authenticate with the API
    """
    result = await run_workflow_from_file(
        "examples/api/auth-bearer.yaml",
        execution_timeout=timedelta(seconds=5),
        inputs={"secrets": {"api_token": "test-bearer-token-123"}},
    )

    # Verify workflow completed
    assert result["status"] == "completed", f"Workflow failed: {result.get('error')}"

    # Verify authenticated request succeeded
    auth_output = result["activity_outputs"]["fetch_protected_data"]
    assert auth_output["status_code"] == 200
    assert auth_output["body"]["authenticated"] is True
    assert auth_output["body"]["auth_type"] == "bearer"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_api_basic_authentication(
    run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    mock_api_server: respx.MockRouter,
) -> None:
    """Test API request with basic authentication.

    The API activity should:
    - Use the authentication.type=basic configuration
    - Resolve ${secrets.basic_credentials} to credentials
    - Add Authorization: Basic <credentials> header to request
    - Successfully authenticate with the API
    """
    result = await run_workflow_from_file(
        "examples/api/auth-basic.yaml",
        execution_timeout=timedelta(seconds=5),
        inputs={"secrets": {"basic_credentials": "dXNlcjpwYXNz"}},  # base64(user:pass)
    )

    # Verify workflow completed
    assert result["status"] == "completed", f"Workflow failed: {result.get('error')}"

    # Verify authenticated request succeeded
    auth_output = result["activity_outputs"]["fetch_with_basic_auth"]
    assert auth_output["status_code"] == 200
    assert auth_output["body"]["authenticated"] is True
    assert auth_output["body"]["auth_type"] == "basic"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_api_apikey_authentication(
    run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    mock_api_server: respx.MockRouter,
) -> None:
    """Test API request with API key authentication.

    The API activity should:
    - Use the authentication.type=apiKey configuration
    - Resolve ${secrets.api_key} to actual key value
    - Add X-API-Key: <key> header to request
    - Successfully authenticate with the API
    """
    result = await run_workflow_from_file(
        "examples/api/auth-apikey.yaml",
        execution_timeout=timedelta(seconds=5),
        inputs={"secrets": {"api_key": "my-secret-api-key-456"}},
    )

    # Verify workflow completed
    assert result["status"] == "completed", f"Workflow failed: {result.get('error')}"

    # Verify authenticated request succeeded
    auth_output = result["activity_outputs"]["fetch_with_api_key"]
    assert auth_output["status_code"] == 200
    assert auth_output["body"]["authenticated"] is True
    assert auth_output["body"]["auth_type"] == "apiKey"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_api_oauth2_authentication(
    run_workflow_from_file: Callable[..., Awaitable[dict[str, Any]]],
    mock_api_server: respx.MockRouter,
) -> None:
    """Test API request with OAuth2 authentication.

    The API activity should:
    - Use the authentication.type=oauth2 configuration
    - Resolve ${secrets.oauth2_token} to access token
    - Add Authorization: Bearer <token> header to request
    - Successfully authenticate with the API
    """
    result = await run_workflow_from_file(
        "examples/api/auth-oauth2.yaml",
        execution_timeout=timedelta(seconds=5),
        inputs={"secrets": {"oauth2_token": "oauth2-access-token-789"}},
    )

    # Verify workflow completed
    assert result["status"] == "completed", f"Workflow failed: {result.get('error')}"

    # Verify authenticated request succeeded
    auth_output = result["activity_outputs"]["fetch_with_oauth2"]
    assert auth_output["status_code"] == 200
    assert auth_output["body"]["authenticated"] is True
    assert auth_output["body"]["auth_type"] == "oauth2"
