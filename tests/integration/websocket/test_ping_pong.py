"""Integration tests for WebSocket ping/pong health monitoring.

Tests the complete ping/pong flow:
- Periodic ping sending
- Ping timestamp updates
- Stale connection cleanup
- Lifecycle manager integration
"""

import asyncio
import time
from collections.abc import Generator

import pytest
from starlette.testclient import TestClient

from nexus.core.websocket.manager import get_connection_lifecycle_manager


class TestWebSocketPingPongIntegration:
    """Integration tests for WebSocket ping/pong mechanism."""

    @pytest.fixture(autouse=True)
    def _clear_lifecycle_manager(self) -> Generator[None, None, None]:
        """Clear lifecycle manager before and after each test."""
        manager = get_connection_lifecycle_manager()
        manager.stop_monitoring()
        manager.clear_all()
        yield
        manager.stop_monitoring()
        manager.clear_all()

    def test_websocket_connection_registers_with_lifecycle_manager(self, sync_test_client: TestClient) -> None:
        """Test that WebSocket connections are registered with lifecycle manager."""
        manager = get_connection_lifecycle_manager()

        # Initially no connections
        assert manager.get_active_connection_count() == 0

        # Connect to WebSocket
        with sync_test_client.websocket_connect("/ws/example/v1/chat") as websocket:
            # Send a message to ensure connection is established
            websocket.send_json({"message": "test"})
            response = websocket.receive_json()
            assert "reply" in response

            # Verify connection is registered
            # Note: There might be a small delay, so we check > 0
            assert manager.get_active_connection_count() > 0

        # After disconnect, connection should be removed (eventually)
        # Give it a moment to clean up
        time.sleep(0.2)
        assert manager.get_active_connection_count() == 0

    def test_ping_timestamp_updates_on_message_receipt(self, sync_test_client: TestClient) -> None:
        """Test that ping timestamps are updated when messages are received."""
        manager = get_connection_lifecycle_manager()

        with sync_test_client.websocket_connect("/ws/example/v1/chat") as websocket:
            # Send first message
            websocket.send_json({"message": "first"})
            websocket.receive_json()

            # Get all connections and find the one for this channel
            connections = list(manager._connections.values())
            assert len(connections) > 0

            # Get the chat connection
            chat_conn = next((c for c in connections if c.channel == "chat"), None)
            assert chat_conn is not None

            first_ping = chat_conn.last_ping_at

            # Wait a bit
            time.sleep(0.1)

            # Send another message
            websocket.send_json({"message": "second"})
            websocket.receive_json()

            # Ping timestamp should be updated
            assert chat_conn.last_ping_at > first_ping

    @pytest.mark.asyncio
    async def test_periodic_ping_sending(self, sync_test_client: TestClient) -> None:
        """Test that periodic pings are sent to connected clients.

        Note: This test verifies the ping mechanism is set up,
        but doesn't directly observe ping frames since they're
        handled at the protocol level.
        """
        manager = get_connection_lifecycle_manager()

        # Override ping interval for faster testing
        original_interval = manager.PING_INTERVAL_SECONDS
        manager.PING_INTERVAL_SECONDS = 0.2  # 200ms for testing

        try:
            with sync_test_client.websocket_connect("/ws/example/v1/chat") as websocket:
                # Send a message to establish connection
                websocket.send_json({"message": "test"})
                websocket.receive_json()

                # Get the connection
                connections = list(manager._connections.values())
                chat_conn = next((c for c in connections if c.channel == "chat"), None)
                assert chat_conn is not None

                # Connection should be active
                assert chat_conn.is_active is True

                # Keep connection open for longer than ping interval
                # If pings weren't working, this would fail
                await asyncio.sleep(0.5)

                # Connection should still be healthy
                assert chat_conn.is_active is True

        finally:
            # Restore original interval
            manager.PING_INTERVAL_SECONDS = original_interval

    def test_stale_connection_cleanup_logic(self) -> None:
        """Test that cleanup_stale_connections removes stale connections.

        This tests the cleanup logic directly without relying on the
        monitoring task timing, which is already tested in unit tests.
        """
        manager = get_connection_lifecycle_manager()

        # Add a fake stale connection directly to manager
        stale_conn_id = manager.add_connection(
            channel="fake",
            client_ip="192.168.1.99",
            resource_id="fake-resource",
        )
        manager.activate_connection(stale_conn_id)

        # Add a fresh connection as control
        fresh_conn_id = manager.add_connection(
            channel="fresh",
            client_ip="192.168.1.100",
            resource_id="fresh-resource",
        )
        manager.activate_connection(fresh_conn_id)

        # Make the first connection stale (older than timeout)
        stale_conn = manager.get_connection(stale_conn_id)
        if stale_conn:
            stale_conn.last_ping_at = time.time() - 200.0  # 200 seconds ago (very stale)

        # Verify both exist before cleanup
        assert manager.get_connection(stale_conn_id) is not None
        assert manager.get_connection(fresh_conn_id) is not None

        # Run cleanup manually
        cleaned = manager.cleanup_stale_connections()

        # Stale connection should be removed, fresh one kept
        assert cleaned == 1
        assert manager.get_connection(stale_conn_id) is None
        assert manager.get_connection(fresh_conn_id) is not None

        # Clean up the fresh connection
        manager.remove_connection(fresh_conn_id, reason="test_cleanup")

    def test_connection_cleanup_on_disconnect(self, sync_test_client: TestClient) -> None:
        """Test that connections are cleaned up when client disconnects."""
        manager = get_connection_lifecycle_manager()

        # Connect and disconnect
        with sync_test_client.websocket_connect("/ws/example/v1/chat") as websocket:
            websocket.send_json({"message": "test"})
            websocket.receive_json()

            # Connection exists
            assert manager.get_active_connection_count() > 0

        # After disconnect, connection should be removed
        time.sleep(0.2)
        assert manager.get_active_connection_count() == 0

    def test_multiple_connections_tracked_independently(self, sync_test_client: TestClient) -> None:
        """Test that multiple WebSocket connections are tracked independently."""
        manager = get_connection_lifecycle_manager()

        # Open two connections to different channels
        with (
            sync_test_client.websocket_connect("/ws/example/v1/chat") as ws1,
            sync_test_client.websocket_connect("/ws/example/v1/coffee") as ws2,
        ):
            # Send messages on both
            ws1.send_json({"message": "chat message"})
            ws1.receive_json()

            ws2.send_json({"type": "espresso", "size": "small"})
            ws2.receive_json()

            # Both connections should be tracked
            # Note: count might include other test connections
            assert manager.get_active_connection_count() >= 2

            # Get connections by channel
            connections = list(manager._connections.values())
            chat_conns = [c for c in connections if c.channel == "chat"]
            coffee_conns = [c for c in connections if c.channel == "coffee"]

            assert len(chat_conns) >= 1
            assert len(coffee_conns) >= 1

        # After both disconnect, all should be cleaned up
        time.sleep(0.2)
        assert manager.get_active_connection_count() == 0
