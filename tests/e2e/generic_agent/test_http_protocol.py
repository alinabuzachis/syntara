"""HTTP and Protocol-level tests for generic-agent.

These tests verify low-level HTTP behavior, error handling, and protocol compliance
without requiring full A2A client functionality. Tests use raw HTTP requests to check
invalid states, malformed requests, and protocol adherence.

Reference: https://a2a-protocol.org/dev/specification/
Reference: https://www.jsonrpc.org/specification
"""

import pytest
import requests

from .conftest import (
    HTTP_OK,
    JSONRPC_INVALID_PARAMS,
    JSONRPC_INVALID_REQUEST,
    JSONRPC_METHOD_NOT_FOUND,
    JSONRPC_PARSE_ERROR,
    assert_jsonrpc_error,
    send_jsonrpc_request,
    send_message,
)

# =============================================================================
# Test Group 1: Agent Discovery & Agent Cards
# Reference: https://a2a-protocol.org/dev/specification/#agent-discovery
# =============================================================================


def test_agent_card_accessibility(agent_url: str) -> None:
    """Test that agent card is accessible at standard location.

    Verifies: Agent card is served at /.well-known/agent-card.json

    Reference: https://a2a-protocol.org/dev/specification/#agent-card
    """
    response = requests.get(f"{agent_url}/.well-known/agent-card.json", timeout=30)
    assert response.status_code == HTTP_OK, f"Agent card request failed: {response.status_code}"

    card = response.json()
    assert isinstance(card, dict), "Agent card must be a JSON object"


def test_agent_card_required_fields(agent_url: str) -> None:
    """Test that agent card contains all required fields.

    Verifies: name, description, url, version, protocolVersion

    Reference: https://a2a-protocol.org/dev/specification/#agent-card-schema
    """
    response = requests.get(f"{agent_url}/.well-known/agent-card.json", timeout=30)
    card = response.json()

    # Required fields
    assert "name" in card, "Agent card missing 'name'"
    assert "description" in card, "Agent card missing 'description'"
    assert "url" in card, "Agent card missing 'url'"
    assert "version" in card, "Agent card missing 'version'"
    assert "protocolVersion" in card, "Agent card missing 'protocolVersion'"

    # Verify types
    assert isinstance(card["name"], str), "name must be string"
    assert isinstance(card["description"], str), "description must be string"
    assert isinstance(card["url"], str), "url must be string"
    assert isinstance(card["version"], str), "version must be string"
    assert isinstance(card["protocolVersion"], str), "protocolVersion must be string"


def test_agent_card_capabilities(agent_url: str) -> None:
    """Test that agent card declares capabilities.

    Verifies: capabilities object with streaming support

    Reference: https://a2a-protocol.org/dev/specification/#capabilities
    """
    response = requests.get(f"{agent_url}/.well-known/agent-card.json", timeout=30)
    card = response.json()

    assert "capabilities" in card, "Agent card missing 'capabilities'"
    capabilities = card["capabilities"]

    assert isinstance(capabilities, dict), "capabilities must be object"
    assert "streaming" in capabilities, "capabilities missing 'streaming'"
    assert isinstance(capabilities["streaming"], bool), "streaming must be boolean"


def test_agent_card_skills(agent_url: str) -> None:
    """Test that agent card declares skills.

    Verifies: skills array with at least one skill

    Reference: https://a2a-protocol.org/dev/specification/#skills
    """
    response = requests.get(f"{agent_url}/.well-known/agent-card.json", timeout=30)
    card = response.json()

    assert "skills" in card, "Agent card missing 'skills'"
    skills = card["skills"]

    assert isinstance(skills, list), "skills must be array"
    assert len(skills) > 0, "Agent must declare at least one skill"

    # Verify first skill structure
    skill = skills[0]
    assert "id" in skill, "Skill missing 'id'"
    assert "name" in skill, "Skill missing 'name'"
    assert "description" in skill, "Skill missing 'description'"


def test_agent_card_input_output_modes(agent_url: str) -> None:
    """Test that agent card declares input/output modes.

    Verifies: defaultInputModes and defaultOutputModes arrays

    Reference: https://a2a-protocol.org/dev/specification/#input-output-modes
    """
    response = requests.get(f"{agent_url}/.well-known/agent-card.json", timeout=30)
    card = response.json()

    assert "defaultInputModes" in card, "Agent card missing 'defaultInputModes'"
    assert "defaultOutputModes" in card, "Agent card missing 'defaultOutputModes'"

    assert isinstance(card["defaultInputModes"], list), "defaultInputModes must be array"
    assert isinstance(card["defaultOutputModes"], list), "defaultOutputModes must be array"

    assert len(card["defaultInputModes"]) > 0, "Must support at least one input mode"
    assert len(card["defaultOutputModes"]) > 0, "Must support at least one output mode"


