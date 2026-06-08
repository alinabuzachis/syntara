"""Integration tests for WebSocket JSON validation.

This module tests that WebSocket endpoints properly handle invalid JSON input
by returning appropriate error responses.
"""

import time
from datetime import UTC, datetime

from starlette.testclient import TestClient

from nexus.core.websocket.manager import get_connection_lifecycle_manager


class TestWebSocketJsonValidation:
    """Tests for WebSocket JSON validation error handling."""

    def test_non_json_text_input_chat_endpoint(self, sync_test_client: TestClient) -> None:
        """Test that non-JSON text input returns validation error on chat endpoint."""
        with sync_test_client.websocket_connect("/ws/example/v1/chat") as websocket:
            # Send non-JSON text
            websocket.send_text("asd")

            # Receive error response
            response = websocket.receive_json()

            # Verify error structure
            assert "error" in response
            assert "message" in response
            assert "timestamp" in response

            # Verify error type
            assert response["error"] == "INVALID_REQUEST"

            # Verify message contains indication of JSON error
            assert "JSON" in response["message"] or "json" in response["message"]

            # Verify timestamp is valid ISO format
            timestamp = datetime.fromisoformat(response["timestamp"])
            assert timestamp.tzinfo is not None

    def ***REMOVED***(self, sync_test_client: TestClient) -> None:
        """Test that non-JSON text input returns validation error on coffee endpoint."""
        with sync_test_client.websocket_connect("/ws/example/v1/coffee") as websocket:
            # Send non-JSON text
            websocket.send_text("invalid input")

            # Receive error response
            response = websocket.receive_json()

            # Verify error structure
            assert "error" in response
            assert "message" in response
            assert "timestamp" in response

            # Verify error type
            assert response["error"] == "INVALID_REQUEST"

    def test_malformed_json_missing_quote(self, sync_test_client: TestClient) -> None:
        """Test that malformed JSON (missing quote) returns validation error."""
        with sync_test_client.websocket_connect("/ws/example/v1/chat") as websocket:
            # Send malformed JSON (missing closing quote)
            websocket.send_text('{"message": "hello}')

            # Receive error response
            response = websocket.receive_json()

            # Verify error structure
            assert "error" in response
            assert response["error"] == "INVALID_REQUEST"
            assert "message" in response
            assert "timestamp" in response

    def test_malformed_json_invalid_structure(self, sync_test_client: TestClient) -> None:
        """Test that malformed JSON (invalid structure) returns validation error."""
        with sync_test_client.websocket_connect("/ws/example/v1/chat") as websocket:
            # Send malformed JSON (invalid structure)
            websocket.send_text("{invalid}")

            # Receive error response
            response = websocket.receive_json()

            # Verify error structure
            assert "error" in response
            assert response["error"] == "INVALID_REQUEST"
            assert "message" in response
            assert "timestamp" in response

    def test_connection_continues_after_json_error(self, sync_test_client: TestClient) -> None:
        """Test that WebSocket connection continues after JSON validation error."""
        with sync_test_client.websocket_connect("/ws/example/v1/chat") as websocket:
            # Send invalid JSON
            websocket.send_text("invalid")

            # Receive error response
            error_response = websocket.receive_json()
            assert error_response["error"] == "INVALID_REQUEST"

            # Connection should still be active - send valid message
            websocket.send_json({"message": "hello"})

            # Should receive valid response (uppercase echo)
            # Note: May also receive random server messages, so we need to filter
            response = websocket.receive_json()

            # Could be either echo or random message
            assert "reply" in response
            assert "type" in response

            # If it's an echo, verify it
            if response["type"] == "echo":
                assert response["reply"] == "HELLO"

    def test_multiple_json_errors_in_sequence(self, sync_test_client: TestClient) -> None:
        """Test that multiple JSON errors can be handled in sequence."""
        with sync_test_client.websocket_connect("/ws/example/v1/chat") as websocket:
            # Send multiple invalid JSON messages
            for i in range(3):
                websocket.send_text(f"invalid{i}")

                # Each should get an error response
                response = websocket.receive_json()
                assert response["error"] == "INVALID_REQUEST"
                assert "timestamp" in response

            # Connection should still work with valid message
            websocket.send_json({"message": "test"})
            response = websocket.receive_json()
            assert "reply" in response

    def test_empty_string_as_json(self, sync_test_client: TestClient) -> None:
        """Test that empty string returns JSON validation error."""
        with sync_test_client.websocket_connect("/ws/example/v1/chat") as websocket:
            # Send empty string
            websocket.send_text("")

            # Receive error response
            response = websocket.receive_json()

            # Verify error structure
            assert "error" in response
            assert response["error"] == "INVALID_REQUEST"
            assert "message" in response
            assert "timestamp" in response

    def test_json_error_timestamp_is_recent(self, sync_test_client: TestClient) -> None:
        """Test that error timestamp is recent and in correct timezone."""
        with sync_test_client.websocket_connect("/ws/example/v1/chat") as websocket:
            # Record time before sending
            before = datetime.now(UTC)

            # Send invalid JSON
            websocket.send_text("invalid")

            # Receive error response
            response = websocket.receive_json()

            # Record time after receiving
            after = datetime.now(UTC)

            # Parse timestamp from response
            error_timestamp = datetime.fromisoformat(response["timestamp"])

            # Verify timestamp is between before and after
            assert before <= error_timestamp <= after

            # Verify timezone is set
            assert error_timestamp.tzinfo is not None

    def test_error_message_contains_useful_information(self, sync_test_client: TestClient) -> None:
        """Test that error message contains useful debugging information."""
        with sync_test_client.websocket_connect("/ws/example/v1/chat") as websocket:
            # Send invalid JSON
            websocket.send_text("{bad json}")

            # Receive error response
            response = websocket.receive_json()

            # Verify message is not empty and contains useful info
            assert response["message"]
            assert len(response["message"]) > 0

            # Should mention JSON or format issue
            message_lower = response["message"].lower()
            assert any(keyword in message_lower for keyword in ["json", "format", "invalid", "parse", "decode"])

    def test_validation_error_updates_activity_timestamp(self, sync_test_client: TestClient) -> None:
        """Test that ValidationError updates the lifecycle manager activity timestamp.

        This verifies that even invalid JSON messages count as connection activity,
        which is correct since receiving data (even malformed) proves the connection is alive.
        """
        lifecycle_manager = get_connection_lifecycle_manager()

        with sync_test_client.websocket_connect("/ws/example/v1/chat") as websocket:
            # Send valid message first to establish connection
            websocket.send_json({"message": "hello"})
            websocket.receive_json()

            # Get connections for the chat channel
            active_connections = lifecycle_manager.get_connections_for_channel("chat")
            assert len(active_connections) >= 1

            # Get the connection for this channel
            conn_info = active_connections[0]
            initial_activity = conn_info.last_activity_at

            # Wait a bit to ensure timestamp would change
            time.sleep(0.1)

            # Send invalid JSON to trigger ValidationError
            websocket.send_text("invalid json")

            # Receive error response
            error_response = websocket.receive_json()
            assert error_response["error"] == "INVALID_REQUEST"

            # Verify activity timestamp was updated even though message was invalid
            updated_conn_info = lifecycle_manager.get_connection(conn_info.connection_id)
            assert updated_conn_info is not None
            assert updated_conn_info.last_activity_at > initial_activity, (
                "Activity timestamp should be updated when ValidationError occurs, "
                "since receiving any data indicates the connection is alive"
            )
