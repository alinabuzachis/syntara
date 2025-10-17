"""A2A SDK Client helper for E2E tests.

This module provides a simplified wrapper around the official A2A SDK client
for use in E2E tests. It handles agent card resolution, client initialization,
and provides convenient methods for sending messages.

Reference: https://github.com/a2aproject/a2a-python
Example: https://github.com/a2aproject/a2a-samples/tree/main/samples/python/agents/helloworld
"""

from collections.abc import AsyncGenerator
from types import TracebackType
from typing import Any
from uuid import uuid4

import httpx
from a2a.client import A2ACardResolver, Client, ClientConfig, ClientFactory
from a2a.types import Message, Part, Role, TextPart


class A2ATestClient:
    """Wrapper around A2A SDK client for E2E testing.

    This class provides a convenient interface for testing A2A agents using the
    official SDK instead of raw HTTP requests. It supports both synchronous and
    streaming message sending.

    Usage:
        async with A2ATestClient("http://localhost:8001") as client:
            response = await client.send_message("Calculate 2+2")
            print(response)

            # Streaming
            async for chunk in client.send_message_streaming("Generate text"):
                print(chunk)
    """

    def __init__(self, base_url: str) -> None:
        """Initialize A2A test client.

        Args:
            base_url: Agent URL (e.g., http://localhost:8001)

        """
        self.base_url = base_url
        self._httpx_client: httpx.AsyncClient | None = None
        self._a2a_client: Client | None = None

    async def __aenter__(self) -> "A2ATestClient":
        """Async context manager entry - initializes client and resolves agent card."""
        self._httpx_client = httpx.AsyncClient(timeout=60.0)

        # Resolve agent card from /.well-known/agent-card.json
        resolver = A2ACardResolver(httpx_client=self._httpx_client, base_url=self.base_url)
        agent_card = await resolver.get_agent_card()

        # Create A2A client using ClientFactory (new recommended approach)
        config = ClientConfig(httpx_client=self._httpx_client, streaming=False)
        factory = ClientFactory(config)
        self._a2a_client = factory.create(agent_card)

        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        """Async context manager exit - closes HTTP client."""
        if self._httpx_client:
            await self._httpx_client.aclose()

    async def send_message(
        self, text: str, context_id: str | None = None, metadata: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """Send a message to the agent (synchronous mode).

        Args:
            text: Message text
            context_id: Optional context ID for conversation continuity
            metadata: Optional metadata (e.g., nexus:agentConfig)

        Returns:
            Response dictionary with result, status, artifacts, history (JSON-RPC 2.0 format)

        Raises:
            RuntimeError: If client not initialized (use async with)

        """
        if not self._a2a_client:
            msg = "Client not initialized. Use 'async with A2ATestClient(...)'"
            raise RuntimeError(msg)

        # Create Message object using new A2A SDK API
        message = Message(
            message_id=uuid4().hex,
            role=Role.user,
            parts=[Part(root=TextPart(text=text))],
            context_id=context_id,
            metadata=metadata,
        )

        # Send message and collect response (AsyncIterator of (Task, Event) tuples)
        task = None
        async for item in self._a2a_client.send_message(message):
            if isinstance(item, tuple):
                task, _event = item
                # Keep iterating to get final task state

        if not task:
            msg = "No task received from agent"
            raise RuntimeError(msg)

        # Convert Task to JSON-RPC 2.0 response format (backward compatible)
        return {
            "jsonrpc": "2.0",
            "id": task.id,
            "result": {
                "contextId": task.context_id,
                "status": {"state": task.status.state.value, "timestamp": str(task.status.timestamp)},
                "artifacts": [
                    artifact.model_dump(mode="json", exclude_none=True) for artifact in (task.artifacts or [])
                ],
                "history": [msg.model_dump(mode="json", exclude_none=True) for msg in (task.history or [])],
            },
        }

    async def send_message_streaming(
        self, text: str, context_id: str | None = None, metadata: dict[str, Any] | None = None
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Send a message to the agent (streaming mode).

        Args:
            text: Message text
            context_id: Optional context ID for conversation continuity
            metadata: Optional metadata

        Yields:
            Response events as they arrive (Task, Event tuples converted to dicts)

        Raises:
            RuntimeError: If client not initialized (use async with)

        """
        if not self._a2a_client:
            msg = "Client not initialized. Use 'async with A2ATestClient(...)'"
            raise RuntimeError(msg)

        # Create Message object
        message = Message(
            message_id=uuid4().hex,
            role=Role.user,
            parts=[Part(root=TextPart(text=text))],
            context_id=context_id,
            metadata=metadata,
        )

        # Send message and yield events as they arrive
        # Note: The new API always streams events, we just yield them
        async for item in self._a2a_client.send_message(message):
            if isinstance(item, tuple):
                task, event = item
                # Yield tuple converted to dict for backward compatibility
                yield {
                    "task": task.model_dump(mode="json", exclude_none=True) if task else None,
                    "event": event.model_dump(mode="json", exclude_none=True) if event else None,
                }

    async def get_agent_card(self) -> dict[str, Any]:
        """Get agent card directly.

        Returns:
            Agent card dictionary

        Raises:
            RuntimeError: If client not initialized

        """
        if not self._httpx_client:
            msg = "Client not initialized. Use 'async with A2ATestClient(...)'"
            raise RuntimeError(msg)

        resolver = A2ACardResolver(httpx_client=self._httpx_client, base_url=self.base_url)
        agent_card = await resolver.get_agent_card()

        return agent_card.model_dump(mode="json", exclude_none=True)
