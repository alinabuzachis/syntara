"""Tests for WebSocket connection lifecycle manager.

Simplified test suite focusing on:
- Health check business logic (healthy vs stale)
- Cleanup algorithm
- Multiple clients tracking for same resource
- Monitoring task lifecycle
- Periodic ping timestamp updates
"""

import asyncio
import time
from collections.abc import AsyncGenerator, Generator
from uuid import uuid4

import pytest

from nexus.core.websocket.manager import (
    WebSocketConnectionInfo,
    WebSocketConnectionLifecycleManager,
)


class TestWebSocketConnectionHealth:
    """Tests for connection health check business logic."""

    def test_check_health_healthy(self) -> None:
        """Test health check returns True for healthy connection."""
        info = WebSocketConnectionInfo(
            connection_id=uuid4(),
            channel="test",
            client_ip="192.168.1.1",
        )

        assert info.check_health(timeout_seconds=60) is True
        assert info.is_active is True

    def test_check_health_stale(self) -> None:
        """Test health check returns False and marks inactive for stale connection."""
        info = WebSocketConnectionInfo(
            connection_id=uuid4(),
            channel="test",
            client_ip="192.168.1.1",
        )

        # Set last_ping_at to old timestamp
        info.last_ping_at = time.time() - 100  # 100 seconds ago

        assert info.check_health(timeout_seconds=60) is False
        assert info.is_active is False


class TestWebSocketConnectionLifecycleManager:
    """Tests for WebSocketConnectionLifecycleManager business logic."""

    @pytest.fixture(autouse=True)
    def _setup_and_teardown(self) -> Generator[None, None, None]:
        """Clear manager state before and after each test."""
        manager = WebSocketConnectionLifecycleManager()
        manager.clear_all()
        yield
        manager.clear_all()

    def test_cleanup_stale_connections(self) -> None:
        """Test cleanup removes stale connections but keeps fresh ones."""
        manager = WebSocketConnectionLifecycleManager()

        # Create fresh connection
        fresh_conn_id = manager.add_connection(
            channel="invocations",
            resource_id="fresh-resource",
            client_ip="192.168.1.1",
        )

        # Create stale connection
        stale_conn_id = manager.add_connection(
            channel="invocations",
            resource_id="stale-resource",
            client_ip="192.168.1.2",
        )

        # Make the stale connection old
        stale_info = manager.get_connection(stale_conn_id)
        if stale_info:
            stale_info.last_ping_at = time.time() - 200  # 200 seconds ago

        # Cleanup stale connections
        removed = manager.cleanup_stale_connections()

        # Verify stale removed, fresh kept
        assert removed == 1
        assert manager.get_connection(fresh_conn_id) is not None
        assert manager.get_connection(stale_conn_id) is None

    def test_multiple_clients_same_resource(self) -> None:
        """Test multiple clients can track the same resource."""
        manager = WebSocketConnectionLifecycleManager()

        resource_id = str(uuid4())

        # Add two connections for same resource
        conn_id1 = manager.add_connection(
            channel="invocations",
            resource_id=resource_id,
            client_ip="192.168.1.1",
        )

        conn_id2 = manager.add_connection(
            channel="invocations",
            resource_id=resource_id,
            client_ip="192.168.1.2",
        )

        # Both connections should be tracked for the resource
        assert manager.get_active_connection_count_for_resource(resource_id) == 2

        connections = manager.get_connections_for_resource(resource_id)
        assert len(connections) == 2
        assert conn_id1 in [c.connection_id for c in connections]
        assert conn_id2 in [c.connection_id for c in connections]


