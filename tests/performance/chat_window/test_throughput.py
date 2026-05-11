"""Suite 13 — Chat Window: Throughput KPI (13.4).

Test 13.4: Concurrent chat sessions — 15+ simultaneous
    KPI: Throughput — 15+ RPS
    MetricType: REQUEST_DURATION

    Validation source:
        - Record count / elapsed time (client-measured)
        - /_internal/metrics/kpis/api_service → total_requests / elapsed

    Runs 15+ simultaneous chat sessions continuously for 60 seconds
    and validates that the achieved throughput meets 15 RPS.

Run with:
    make test-performance
"""

from __future__ import annotations

import time
from concurrent.futures import Future, ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING

import pytest

from tests.performance.chat_window.conftest import create_chat_session_id, send_chat_message
from tests.performance.conftest import poll_for_component_kpis

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

TARGET_RPS = 15
CONCURRENT_SESSIONS = 15
SUSTAINED_DURATION_SECONDS = 60
MAX_WORKERS = 20


def _chat_session_loop(
    nexus_api: NexusApiRegistry,
    session_id: str,
    end_time: float,
    *,
    credential_id: str | None = None,
) -> tuple[int, int, list[float]]:
    """Send chat messages in a loop until end_time.

    Returns (successes, failures, response_times).
    """
    successes = 0
    failures = 0
    response_times: list[float] = []

    while time.monotonic() < end_time:
        elapsed_ms, success, _ = send_chat_message(
            nexus_api,
            session_id,
            "What tools are available in the system?",
            credential_id=credential_id,
        )
        response_times.append(elapsed_ms)
        if success:
            successes += 1
        else:
            failures += 1

    return successes, failures, response_times


class TestChatThroughput:
    """13.4 — Concurrent chat sessions (15+ simultaneous); throughput ≥ 15 RPS.

    Validates:
        - Client-measured throughput (total requests / wall time) ≥ 15 RPS
        - Server-side total_requests reflects the sustained load
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        llm_invocation_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_concurrent_chat_throughput_meets_target(
        self,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
    ) -> None:
        """15 simultaneous chat sessions for 60s; throughput must be ≥ 15 RPS."""
        session_ids = [create_chat_session_id() for _ in range(CONCURRENT_SESSIONS)]
        end_time = time.monotonic() + SUSTAINED_DURATION_SECONDS

        total_successes = 0
        total_failures = 0
        all_response_times: list[float] = []

        wall_start = time.monotonic()

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures: list[Future[tuple[int, int, list[float]]]] = [
                executor.submit(
                    _chat_session_loop,
                    nexus_api,
                    sid,
                    end_time,
                    credential_id=llm_credential_id,
                )
                for sid in session_ids
            ]

            for future in as_completed(futures):
                successes, failures, times = future.result()
                total_successes += successes
                total_failures += failures
                all_response_times.extend(times)

        wall_elapsed = time.monotonic() - wall_start
        total_requests = total_successes + total_failures

        assert total_requests > 0, "No chat messages were sent during the test"

        client_throughput = total_requests / wall_elapsed
        error_rate = total_failures / total_requests if total_requests else 1.0

        assert client_throughput >= TARGET_RPS, (
            f"Client-measured throughput {client_throughput:.1f} RPS below "
            f"target {TARGET_RPS} RPS\n"
            f"  Total requests: {total_requests}\n"
            f"  Successes: {total_successes}\n"
            f"  Failures: {total_failures}\n"
            f"  Error rate: {error_rate:.2%}\n"
            f"  Wall time: {wall_elapsed:.1f}s\n"
            f"  Concurrent sessions: {CONCURRENT_SESSIONS}"
        )

    def test_server_records_reflect_chat_throughput(
        self,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
    ) -> None:
        """Server-side request count must reflect ≥ 15 RPS throughput."""
        session_ids = [create_chat_session_id() for _ in range(CONCURRENT_SESSIONS)]
        end_time = time.monotonic() + SUSTAINED_DURATION_SECONDS

        wall_start = time.monotonic()

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures: list[Future[tuple[int, int, list[float]]]] = [
                executor.submit(
                    _chat_session_loop,
                    nexus_api,
                    sid,
                    end_time,
                    credential_id=llm_credential_id,
                )
                for sid in session_ids
            ]
            for future in as_completed(futures):
                future.result()

        wall_elapsed = time.monotonic() - wall_start

        kpis = poll_for_component_kpis(nexus_api.internal_metrics, "api_service")
        server_total = kpis.get("metrics", {}).get("total_requests", 0)

        if server_total > 0:
            server_throughput = server_total / wall_elapsed
            assert server_throughput >= TARGET_RPS, (
                f"Server-reported throughput {server_throughput:.1f} RPS below "
                f"target {TARGET_RPS} RPS\n"
                f"  Server total requests: {server_total}\n"
                f"  Wall time: {wall_elapsed:.1f}s"
            )
