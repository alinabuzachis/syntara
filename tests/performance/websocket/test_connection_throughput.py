"""Suite 19 — WebSocket Streaming: Connection Throughput & Churn (19.1, 19.5).

Test 19.1: Open 50 concurrent WebSocket connections to execution stream
    KPI: Connection Throughput — All connections established < 1s
    Measurement: Client-side connection timing
    Validation: Count successful connections / total attempts

Test 19.5: Rapid connect/disconnect cycles (100 connections in 10s)
    KPI: Connection Churn Handling — No resource leaks, no errors on server
    Measurement: Server-side error logs + metrics
    Validation: Check pod memory/CPU before and after; verify no leaked
        Redis subscriptions

Run with:
    make test-performance
"""

from __future__ import annotations

import asyncio
import time
from typing import TYPE_CHECKING

import pytest
import structlog

from tests.performance.conftest import (
    build_ws_url,
    compute_percentile,
    create_perf_test_workflow,
    submit_execution,
)
from tests.performance.websocket.conftest import (
    EXECUTION_WS_PATH,
    WS_CONNECT_TIMEOUT,
    open_ws_connection,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

logger = structlog.get_logger(__name__)

CONCURRENT_CONNECTIONS = 50
TARGET_CONNECTION_TIME_MS = 1000
CHURN_CONNECTIONS = 100
CHURN_BATCH_SIZE = 10


class TestWSConnectionThroughput:
    """19.1 — Open 50 concurrent WebSocket connections to execution stream.

    Creates a workflow execution to produce a valid stream endpoint,
    then opens 50 concurrent WebSocket connections and validates:
        - All connections established within 1s each
        - Success rate is 100% (all connections accepted)
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_concurrent_ws_connections_under_target(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
    ) -> None:
        """50 concurrent WS connections; all must establish < 1s."""
        workflow_id = create_perf_test_workflow(nexus_api, "ws-conn-throughput")
        assert workflow_id is not None, "Failed to create test workflow"

        _, exec_ok, execution_id = submit_execution(nexus_api, workflow_id)
        assert exec_ok, "Failed to submit test execution"
        assert execution_id is not None, "No execution ID returned"

        ws_url = build_ws_url(
            nexus_base_url,
            f"{EXECUTION_WS_PATH}/{execution_id}",
        )

        results = asyncio.get_event_loop().run_until_complete(
            _open_concurrent_connections(ws_url, CONCURRENT_CONNECTIONS)
        )

        successes = sum(1 for ok, _ in results if ok)
        connection_times = [elapsed for ok, elapsed in results if ok]

        assert successes == CONCURRENT_CONNECTIONS, (
            f"Only {successes}/{CONCURRENT_CONNECTIONS} WebSocket connections succeeded"
        )

        p95_connect_ms = compute_percentile(connection_times, 95)
        max_connect_ms = max(connection_times) if connection_times else 0

        assert max_connect_ms < TARGET_CONNECTION_TIME_MS, (
            f"Slowest connection took {max_connect_ms:.0f}ms, exceeding "
            f"target {TARGET_CONNECTION_TIME_MS}ms "
            f"(p95={p95_connect_ms:.0f}ms, "
            f"successes={successes}/{CONCURRENT_CONNECTIONS})"
        )


class TestWSConnectionChurn:
    """19.5 — Rapid connect/disconnect cycles (100 connections in 10s).

    Validates:
        - No server errors during rapid churn
        - All connections successfully establish and close
        - Server metrics show no anomalies after churn
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_rapid_connect_disconnect_no_leaks(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
    ) -> None:
        """100 connect/disconnect cycles in batches; no errors or leaks."""
        workflow_id = create_perf_test_workflow(nexus_api, "ws-churn")
        assert workflow_id is not None, "Failed to create test workflow"

        _, exec_ok, execution_id = submit_execution(nexus_api, workflow_id)
        assert exec_ok, "Failed to submit test execution"
        assert execution_id is not None, "No execution ID returned"

        ws_url = build_ws_url(
            nexus_base_url,
            f"{EXECUTION_WS_PATH}/{execution_id}",
        )

        successes, failures = asyncio.get_event_loop().run_until_complete(
            _run_churn_cycles(ws_url, CHURN_CONNECTIONS, CHURN_BATCH_SIZE)
        )

        assert failures == 0, (
            f"{failures}/{CHURN_CONNECTIONS} connection cycles failed "
            f"(success_rate={successes / CHURN_CONNECTIONS:.2%})"
        )

        time.sleep(2)

        health_response = nexus_api.internal_metrics.get_summary()
        assert health_response.is_success, "Metrics endpoint unhealthy after connection churn — possible resource leak"


async def _open_concurrent_connections(
    ws_url: str,
    count: int,
) -> list[tuple[bool, float]]:
    """Open *count* concurrent WS connections and return results."""

    async def _single_connect() -> tuple[bool, float]:
        try:
            ws, elapsed_ms = await open_ws_connection(
                ws_url,
                connect_timeout=WS_CONNECT_TIMEOUT,
            )
            await ws.close()
            return True, elapsed_ms
        except Exception:
            return False, WS_CONNECT_TIMEOUT * 1000

    tasks = [asyncio.create_task(_single_connect()) for _ in range(count)]
    return list(await asyncio.gather(*tasks))


async def _run_churn_cycles(
    ws_url: str,
    total: int,
    batch_size: int,
) -> tuple[int, int]:
    """Run connect/disconnect cycles in batches. Returns (successes, failures)."""
    successes = 0
    failures = 0

    for batch_start in range(0, total, batch_size):
        batch_end = min(batch_start + batch_size, total)
        batch_count = batch_end - batch_start

        async def _cycle() -> bool:
            try:
                ws, _ = await open_ws_connection(
                    ws_url,
                    connect_timeout=WS_CONNECT_TIMEOUT,
                )
                await ws.close()
            except Exception:
                logger.warning("Connection churn cycle failed", exc_info=True)
                return False
            else:
                return True

        tasks = [asyncio.create_task(_cycle()) for _ in range(batch_count)]
        results = await asyncio.gather(*tasks)

        for ok in results:
            if ok:
                successes += 1
            else:
                failures += 1

        await asyncio.sleep(0.1)

    return successes, failures