class TestMonitoringTaskLifecycle:
    """Tests for monitoring task start/stop lifecycle."""

    @pytest.fixture(autouse=True)
    async def _setup_and_teardown(self) -> AsyncGenerator[None, None]:
        """Clear manager state and stop monitoring before and after each test."""
        manager = WebSocketConnectionLifecycleManager()

        # Ensure monitoring is stopped and task is cancelled
        manager.stop_monitoring()
        if manager._monitoring_task and not manager._monitoring_task.done():
            try:
                await asyncio.wait_for(manager._monitoring_task, timeout=2.0)
            except (TimeoutError, asyncio.CancelledError):
                pass

        manager.clear_all()

        yield

        # Cleanup after test
        manager.stop_monitoring()
        if manager._monitoring_task and not manager._monitoring_task.done():
            try:
                await asyncio.wait_for(manager._monitoring_task, timeout=2.0)
            except (TimeoutError, asyncio.CancelledError):
                pass

        manager.clear_all()

    @pytest.mark.asyncio
    async def test_start_monitoring_creates_task(self) -> None:
        """Test that start_monitoring creates a background task."""
        manager = WebSocketConnectionLifecycleManager()

        # Start monitoring
        manager.start_monitoring()

        # Verify task was created
        assert manager._monitoring_task is not None
        assert not manager._monitoring_task.done()

        # Clean up
        manager.stop_monitoring()
        await asyncio.sleep(0.1)  # Give task time to cancel

    @pytest.mark.asyncio
    async def test_stop_monitoring_cancels_task(self) -> None:
        """Test that stop_monitoring cancels the background task."""
        manager = WebSocketConnectionLifecycleManager()

        # Start and then stop monitoring
        manager.start_monitoring()
        task = manager._monitoring_task
        assert task is not None
        assert not task.done()

        manager.stop_monitoring()

        # Give event loop time to process cancellation
        await asyncio.sleep(0)

        # Task reference should be reset to None
        assert manager._monitoring_task is None

        # Original task should be cancelled
        assert task.done()
        assert task.cancelled()

    @pytest.mark.asyncio
    async def test_start_monitoring_twice_does_not_create_duplicate_task(self) -> None:
        """Test that calling start_monitoring twice doesn't create duplicate tasks."""
        manager = WebSocketConnectionLifecycleManager()

        # Start monitoring twice
        manager.start_monitoring()
        first_task = manager._monitoring_task

        manager.start_monitoring()
        second_task = manager._monitoring_task

        # Should be the same task
        assert first_task is second_task

        # Clean up
        manager.stop_monitoring()
        await asyncio.sleep(0.1)

    @pytest.mark.asyncio
    async def test_monitoring_task_runs_cleanup_periodically(self) -> None:
        """Test that monitoring task runs cleanup on stale connections."""
        manager = WebSocketConnectionLifecycleManager()

        # Override ping interval for faster testing
        original_interval = manager.PING_INTERVAL_SECONDS
        manager.PING_INTERVAL_SECONDS = 0.1  # 100ms for testing

        try:
            # Create a stale connection
            conn_id = manager.add_connection(
                channel="test",
                client_ip="192.168.1.1",
                resource_id="test-resource",
            )

            # Make it stale
            conn_info = manager.get_connection(conn_id)
            if conn_info:
                conn_info.last_ping_at = time.time() - 200  # 200 seconds ago

            # Start monitoring
            manager.start_monitoring()

            # Wait for at least one cleanup cycle
            await asyncio.sleep(0.3)

            # Verify stale connection was cleaned up
            assert manager.get_connection(conn_id) is None

        finally:
            # Restore original interval
            manager.PING_INTERVAL_SECONDS = original_interval
            manager.stop_monitoring()


class TestPingTimestampUpdates:
    """Tests for ping timestamp update functionality."""

    @pytest.fixture(autouse=True)
    def _setup_and_teardown(self) -> Generator[None, None, None]:
        """Clear manager state before and after each test."""
        manager = WebSocketConnectionLifecycleManager()
        manager.clear_all()
        yield
        manager.clear_all()

    def test_update_ping_refreshes_timestamp(self) -> None:
        """Test that update_ping refreshes the last_ping_at timestamp."""
        manager = WebSocketConnectionLifecycleManager()

        conn_id = manager.add_connection(
            channel="test",
            client_ip="192.168.1.1",
        )

        # Get initial timestamp
        conn_info = manager.get_connection(conn_id)
        assert conn_info is not None
        initial_ping = conn_info.last_ping_at

        # Wait a bit
        time.sleep(0.1)

        # Update ping
        manager.update_ping(conn_id)

        # Verify timestamp was updated
        updated_info = manager.get_connection(conn_id)
        assert updated_info is not None
        assert updated_info.last_ping_at > initial_ping

    def test_update_ping_marks_connection_active(self) -> None:
        """Test that update_ping marks connection as active."""
        manager = WebSocketConnectionLifecycleManager()

        conn_id = manager.add_connection(
            channel="test",
            client_ip="192.168.1.1",
        )

        # Make connection inactive
        conn_info = manager.get_connection(conn_id)
        if conn_info:
            conn_info.is_active = False
            conn_info.last_ping_at = time.time() - 200

        # Update ping
        manager.update_ping(conn_id)

        # Verify connection is now active
        updated_info = manager.get_connection(conn_id)
        assert updated_info is not None
        assert updated_info.is_active is True

    def test_update_ping_prevents_stale_cleanup(self) -> None:
        """Test that updating ping prevents connection from being marked stale."""
        manager = WebSocketConnectionLifecycleManager()

        conn_id = manager.add_connection(
            channel="test",
            client_ip="192.168.1.1",
        )

        # Update ping regularly to keep connection alive
        for _ in range(3):
            time.sleep(0.05)
            manager.update_ping(conn_id)

        # Run cleanup
        cleaned = manager.cleanup_stale_connections()

        # Connection should NOT be cleaned up
        assert cleaned == 0
        assert manager.get_connection(conn_id) is not None
