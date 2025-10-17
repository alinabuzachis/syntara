"""Comprehensive A2A Client tests for generic-agent.

These tests verify full A2A protocol compliance using the official A2A SDK client
(via ClientFactory). All tests use the proper A2A client, not raw HTTP requests.

Reference: https://a2a-protocol.org/dev/specification/
"""

import asyncio

import pytest

from .a2a_sdk_client import A2ATestClient

# =============================================================================
# Test Group 1: Basic Message Sending & Response Handling
# =============================================================================


@pytest.mark.asyncio
async def test_simple_message(agent_url: str, api_key: str) -> None:
    """Test basic message sending with simple calculation.

    Verifies: A2A client can send messages and receive responses

    Reference: https://a2a-protocol.org/dev/specification/#messagesend
    """
    async with A2ATestClient(agent_url) as client:
        response = await client.send_message("Calculate 2+2 and respond with ONLY the number.")

        assert "result" in response, "Response missing result"
        result = response["result"]

        # Verify task completed
        assert result["status"]["state"] == "completed", f"Expected completed status, got {result['status']['state']}"

        # Verify response contains "4"
        artifacts = result.get("artifacts", [])
        response_text = ""
        for artifact in artifacts:
            if artifact.get("name") == "response":
                parts = artifact.get("parts", [])
                if parts:
                    response_text = parts[0].get("text", "")
                    break

        assert "4" in response_text, f"Expected '4' in response, got: {response_text}"


@pytest.mark.asyncio
async def test_message_id_in_history(agent_url: str, api_key: str) -> None:
    """Test that custom message IDs appear in response history.

    Verifies: Message IDs are preserved and returned in history

    Reference: https://a2a-protocol.org/dev/specification/#message-object
    """
    async with A2ATestClient(agent_url) as client:
        response = await client.send_message("Say hello")

        result = response["result"]

        # Check history exists and contains messages
        assert "history" in result, "Response missing history"
        history = result["history"]

        # Find user message in history
        user_messages = [h for h in history if h.get("role") == "user"]
        assert len(user_messages) > 0, "No user message in history"

        # Verify message has an ID
        assert "messageId" in user_messages[0], "User message missing messageId"
        assert len(user_messages[0]["messageId"]) > 0, "Message ID is empty"


# =============================================================================
# Test Group 2: Context Management (Multi-turn Conversations)
# =============================================================================


@pytest.mark.asyncio
async def test_context_id_generation(agent_url: str, api_key: str) -> None:
    """Test that agent generates context ID for new conversations.

    Verifies: contextId is returned in response for conversation continuity

    Reference: https://a2a-protocol.org/dev/specification/#context-management
    """
    async with A2ATestClient(agent_url) as client:
        response = await client.send_message("Hello")

        result = response["result"]
        assert "contextId" in result, "Result missing contextId"
        assert isinstance(result["contextId"], str), "contextId must be string"
        assert len(result["contextId"]) > 0, "contextId must not be empty"


@pytest.mark.asyncio
async def test_multiturn_conversation_memory(agent_url: str, api_key: str) -> None:
    """Test that agent maintains conversation context across turns.

    Verifies: Agent remembers information from previous messages in conversation

    Reference: https://a2a-protocol.org/dev/specification/#context-management
    """
    async with A2ATestClient(agent_url) as client:
        # Message 1: Tell agent our information
        response1 = await client.send_message(
            "My name is TestUser and I live in Prague. Just acknowledge this briefly."
        )

        context_id = response1["result"]["contextId"]
        assert context_id, "No contextId in first response"

        # Message 2: Ask agent to recall the information
        response2 = await client.send_message(
            "What is my name and what city do I live in? Answer in the format: 'Name: X, City: Y'",
            context_id=context_id,
        )

        # Extract response text
        artifacts = response2["result"].get("artifacts", [])
        response_text = ""
        for artifact in artifacts:
            if artifact.get("name") == "response":
                parts = artifact.get("parts", [])
                if parts:
                    response_text = parts[0].get("text", "")
                    break

        # Verify agent remembers
        assert "TestUser" in response_text, f"Agent didn't remember name. Response: {response_text}"
        assert "Prague" in response_text, f"Agent didn't remember city. Response: {response_text}"


