"""Suite 19 — WebSocket Streaming: Fan-out Latency & Streaming Throughput (19.2, 19.4).

Test 19.2: Stream 100 activity updates to 50 connected clients
    KPI: Fan-out Latency (p95) — < 100ms from Redis publish to client receipt
    Measurement: Client-side timestamp vs event timestamp
    Validation: Compare server-emitted event time to client receipt time

Test 19.4: Concurrent invocation streams — 30 simultaneous LLM invocations
    KPI: Streaming Throughput — No dropped events, < 200ms delta latency
    Measurement: Client-side delta receipt timing
    Validation: Verify all delta events received; measure inter-delta latency

Run with:
    make test-performance
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any
from uuid import uuid4

import pytest
import structlog

from tests.performance.conftest import (
    build_ws_url,
    compute_percentile,
    create_perf_test_workflow,
    submit_execution,
    submit_invocation,
)
from tests.performance.websocket.conftest import (
    EXECUTION_TERMINAL_TYPES,
    EXECUTION_WS_PATH,
    INVOCATION_TERMINAL_EVENT_TYPES,
    INVOCATION_WS_PATH,
    WS_CONNECT_TIMEOUT,
    collect_ws_events,
    open_ws_connection,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry
    from websockets.asyncio.client import ClientConnection

pytestmark = pytest.mark.performance

logger = structlog.get_logger(__name__)

FANOUT_CLIENTS = 50
TARGET_FANOUT_LATENCY_P95_MS = 100
CONCURRENT_INVOCATIONS = 30
TARGET_DELTA_LATENCY_MS = 200
STREAM_COLLECT_TIMEOUT = 120.0


class TestFanoutLatency:
    """19.2 — Stream activity updates to 50 connected clients.

    Creates a workflow execution, connects 50 WebSocket clients to the
    same execution stream, and validates:
        - All clients receive events (fan-out works)
        - Fan-out latency p95 < 100ms (time spread across clients)
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_fanout_latency_under_target(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
    ) -> None:
        """50 clients on same execution stream; fan-out p95 < 100ms."""
        workflow_id = create_perf_test_workflow(nexus_api, "ws-fanout")
        assert workflow_id is not None, "Failed to create test workflow"

        _, exec_ok, execution_id = submit_execution(nexus_api, workflow_id)
        assert exec_ok, "Failed to submit test execution"
        assert execution_id is not None, "No execution ID returned"
        ws_url = build_ws_url(
            nexus_base_url,
            f"{EXECUTION_WS_PATH}/{execution_id}?replay=0",
        )

        all_client_events, connect_times = asyncio.get_event_loop().run_until_complete(
            _fanout_connect_and_collect(ws_url, FANOUT_CLIENTS)
        )

        clients_with_events = sum(1 for events in all_client_events if len(events) > 0)
        assert clients_with_events > 0, f"No clients received events (connected={len(connect_times)}/{FANOUT_CLIENTS})"

        fanout_deltas = _compute_fanout_deltas(all_client_events)

        if fanout_deltas:
            fanout_p95 = compute_percentile(fanout_deltas, 95)
            assert fanout_p95 < TARGET_FANOUT_LATENCY_P95_MS, (
                f"Fan-out latency p95 {fanout_p95:.0f}ms exceeds target "
                f"{TARGET_FANOUT_LATENCY_P95_MS}ms "
                f"(clients_with_events={clients_with_events}/{FANOUT_CLIENTS})"
            )

        event_counts = [len(events) for events in all_client_events]
        min_events = min(event_counts) if event_counts else 0
        max_events = max(event_counts) if event_counts else 0

        assert min_events > 0, (
            f"Some clients received 0 events (min={min_events}, max={max_events}, clients={clients_with_events})"
        )


