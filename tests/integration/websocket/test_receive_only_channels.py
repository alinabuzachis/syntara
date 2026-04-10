"""Integration tests for receive-only WebSocket channels (Phase 3: AAP-58895).

Receive-only channels are tested with real WebSocket clients (websockets library) because
Starlette's TestClient has race conditions with message queues in receive-only mode.

Bidirectional channels continue using TestClient for consistency with existing tests.
"""

import asyncio
import contextlib
import json

import pytest
from starlette.testclient import TestClient
from uvicorn import Config, Server
from websockets import connect as websocket_connect

from nexus.api.main import app


async def _wait_for_server(host: str, port: int) -> None:
    """Poll until the server is accepting TCP connections."""
    async with asyncio.timeout(10.0):
        while True:
            try:
                _, writer = await asyncio.open_connection(host, port)
                writer.close()
                await writer.wait_closed()
                return
            except OSError:
                await asyncio.sleep(0.1)


class TestReceiveOnlyChannelIntegration:
    """Integration tests for receive-only channel behavior."""

    @pytest.mark.asyncio
    async def test_receive_only_channel_sends_events_via_on_connect(self) -> None:
        """Events sent through on_connect handler."""
        # Start app in background for real WebSocket connection
        config = Config(app, host="127.0.0.1", port=9999, log_level="error")
        server = Server(config)

        # Run server in background task
        server_task = asyncio.create_task(server.serve())

        try:
            await _wait_for_server("127.0.0.1", 9999)

            # Connect to receive-only tokens channel with real WebSocket client
            async with websocket_connect("ws://127.0.0.1:9999/ws/example/v1/tokens") as websocket:
                # Receive first token (no send required)
                token0_str = await websocket.recv()
                token0 = json.loads(token0_str)
                assert "token" in token0
                assert "sequence" in token0
                assert token0["token"] == "token_0"  # noqa: S105
                assert token0["sequence"] == 0

                # Receive second token
                token1_str = await websocket.recv()
                token1 = json.loads(token1_str)
                assert token1["token"] == "token_1"  # noqa: S105
                assert token1["sequence"] == 1

                # Receive third token
                token2_str = await websocket.recv()
                token2 = json.loads(token2_str)
                assert token2["token"] == "token_2"  # noqa: S105
                assert token2["sequence"] == 2

                # Verify timestamp is present
                assert "timestamp" in token2
        finally:
            # Shutdown server gracefully
            server.should_exit = True
            try:
                await asyncio.wait_for(server_task, timeout=5.0)
            except TimeoutError:
                # Force cancellation if graceful shutdown times out
                server_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await server_task

    @pytest.mark.asyncio
    async def test_receive_only_channel_stays_alive_until_disconnect(self) -> None:
        """Connection maintained until all messages sent."""
        # Start app in background for real WebSocket connection
        config = Config(app, host="127.0.0.1", port=10000, log_level="error")
        server = Server(config)

        # Run server in background task
        server_task = asyncio.create_task(server.serve())

        try:
            await _wait_for_server("127.0.0.1", 10000)

            # Connect to receive-only tokens channel
            async with websocket_connect("ws://127.0.0.1:10000/ws/example/v1/tokens") as websocket:
                # Receive all 5 tokens sent by on_connect
                tokens_received = []
                for i in range(5):
                    token_str = await websocket.recv()
                    token = json.loads(token_str)
                    tokens_received.append(token)
                    assert token["token"] == f"token_{i}"
                    assert token["sequence"] == i

                # Verify all 5 tokens received successfully
                assert len(tokens_received) == 5

                # Connection closes after background task completes (all tokens sent)
        finally:
            # Shutdown server gracefully
            server.should_exit = True
            try:
                await asyncio.wait_for(server_task, timeout=5.0)
            except TimeoutError:
                # Force cancellation if graceful shutdown times out
                server_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await server_task

    def test_bidirectional_channel_still_requires_handler(self, sync_test_client: TestClient) -> None:
        """Existing behavior unchanged (regression)."""
        # Connect to bidirectional chat channel using TestClient (unchanged)
        with sync_test_client.websocket_connect("/ws/example/v1/chat") as websocket:
            # Send chat message (bidirectional)
            websocket.send_json({"message": "hello there"})

            # Receive response (may also receive random messages)
            response = websocket.receive_json()

            # Should receive a response with reply and type
            assert "reply" in response
            assert "type" in response

            # If it's an echo, verify it's uppercase
            if response["type"] == "echo":
                assert response["reply"] == "HELLO THERE"

            # Verify timestamp is present
            assert "timestamp" in response