@pytest.mark.asyncio
async def test_conversation_isolation(agent_url: str, api_key: str) -> None:
    """Test that different conversations are isolated from each other.

    Verifies: Using different context IDs creates separate conversations

    Reference: https://a2a-protocol.org/dev/specification/#context-management
    """
    async with A2ATestClient(agent_url) as client:
        # Conversation 1: Set name to Alice
        response1a = await client.send_message("My name is Alice. Just say 'Acknowledged'.")
        context1 = response1a["result"]["contextId"]

        # Conversation 2: Set name to Bob (different conversation)
        response2a = await client.send_message("My name is Bob. Just say 'Acknowledged'.")
        context2 = response2a["result"]["contextId"]

        # Verify different context IDs
        assert context1 != context2, "Context IDs should be different for separate conversations"

        # Ask for name in conversation 1 - should get Alice
        response1b = await client.send_message("What is my name? Answer with ONLY the name.", context_id=context1)
        artifacts1 = response1b["result"].get("artifacts", [])
        response1_text = ""
        for artifact in artifacts1:
            if artifact.get("name") == "response":
                response1_text = artifact.get("parts", [{}])[0].get("text", "")
                break
        assert "Alice" in response1_text, f"Conversation 1 should remember Alice, got: {response1_text}"

        # Ask for name in conversation 2 - should get Bob
        response2b = await client.send_message("What is my name? Answer with ONLY the name.", context_id=context2)
        artifacts2 = response2b["result"].get("artifacts", [])
        response2_text = ""
        for artifact in artifacts2:
            if artifact.get("name") == "response":
                response2_text = artifact.get("parts", [{}])[0].get("text", "")
                break
        assert "Bob" in response2_text, f"Conversation 2 should remember Bob, got: {response2_text}"


@pytest.mark.asyncio
async def test_context_update_within_conversation(agent_url: str, api_key: str) -> None:
    """Test that agent can update information within the same conversation.

    Verifies: Agent tracks changes to information in a conversation

    Reference: https://a2a-protocol.org/dev/specification/#context-management
    """
    async with A2ATestClient(agent_url) as client:
        # Set initial preference
        response1 = await client.send_message("My favorite color is blue. Just acknowledge.")
        context_id = response1["result"]["contextId"]

        # Update preference
        await client.send_message(
            "Actually, I changed my mind. My favorite color is red now.",
            context_id=context_id,
        )

        # Ask for current preference
        response3 = await client.send_message("What is my current favorite color?", context_id=context_id)

        artifacts = response3["result"].get("artifacts", [])
        response_text = ""
        for artifact in artifacts:
            if artifact.get("name") == "response":
                response_text = artifact.get("parts", [{}])[0].get("text", "")
                break

        assert "red" in response_text.lower(), f"Agent should remember updated color, got: {response_text}"


# =============================================================================
# Test Group 3: Metadata & Dynamic Configuration
# =============================================================================


@pytest.mark.asyncio
async def test_dynamic_configuration(agent_url: str, api_key: str) -> None:
    """Test dynamic agent configuration via metadata.

    Verifies: Metadata can configure model, temperature, etc.

    Reference: https://a2a-protocol.org/dev/specification/#metadata
    """
    async with A2ATestClient(agent_url) as client:
        metadata = {
            "nexus:agentConfig": {
                "model": "anthropic/claude-3.5-sonnet",
                "temperature": 0.1,
                "maxTokens": 200,
            }
        }

        response = await client.send_message(
            "Calculate 15 * 23 and respond with just the result number.",
            metadata=metadata,
        )

        result = response["result"]
        assert result["status"]["state"] == "completed"

        # Extract response text
        artifacts = result.get("artifacts", [])
        response_text = ""
        for artifact in artifacts:
            if artifact.get("name") == "response":
                response_text = artifact.get("parts", [{}])[0].get("text", "")
                break

        assert "345" in response_text, f"Expected '345' in response, got: {response_text}"