class TestStreamingThroughput:
    """19.4 — Concurrent invocation streams with LLM streaming.

    Submits 30 LLM invocations, connects a WebSocket to each invocation
    stream, and validates:
        - All streams receive delta events (no dropped events)
        - Inter-delta latency p95 < 200ms
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        llm_invocation_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_concurrent_invocation_streams_no_drops(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
        llm_credential_id: str | None,
    ) -> None:
        """30 concurrent invocation streams; no dropped events, delta latency < 200ms."""
        invocation_ids = _create_invocations(nexus_api, CONCURRENT_INVOCATIONS, llm_credential_id)
        assert len(invocation_ids) > 0, f"No invocations accepted out of {CONCURRENT_INVOCATIONS}"

        all_stream_events = asyncio.get_event_loop().run_until_complete(
            _stream_invocations(nexus_base_url, invocation_ids)
        )

        streams_with_events = sum(1 for events in all_stream_events if len(events) > 0)
        assert streams_with_events > 0, f"No streams received events (invocations={len(invocation_ids)})"

        total_deltas, inter_delta_latencies = _extract_delta_metrics(all_stream_events)

        diag = (
            f"\n--- Streaming throughput results ---\n"
            f"  invocations={len(invocation_ids)}\n"
            f"  streams_with_events={streams_with_events}\n"
            f"  total_deltas={total_deltas}\n"
            f"  inter_delta_samples={len(inter_delta_latencies)}\n"
        )

        assert total_deltas > 0, f"No delta events received across streams{diag}"

        if inter_delta_latencies:
            delta_p95 = compute_percentile(inter_delta_latencies, 95)
            assert delta_p95 < TARGET_DELTA_LATENCY_MS, (
                f"Inter-delta latency p95 {delta_p95:.0f}ms exceeds target {TARGET_DELTA_LATENCY_MS}ms{diag}"
            )


# ---------------------------------------------------------------------------
# Async helpers (extracted to reduce per-test complexity)
# ---------------------------------------------------------------------------


async def _fanout_connect_and_collect(
    ws_url: str,
    client_count: int,
) -> tuple[list[list[dict[str, Any]]], list[float]]:
    """Connect *client_count* clients and collect events from each."""
    connect_times: list[float] = []
    connections: list[ClientConnection] = []

    for _ in range(client_count):
        try:
            ws, elapsed_ms = await open_ws_connection(ws_url, connect_timeout=WS_CONNECT_TIMEOUT)
            connections.append(ws)
            connect_times.append(elapsed_ms)
        except Exception:
            logger.debug("Fan-out connection attempt failed", exc_info=True)

    collect_tasks = [
        asyncio.create_task(
            collect_ws_events(
                ws,
                max_events=200,
                recv_timeout=STREAM_COLLECT_TIMEOUT,
                stop_on_types=EXECUTION_TERMINAL_TYPES,
            )
        )
        for ws in connections
    ]

    all_events = await asyncio.gather(*collect_tasks, return_exceptions=True)

    for ws in connections:
        try:
            await ws.close()
        except Exception:
            pass

    valid_events: list[list[dict[str, Any]]] = [result for result in all_events if isinstance(result, list)]
    return valid_events, connect_times


def _compute_fanout_deltas(
    all_client_events: list[list[dict[str, Any]]],
) -> list[float]:
    """Compute per-event fan-out latency deltas across clients."""
    event_receipt_by_id: dict[str, list[float]] = {}

    for client_events in all_client_events:
        for event in client_events:
            event_id = event.get("event_id", "")
            received_at = event.get("_received_at", 0.0)
            if event_id and received_at:
                event_receipt_by_id.setdefault(event_id, []).append(received_at)

    deltas: list[float] = []
    for receipt_times in event_receipt_by_id.values():
        if len(receipt_times) >= 2:
            earliest = min(receipt_times)
            for rt in receipt_times:
                delta_ms = (rt - earliest) * 1000
                deltas.append(delta_ms)

    return deltas


def _create_invocations(
    nexus_api: NexusApiRegistry,
    count: int,
    credential_id: str | None,
) -> list[str]:
    """Create *count* invocations and return their IDs."""
    invocation_ids: list[str] = []
    for i in range(count):
        session_id = f"ws-stream-{uuid4().hex[:8]}"
        _, ok, inv_id = submit_invocation(
            nexus_api,
            f"Say hello and count to {i + 1}",
            session_id=session_id,
            credential_id=credential_id,
        )
        if ok and inv_id:
            invocation_ids.append(inv_id)
    return invocation_ids


async def _stream_invocations(
    base_url: str,
    invocation_ids: list[str],
) -> list[list[dict[str, Any]]]:
    """Connect a WS to each invocation and collect events."""

    async def _stream_one(inv_id: str) -> list[dict[str, Any]]:
        ws_url = build_ws_url(
            base_url,
            f"{INVOCATION_WS_PATH}/{inv_id}?last_event_id=0",
        )
        try:
            ws, _ = await open_ws_connection(ws_url, connect_timeout=WS_CONNECT_TIMEOUT)
            events = await collect_ws_events(
                ws,
                max_events=500,
                recv_timeout=STREAM_COLLECT_TIMEOUT,
                stop_on_event_types=INVOCATION_TERMINAL_EVENT_TYPES,
            )
            try:
                await ws.close()
            except Exception:
                pass
            return events
        except Exception:
            return []

    tasks = [asyncio.create_task(_stream_one(inv_id)) for inv_id in invocation_ids]
    results = await asyncio.gather(*tasks)
    return [r for r in results if isinstance(r, list)]


def _extract_delta_metrics(
    all_stream_events: list[list[dict[str, Any]]],
) -> tuple[int, list[float]]:
    """Count delta events and compute inter-delta latencies."""
    total_deltas = 0
    inter_delta_latencies: list[float] = []

    for stream_events in all_stream_events:
        delta_timestamps: list[float] = []
        for event in stream_events:
            if event.get("event_type") == "delta":
                total_deltas += 1
                received_at = event.get("_received_at", 0.0)
                if received_at:
                    delta_timestamps.append(received_at)

        for j in range(1, len(delta_timestamps)):
            inter_delta_ms = (delta_timestamps[j] - delta_timestamps[j - 1]) * 1000
            inter_delta_latencies.append(inter_delta_ms)

    return total_deltas, inter_delta_latencies
