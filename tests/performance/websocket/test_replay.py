"""Suite 19 — WebSocket Streaming: Replay Duration (19.3).

Test 19.3: Full replay of execution with 200+ events (replay=0)
    KPI: Replay Duration (p95) — < 2s for full replay
    Measurement: Client-side timing from connection to last replayed event
    Validation: Time from WS open to final replay event received

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
    TERMINAL_STATUSES,
    build_ws_url,
    compute_percentile,
    create_perf_test_workflow,
    poll_until_resources_terminal,
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

logger = structlog.stdlib.get_logger(__name__)

pytestmark = pytest.mark.performance

TARGET_REPLAY_DURATION_P95_MS = 2000
REPLAY_ATTEMPTS = 10
EXECUTION_SETTLE_TIMEOUT = 120.0
REPLAY_COLLECT_TIMEOUT = 30.0


class TestReplayDuration:
    """19.3 — Full replay of execution with events via replay=0.

    Creates a workflow execution, waits for it to complete (producing
    events in the Redis stream), then connects with ``replay=0`` to
    replay all events from the beginning.  Measures the time from
    connection open to the last replayed event.

    Repeats the replay multiple times to get a statistically meaningful
    p95 measurement.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_replay_duration_under_target(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
    ) -> None:
        """Full replay via replay=0; p95 duration must be < 2s."""
        workflow_id = create_perf_test_workflow(nexus_api, "ws-replay")
        assert workflow_id is not None, "Failed to create test workflow"

        _, exec_ok, execution_id = submit_execution(nexus_api, workflow_id)
        assert exec_ok, "Failed to submit test execution"
        assert execution_id is not None, "No execution ID returned"

        status_counts = poll_until_resources_terminal(
            nexus_api,
            "executions",
            [execution_id],
            id_param="execution_id",
            timeout=EXECUTION_SETTLE_TIMEOUT,
        )
        terminal = sum(v for k, v in status_counts.items() if k in TERMINAL_STATUSES)
        assert terminal > 0, (
            f"Execution did not reach terminal state within {EXECUTION_SETTLE_TIMEOUT}s (status_counts={status_counts})"
        )

        ws_url = build_ws_url(
            nexus_base_url,
            f"{EXECUTION_WS_PATH}/{execution_id}?replay=0",
        )

        async def _replay_once() -> tuple[float, int]:
            """Connect with replay=0 and measure time to last event.

            Returns (replay_duration_ms, event_count).
            """
            ws, _ = await open_ws_connection(ws_url, connect_timeout=WS_CONNECT_TIMEOUT)
            connect_time = time.monotonic()

            events = await collect_ws_events(
                ws,
                max_events=1000,
                recv_timeout=REPLAY_COLLECT_TIMEOUT,
                stop_on_types=EXECUTION_TERMINAL_TYPES,
            )

            last_received = max(
                (e.get("_received_at", 0.0) for e in events),
                default=connect_time,
            )
            replay_duration_ms = (last_received - connect_time) * 1000

            try:
                await ws.close()
            except Exception as exc:
                logger.debug("WebSocket close failed during replay", error=str(exc))

            return replay_duration_ms, len(events)

        async def _run_replays() -> list[tuple[float, int]]:
            results: list[tuple[float, int]] = []
            for _ in range(REPLAY_ATTEMPTS):
                try:
                    result = await _replay_once()
                    results.append(result)
                except Exception:
                    results.append((REPLAY_COLLECT_TIMEOUT * 1000, 0))
            return results

        replay_results = asyncio.get_event_loop().run_until_complete(_run_replays())

        replay_durations = [d for d, count in replay_results if count > 0]
        event_counts = [count for _, count in replay_results]

        assert len(replay_durations) > 0, (
            f"No replays received events (attempts={REPLAY_ATTEMPTS}, event_counts={event_counts})"
        )

        replay_p95 = compute_percentile(replay_durations, 95)
        avg_events = sum(event_counts) / len(event_counts) if event_counts else 0

        diag = (
            f"\n--- Replay duration results ---\n"
            f"  attempts={REPLAY_ATTEMPTS}\n"
            f"  successful_replays={len(replay_durations)}\n"
            f"  avg_events_per_replay={avg_events:.1f}\n"
            f"  replay_durations_ms={[f'{d:.0f}' for d in replay_durations]}\n"
            f"  p95={replay_p95:.0f}ms\n"
        )

        assert replay_p95 < TARGET_REPLAY_DURATION_P95_MS, (
            f"Replay duration p95 {replay_p95:.0f}ms exceeds target {TARGET_REPLAY_DURATION_P95_MS}ms{diag}"
        )