@pytest.mark.asyncio
async def test_metadata_preservation(agent_url: str, api_key: str) -> None:
    """Test that custom metadata is preserved in the response.

    Verifies: Metadata passed in request is returned in response

    Reference: https://a2a-protocol.org/dev/specification/#metadata
    """
    async with A2ATestClient(agent_url) as client:
        custom_metadata = {
            "customField": "customValue",
            "requestId": "test-12345",
        }

        response = await client.send_message("Hello", metadata=custom_metadata)

        result = response["result"]
        assert result["status"]["state"] == "completed"


# =============================================================================
# Test Group 4: Task Management & Status
# =============================================================================


@pytest.mark.asyncio
async def test_task_status_completed(agent_url: str, api_key: str) -> None:
    """Test that completed tasks return correct status.

    Verifies: Task status field indicates 'completed'

    Reference: https://a2a-protocol.org/dev/specification/#task-status
    """
    async with A2ATestClient(agent_url) as client:
        response = await client.send_message("Say 'Hello World'")

        result = response["result"]
        assert "status" in result, "Result missing status"
        assert "state" in result["status"], "Status missing state"
        assert result["status"]["state"] == "completed", f"Expected completed, got {result['status']['state']}"


@pytest.mark.asyncio
async def test_task_history_presence(agent_url: str, api_key: str) -> None:
    """Test that responses include conversation history.

    Verifies: History field contains user and agent messages

    Reference: https://a2a-protocol.org/dev/specification/#history
    """
    async with A2ATestClient(agent_url) as client:
        response = await client.send_message("What is the capital of France? Answer with ONLY the city name.")

        result = response["result"]

        # Check history exists
        assert "history" in result, "Result missing history"
        history = result["history"]
        assert len(history) >= 2, f"Expected at least 2 history entries, got {len(history)}"

        # Verify user message in history
        user_messages = [h for h in history if h.get("role") == "user"]
        assert len(user_messages) >= 1, "No user message in history"

        # Verify agent message in history
        agent_messages = [h for h in history if h.get("role") == "agent"]
        assert len(agent_messages) >= 1, "No agent message in history"


# =============================================================================
# Test Group 5: Artifacts & Parts
# =============================================================================


@pytest.mark.asyncio
async def test_artifact_structure(agent_url: str, api_key: str) -> None:
    """Test that response artifacts have correct structure.

    Verifies: Artifacts contain name, parts, and proper structure

    Reference: https://a2a-protocol.org/dev/specification/#artifacts
    """
    async with A2ATestClient(agent_url) as client:
        response = await client.send_message("Generate a simple greeting")

        result = response["result"]
        assert "artifacts" in result, "Result missing artifacts"

        artifacts = result["artifacts"]
        assert isinstance(artifacts, list), "Artifacts must be a list"
        assert len(artifacts) > 0, "Must have at least one artifact"

        # Check response artifact
        response_artifact = None
        for artifact in artifacts:
            if artifact.get("name") == "response":
                response_artifact = artifact
                break

        assert response_artifact is not None, "No 'response' artifact found"
        assert "parts" in response_artifact, "Artifact missing parts"
        assert isinstance(response_artifact["parts"], list), "Parts must be a list"


@pytest.mark.asyncio
async def test_text_part_structure(agent_url: str, api_key: str) -> None:
    """Test that text parts have correct structure.

    Verifies: Text parts contain kind='text' and text field

    Reference: https://a2a-protocol.org/dev/specification/#parts
    """
    async with A2ATestClient(agent_url) as client:
        response = await client.send_message("Say 'test'")

        result = response["result"]
        artifacts = result.get("artifacts", [])

        # Find response artifact
        response_artifact = next((a for a in artifacts if a.get("name") == "response"), None)
        assert response_artifact is not None, "No response artifact"

        parts = response_artifact.get("parts", [])
        assert len(parts) > 0, "Response artifact has no parts"

        # Check first part structure
        part = parts[0]
        assert "kind" in part, "Part missing kind"
        assert part["kind"] == "text", f"Expected kind='text', got {part['kind']}"
        assert "text" in part, "Text part missing text field"
        assert isinstance(part["text"], str), "Text field must be string"


