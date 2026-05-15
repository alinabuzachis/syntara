"""Suite 19 — WebSocket Streaming: HTTP/WS Interference (19.6).

Test 19.6: WebSocket connections during high API load
    KPI: Interference with HTTP — HTTP p95 < 200ms, WS latency < 200ms
    Measurement: Parallel HTTP + WS load test
    Validation: Compare API metrics with and without WS connections active

Run with:
    make test-performance
"""

from __future__ import annotations

import asyncio
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import TYPE_CHECKING, Any

import pytest
import structlog

from tests.performance.conftest import (
    build_ws_url,
    compute_percentile,
    create_perf_test_workflow,
    make_request,
    poll_for_component_kpis,
    submit_execution,
)
from tests.performance.websocket.conftest import (
    EXECUTION_TERMINAL_TYPES,
    EXECUTION_WS_PATH,
    WS_CONNECT_TIMEOUT,
    collect_ws_events,
    open_ws_connection,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

logger = structlog.get_logger(__name__)

HTTP_RPS = 50
HTTP_DURATION_SECONDS = 30
WS_CONNECTIONS = 20
TARGET_HTTP_P95_MS = 200
MAX_HTTP_WORKERS = 100


class TestHTTPWSInterference:
    """19.6 — WebSocket connections during high API load.

    Runs HTTP load (50 RPS) simultaneously with 20 active WebSocket
    connections to validate:
        - HTTP response time p95 remains < 200ms under combined load
        - WebSocket connections remain responsive
        - Neither traffic type degrades the other significantly
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_http_ws_interference_within_targets(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
    ) -> None:
        """50 RPS HTTP + 20 WS connections; HTTP p95 < 200ms."""
        execution_ids = _create_executions_for_ws(nexus_api, WS_CONNECTIONS)
        assert len(execution_ids) > 0, "No executions created for WS connections"

        ws_results: dict[str, Any] = {"event_counts": [], "connected": 0}

        ws_thread = _start_ws_background(nexus_base_url, execution_ids, ws_results)

        time.sleep(2)

        http_response_times, http_errors = _run_http_load(nexus_api, HTTP_RPS, HTTP_DURATION_SECONDS)

        ws_thread.join(timeout=10)

        assert len(http_response_times) > 0, "No HTTP requests completed"

        http_p95 = compute_percentile(http_response_times, 95)
        error_rate = http_errors / len(http_response_times) if http_response_times else 1.0
        actual_rps = len(http_response_times) / HTTP_DURATION_SECONDS

        kpis = poll_for_component_kpis(nexus_api.internal_metrics, "api_service")
        server_p95 = kpis.get("metrics", {}).get("response_time_ms", {}).get("p95", 0)

        diag = (
            f"\n--- HTTP/WS interference results ---\n"
            f"  HTTP: requests={len(http_response_times)}, "
            f"actual_rps={actual_rps:.1f}, "
            f"p95={http_p95:.1f}ms, "
            f"error_rate={error_rate:.2%}\n"
            f"  WS: connected={ws_results['connected']}/"
            f"{len(execution_ids)}, "
            f"total_events={sum(ws_results['event_counts'])}\n"
            f"  Server p95={server_p95:.1f}ms\n"
        )

        assert http_p95 < TARGET_HTTP_P95_MS, (
            f"HTTP p95 {http_p95:.1f}ms exceeds target {TARGET_HTTP_P95_MS}ms under combined HTTP+WS load{diag}"
        )

        if server_p95 > 0:
            assert server_p95 < TARGET_HTTP_P95_MS, (
                f"Server-reported HTTP p95 {server_p95:.1f}ms exceeds target {TARGET_HTTP_P95_MS}ms{diag}"
            )


# ---------------------------------------------------------------------------
# Helpers (extracted to keep test body under complexity limits)
# ---------------------------------------------------------------------------


def _create_executions_for_ws(
    nexus_api: NexusApiRegistry,
    count: int,
) -> list[str]:
    """Create *count* workflow executions and return their IDs."""
    workflow_id = create_perf_test_workflow(nexus_api, "ws-interference")
    if workflow_id is None:
        return []

    execution_ids: list[str] = []
    for _ in range(count):
        _, exec_ok, exec_id = submit_execution(nexus_api, workflow_id)
        if exec_ok and exec_id:
            execution_ids.append(exec_id)

    return execution_ids[:count]


def _start_ws_background(
    base_url: str,
    execution_ids: list[str],
    results: dict[str, Any],
) -> threading.Thread:
    """Start WebSocket connections in a background thread.

    Populates *results* dict with ``event_counts`` and ``connected``.
    """

    def _run() -> None:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(_ws_connect_and_collect(base_url, execution_ids, results))
        finally:
            loop.close()

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    return thread


async def _ws_connect_and_collect(
    base_url: str,
    execution_ids: list[str],
    results: dict[str, Any],
) -> None:
    """Connect WS to each execution and collect events."""
    connections = []
    for exec_id in execution_ids:
        ws_url = build_ws_url(
            base_url,
            f"{EXECUTION_WS_PATH}/{exec_id}?replay=0",
        )
        try:
            ws, _ = await open_ws_connection(ws_url, connect_timeout=WS_CONNECT_TIMEOUT)
            connections.append(ws)
        except Exception:
            logger.debug("WS connect failed during interference test", exc_info=True)

    results["connected"] = len(connections)

    collect_tasks = [
        asyncio.create_task(
            collect_ws_events(
                ws,
                max_events=100,
                recv_timeout=float(HTTP_DURATION_SECONDS + 5),
                stop_on_types=EXECUTION_TERMINAL_TYPES,
            )
        )
        for ws in connections
    ]

    all_events = await asyncio.gather(*collect_tasks, return_exceptions=True)

    for result in all_events:
        if isinstance(result, list):
            results["event_counts"].append(len(result))

    for ws in connections:
        try:
            await ws.close()
        except Exception:
            pass


def _run_http_load(
    nexus_api: NexusApiRegistry,
    target_rps: int,
    duration_seconds: int,
) -> tuple[list[float], int]:
    """Send HTTP requests at *target_rps* for *duration_seconds*.

    Returns (response_times_ms, error_count).
    """
    response_times: list[float] = []
    errors = 0
    interval = 1.0 / target_rps
    end_time = time.monotonic() + duration_seconds

    with ThreadPoolExecutor(max_workers=MAX_HTTP_WORKERS) as executor:
        futures = []
        next_send = time.monotonic()

        while time.monotonic() < end_time:
            now = time.monotonic()
            if now >= next_send:
                futures.append(executor.submit(make_request, nexus_api))
                next_send += interval
            else:
                sleep_for = min(next_send - now, 0.001)
                time.sleep(sleep_for)

        for future in futures:
            try:
                elapsed_ms, success = future.result(timeout=30)
                response_times.append(elapsed_ms)
                if not success:
                    errors += 1
            except Exception:
                errors += 1

    return response_times, errors
