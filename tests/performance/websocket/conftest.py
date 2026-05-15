"""Shared fixtures for Suite 19: WebSocket Streaming performance tests.

These tests run against a live Nexus deployment (typically OpenShift) and
validate the WebSocket Streaming KPIs from the Nexus Performance Test Plan.

Suite-wide fixtures (perf_test_mode_enabled, llm_credential_id,
llm_invocation_enabled) and helpers (compute_percentile, build_ws_url,
submit_invocation, submit_execution, create_perf_test_workflow,
poll_for_invocation_terminal_status, poll_until_resources_terminal)
are defined in the parent tests/performance/conftest.py and inherited
automatically.

WebSocket endpoints under test:
    - /ws/workflows/v1/executions/{execution_id}
    - /ws/agent_orchestrator/v1/invocations/{invocation_id}

Prerequisites:
    - APP_BASE_URL pointing to the Nexus deployment
    - metrics.perf_test_mode enabled on the target instance
    - Valid admin credentials (APP_ADMIN_PASSWORD_PATH or .secrets/admin-password)
    - LLM Provider credential for invocation streaming tests

Run with:
    make test-performance
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import TYPE_CHECKING, Any

import structlog
import websockets

if TYPE_CHECKING:
    from websockets.asyncio.client import ClientConnection

logger = structlog.get_logger(__name__)

WS_CONNECT_TIMEOUT = 10.0
WS_RECEIVE_TIMEOUT = 30.0

EXECUTION_WS_PATH = "/ws/workflows/v1/executions"
INVOCATION_WS_PATH = "/ws/agent_orchestrator/v1/invocations"


async def open_ws_connection(
    ws_url: str,
    *,
    connect_timeout: float = WS_CONNECT_TIMEOUT,
    additional_headers: dict[str, str] | None = None,
) -> tuple[ClientConnection, float]:
    """Open a WebSocket connection and return (connection, elapsed_ms).

    Uses the ``websockets`` library's async client.

    Args:
        ws_url: Full WebSocket URL to connect to.
        connect_timeout: Maximum seconds to wait for connection.
        additional_headers: Extra headers (e.g. auth) to send on connect.

    Returns:
        Tuple of (connection, connection_time_ms).

    Raises:
        Exception: On connection failure (timeout, refused, etc.).

    """
    start = time.monotonic()
    ws = await asyncio.wait_for(
        websockets.connect(
            ws_url,
            additional_headers=additional_headers or {},
        ),
        timeout=connect_timeout,
    )
    elapsed_ms = (time.monotonic() - start) * 1000
    return ws, elapsed_ms


async def collect_ws_events(
    ws: ClientConnection,
    *,
    max_events: int = 1000,
    recv_timeout: float = WS_RECEIVE_TIMEOUT,
    stop_on_event_types: frozenset[str] | None = None,
    stop_on_types: frozenset[str] | None = None,
) -> list[dict[str, Any]]:
    """Receive JSON events from a WebSocket until a stop condition or timeout.

    Stops when:
        - An event with ``event_type`` in *stop_on_event_types* is received
        - An event with ``type`` in *stop_on_types* is received
        - *max_events* are collected
        - The connection closes or *recv_timeout* elapses

    Args:
        ws: Open WebSocket connection.
        max_events: Maximum number of events to collect.
        recv_timeout: Maximum seconds to wait for messages.
        stop_on_event_types: Event type values that signal streaming end
            (used by invocation streams: ``completion``, ``error``,
            ``cancelled``).
        stop_on_types: Type values that signal streaming end
            (used by execution streams: ``final_snapshot``).

    Returns:
        List of parsed JSON event dicts with ``_received_at`` timestamp
        injected.

    """
    events: list[dict[str, Any]] = []
    deadline = time.monotonic() + recv_timeout

    try:
        while len(events) < max_events and time.monotonic() < deadline:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=remaining)
                received_at = time.monotonic()
                event = json.loads(raw)
                event["_received_at"] = received_at
                events.append(event)

                if stop_on_event_types and event.get("event_type") in stop_on_event_types:
                    break
                if stop_on_types and event.get("type") in stop_on_types:
                    break
            except TimeoutError:
                break
    except websockets.exceptions.ConnectionClosed:
        pass

    return events


INVOCATION_TERMINAL_EVENT_TYPES = frozenset({"completion", "error", "cancelled"})
EXECUTION_TERMINAL_TYPES = frozenset({"final_snapshot"})