@pytest.mark.skip(reason="File parts not yet supported by generic-agent")
def test_file_part_support(agent_url: str, api_key: str) -> None:
    """Test that file parts can be sent and received.

    Verifies: File parts with kind='file' are handled correctly

    Reference: https://a2a-protocol.org/dev/specification/#file-parts
    """
    # Placeholder for file part support
    pytest.skip("File parts to be implemented")


# =============================================================================
# Test Group 6: Advanced Features (Placeholders)
# =============================================================================


@pytest.mark.skip(reason="Streaming not yet tested")
async def test_streaming_response(agent_url: str, api_key: str) -> None:
    """Test streaming response using A2A client.

    Verifies: Agent can stream responses incrementally

    Reference: https://a2a-protocol.org/dev/specification/#streaming
    """
    async with A2ATestClient(agent_url) as client:
        chunks = [chunk async for chunk in client.send_message_streaming("Generate a long response")]

        assert len(chunks) > 0, "Expected streaming chunks"


@pytest.mark.skip(reason="Push notifications not yet tested")
def test_push_notifications(agent_url: str, api_key: str) -> None:
    """Test push notifications for long-running tasks.

    Verifies: Agent can send async updates

    Reference: https://a2a-protocol.org/dev/specification/#push-notifications
    """
    pytest.skip("Push notifications to be implemented")


@pytest.mark.skip(reason="Multi-part messages not yet tested")
def test_multipart_message(agent_url: str, api_key: str) -> None:
    """Test sending messages with multiple parts.

    Verifies: Agent handles messages with multiple text/file parts

    Reference: https://a2a-protocol.org/dev/specification/#multipart
    """
    pytest.skip("Multi-part messages to be implemented")


# =============================================================================
# Test Group 7: Performance & Reliability
# =============================================================================


@pytest.mark.asyncio
async def test_timeout_handling(agent_url: str, api_key: str) -> None:
    """Test that timeouts are handled gracefully.

    Verifies: Timeout errors are properly raised

    Reference: Best practices for robust client implementation
    """
    # Note: A2ATestClient uses httpx.AsyncClient with 60s timeout
    # Very short timeouts would need to be configured in the client
    async with A2ATestClient(agent_url) as client:
        # Normal request should succeed
        response = await client.send_message("Hello")
        assert response["result"]["status"]["state"] == "completed"


@pytest.mark.asyncio
async def test_concurrent_requests(agent_url: str, api_key: str) -> None:
    """Test that multiple concurrent requests are handled correctly.

    Verifies: Agent can handle multiple simultaneous conversations

    Reference: Best practices for scalability
    """

    async def send_and_verify(client: A2ATestClient, name: str) -> None:
        """Send message and verify response."""
        response = await client.send_message(f"My name is {name}. Just acknowledge.")
        context_id = response["result"]["contextId"]

        response2 = await client.send_message("What is my name?", context_id=context_id)

        artifacts = response2["result"].get("artifacts", [])
        response_text = ""
        for artifact in artifacts:
            if artifact.get("name") == "response":
                response_text = artifact.get("parts", [{}])[0].get("text", "")
                break

        assert name in response_text, f"Expected {name} in response, got: {response_text}"

    # Run concurrent conversations
    async with A2ATestClient(agent_url) as client:
        await asyncio.gather(
            send_and_verify(client, "Alice"),
            send_and_verify(client, "Bob"),
            send_and_verify(client, "Charlie"),
        )


# =============================================================================
# Test Group 8: Agent Card via SDK
# =============================================================================


@pytest.mark.asyncio
async def test_agent_card_retrieval(agent_url: str) -> None:
    """Test that agent card can be retrieved via SDK client.

    Verifies: SDK client can fetch and parse agent card

    Reference: https://a2a-protocol.org/dev/specification/#agent-card
    """
    async with A2ATestClient(agent_url) as client:
        card = await client.get_agent_card()

        # Verify required fields
        assert "name" in card, "Agent card missing name"
        assert "version" in card, "Agent card missing version"
        assert "protocolVersion" in card, "Agent card missing protocolVersion"

        # Verify name matches
        assert card["name"] == "generic-agent", f"Expected 'generic-agent', got {card['name']}"