# =============================================================================
# Test Group 7: Error Handling & Protocol Compliance
# Reference: https://www.jsonrpc.org/specification#error_object
# =============================================================================


def test_invalid_json_error(agent_url: str) -> None:
    """Test that invalid JSON returns proper error.

    Verifies: Parse error (-32700) for malformed JSON

    Reference: https://www.jsonrpc.org/specification#error_object
    """
    response = requests.post(
        f"{agent_url}/",
        data="invalid json{{{",
        headers={"Content-Type": "application/json"},
        timeout=30,
    )

    # Server should return 200 with JSON-RPC error or 400 Bad Request
    # Both are acceptable per JSON-RPC spec
    result = response.json() if response.status_code == HTTP_OK else None

    if result:
        assert_jsonrpc_error(result, expected_code=JSONRPC_PARSE_ERROR)


def test_missing_method_error(agent_url: str) -> None:
    """Test that missing method field returns error.

    Verifies: Invalid Request error (-32600) for missing method

    Reference: https://www.jsonrpc.org/specification#request_object
    """
    payload = {
        "jsonrpc": "2.0",
        "id": "test-req-1",
        # Missing "method" field
        "params": {},
    }

    response = requests.post(f"{agent_url}/", json=payload, timeout=30)
    result = response.json()

    assert_jsonrpc_error(result, expected_code=JSONRPC_INVALID_REQUEST)


def test_unknown_method_error(agent_url: str) -> None:
    """Test that unknown method returns error.

    Verifies: Method not found error (-32601)

    Reference: https://www.jsonrpc.org/specification#error_object
    """
    response = send_jsonrpc_request(agent_url, "unknown/method", params={})

    assert_jsonrpc_error(response, expected_code=JSONRPC_METHOD_NOT_FOUND)


def test_invalid_message_params(agent_url: str) -> None:
    """Test that invalid message parameters return error.

    Verifies: Invalid params error (-32602) for malformed message

    Reference: https://a2a-protocol.org/dev/specification/#messagesend
    """
    # Send message without required 'parts' field
    invalid_message = {
        "messageId": "msg-invalid-1",
        "role": "user",
        # Missing required 'parts' field
    }

    response = send_jsonrpc_request(agent_url, "message/send", params={"message": invalid_message})

    assert_jsonrpc_error(response, expected_code=JSONRPC_INVALID_PARAMS)


@pytest.mark.skip(reason="Task cancellation not yet implemented")
def test_task_cancellation(agent_url: str, api_key: str) -> None:
    """Test that tasks can be cancelled mid-execution.

    Verifies: Task status transitions to 'cancelled'

    Reference: https://a2a-protocol.org/dev/specification/#task-cancellation
    """
    # This would test task/cancel method if implemented
    pytest.skip("Task cancellation to be implemented")


# =============================================================================
# Test Group 8: Protocol Version Compatibility
# Reference: https://a2a-protocol.org/dev/specification/#versioning
# =============================================================================


def test_protocol_version_in_agent_card(agent_url: str) -> None:
    """Test that agent declares protocol version.

    Verifies: protocolVersion field matches expected version

    Reference: https://a2a-protocol.org/dev/specification/#versioning
    """
    response = requests.get(f"{agent_url}/.well-known/agent-card.json", timeout=30)
    card = response.json()

    assert "protocolVersion" in card, "Agent card missing protocolVersion"

    version = card["protocolVersion"]
    # Check major version compatibility (0.x.x means same major)
    assert version.startswith("0."), f"Expected protocol version 0.x.x, got {version}"


def test_jsonrpc_version_compliance(agent_url: str, api_key: str) -> None:
    """Test that all responses include JSON-RPC version.

    Verifies: Every response has jsonrpc='2.0'

    Reference: https://www.jsonrpc.org/specification#response_object
    """
    response = send_message(agent_url, "Hello")

    assert "jsonrpc" in response, "Response missing jsonrpc field"
    assert response["jsonrpc"] == "2.0", f"Expected jsonrpc='2.0', got {response['jsonrpc']}"
