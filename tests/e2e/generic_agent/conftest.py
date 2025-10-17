"""Shared fixtures and helpers for generic-agent E2E tests.

This module contains common fixtures, constants, and utility functions
used across all generic-agent test suites.

Reference: https://a2a-protocol.org/dev/specification/
"""

import os
import uuid
from typing import Any

import pytest
import requests

# Configuration
GENERIC_AGENT_URL = os.getenv("GENERIC_AGENT_URL", "http://localhost:8001")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
TEST_MODEL = os.getenv("TEST_MODEL", "anthropic/claude-3.5-sonnet")

# HTTP Status codes
HTTP_OK = 200
HTTP_BAD_REQUEST = 400

# JSON-RPC 2.0 Error Codes (https://www.jsonrpc.org/specification#error_object)
JSONRPC_PARSE_ERROR = -32700
JSONRPC_INVALID_REQUEST = -32600
JSONRPC_METHOD_NOT_FOUND = -32601
JSONRPC_INVALID_PARAMS = -32602
JSONRPC_INTERNAL_ERROR = -32603

# A2A Protocol Constants
A2A_PROTOCOL_VERSION = "0.3.0"
MIN_HISTORY_ENTRIES = 2


class AgentError(Exception):
    """Exception raised when agent returns an error response."""


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture(scope="module")
def agent_url() -> str:
    """Get generic-agent URL.

    Reference: https://a2a-protocol.org/dev/specification/#agent-discovery
    """
    return GENERIC_AGENT_URL


@pytest.fixture(scope="module")
def api_key() -> str:
    """Get OpenRouter API key for LLM access."""
    if not OPENROUTER_API_KEY:
        pytest.skip("OPENROUTER_API_KEY not set")
    return OPENROUTER_API_KEY


# =============================================================================
# Helper Functions
# =============================================================================


def send_jsonrpc_request(
    agent_url: str,
    method: str,
    params: dict[str, Any] | None = None,
    request_id: str | None = None,
    timeout: int = 60,
) -> dict[str, Any]:
    """Send a JSON-RPC 2.0 request to the agent.

    Args:
        agent_url: Agent base URL
        method: JSON-RPC method name
        params: Method parameters
        request_id: Optional request ID (generated if not provided)
        timeout: Request timeout in seconds

    Returns:
        Full JSON-RPC response

    Reference: https://www.jsonrpc.org/specification
    Reference: https://a2a-protocol.org/dev/specification/#message-format

    """
    if request_id is None:
        request_id = f"req-{uuid.uuid4()}"

    payload: dict[str, Any] = {
        "jsonrpc": "2.0",
        "id": request_id,
        "method": method,
    }

    if params is not None:
        payload["params"] = params

    response = requests.post(f"{agent_url}/", json=payload, timeout=timeout)
    return response.json()  # type: ignore[no-any-return]


def send_message(
    agent_url: str,
    text: str,
    context_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    message_id: str | None = None,
    timeout: int = 60,
) -> dict[str, Any]:
    """Send a message to the agent using the message/send method.

    Args:
        agent_url: Agent URL
        text: Message text
        context_id: Optional context ID for conversation continuity
        metadata: Optional metadata (e.g., nexus:agentConfig)
        message_id: Optional message ID (generated if not provided)
        timeout: Request timeout in seconds

    Returns:
        Full JSON-RPC response

    Reference: https://a2a-protocol.org/dev/specification/#messagesend

    """
    if message_id is None:
        message_id = f"msg-{uuid.uuid4()}"

    message: dict[str, Any] = {
        "messageId": message_id,
        "role": "user",
        "parts": [{"kind": "text", "text": text}],
    }

    if context_id:
        message["contextId"] = context_id

    params: dict[str, Any] = {"message": message}

    if metadata:
        params["metadata"] = metadata

    return send_jsonrpc_request(agent_url, "message/send", params, timeout=timeout)


def get_response_text(result: dict[str, Any]) -> str:
    """Extract response text from agent result.

    Reference: https://a2a-protocol.org/dev/specification/#artifacts
    """
    artifacts = result.get("result", {}).get("artifacts", [])
    for artifact in artifacts:
        if artifact.get("name") == "response":
            parts = artifact.get("parts", [])
            if parts:
                return parts[0].get("text", "")  # type: ignore[no-any-return]
    return ""


def assert_jsonrpc_response(response: dict[str, Any], expected_id: str | None = None) -> None:
    """Assert that response is a valid JSON-RPC 2.0 response.

    Reference: https://www.jsonrpc.org/specification#response_object
    """
    assert "jsonrpc" in response, "Missing jsonrpc field"
    assert response["jsonrpc"] == "2.0", f"Invalid jsonrpc version: {response['jsonrpc']}"
    assert "id" in response, "Missing id field"

    if expected_id:
        assert response["id"] == expected_id, f"ID mismatch: expected {expected_id}, got {response['id']}"

    # Response must have either result or error, but not both
    has_result = "result" in response
    has_error = "error" in response
    assert has_result or has_error, "Response must have either result or error"
    assert not (has_result and has_error), "Response cannot have both result and error"


def assert_jsonrpc_error(response: dict[str, Any], expected_code: int | None = None) -> None:
    """Assert that response is a valid JSON-RPC 2.0 error response.

    Reference: https://www.jsonrpc.org/specification#error_object
    """
    assert "error" in response, "Expected error response"
    error = response["error"]

    assert "code" in error, "Error missing code"
    assert "message" in error, "Error missing message"
    assert isinstance(error["code"], int), "Error code must be integer"
    assert isinstance(error["message"], str), "Error message must be string"

    if expected_code:
        assert error["code"] == expected_code, f"Expected error code {expected_code}, got {error['code']}"
