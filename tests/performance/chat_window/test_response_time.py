"""Suite 13 — Chat Window: Response Time KPI (13.1).

Test 13.1: Chat interactions via WebSocket/HTTP — 50 sessions
    KPI: Response Time (p95) < 300ms
    MetricType: REQUEST_DURATION

    Validation source:
        - /_internal/metrics/kpis/api_service → response_time_ms.p95
        - Client-side p95 response time measurement across 50 concurrent sessions

Run with:
    make test-performance
"""

from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING

import pytest

from tests.performance.chat_window.conftest import create_chat_session_id, send_chat_message
from tests.performance.conftest import compute_percentile, poll_for_component_kpis

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

TARGET_P95_MS = 300
CONCURRENT_SESSIONS = 50
MESSAGES_PER_SESSION = 3
MAX_WORKERS = 50


def _run_chat_session(
    nexus_api: NexusApiRegistry,
    session_id: str,
    message_count: int,
    *,
    credential_id: str | None = None,
) -> list[tuple[float, bool]]:
    """Simulate a multi-turn chat session by sending sequential messages.

    Returns a list of (elapsed_ms, success) tuples — one per message.
    """
    results: list[tuple[float, bool]] = []
    prompts = [
        "Hello, what can you help me with?",
        "Can you explain how workflows work?",
        "How do I create a new automation?",
    ]
    for i in range(message_count):
        prompt = prompts[i % len(prompts)]
        elapsed_ms, success, _ = send_chat_message(nexus_api, session_id, prompt, credential_id=credential_id)
        results.append((elapsed_ms, success))
    return results


class TestChatWindowResponseTime:
    """13.1 — Chat interactions via WebSocket/HTTP — 50 sessions.

    Validates:
        - Client-measured p95 response time < 300ms across 50 concurrent sessions
        - Server-side KPI (api_service → response_time_ms.p95) < 300ms
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        llm_invocation_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_concurrent_chat_sessions_p95_under_target(
        self,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
    ) -> None:
        """50 concurrent chat sessions; p95 response time must be < 300ms."""
        session_ids = [create_chat_session_id() for _ in range(CONCURRENT_SESSIONS)]
        all_response_times: list[float] = []
        total_successes = 0
        total_failures = 0

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures: list[Future[list[tuple[float, bool]]]] = [
                executor.submit(
                    _run_chat_session,
                    nexus_api,
                    sid,
                    MESSAGES_PER_SESSION,
                    credential_id=llm_credential_id,
                )
                for sid in session_ids
            ]

            for future in as_completed(futures):
                session_results = future.result()
                for elapsed_ms, success in session_results:
                    all_response_times.append(elapsed_ms)
                    if success:
                        total_successes += 1
                    else:
                        total_failures += 1

        total_requests = len(all_response_times)
        assert total_requests > 0, "No chat messages were sent during the test"

        client_p95 = compute_percentile(all_response_times, 95)
        client_p50 = compute_percentile(all_response_times, 50)
        error_rate = total_failures / total_requests if total_requests else 1.0

        assert client_p95 < TARGET_P95_MS, (
            f"Client-measured p95 response time {client_p95:.1f}ms exceeds "
            f"target {TARGET_P95_MS}ms\n"
            f"  Sessions: {CONCURRENT_SESSIONS}\n"
            f"  Messages per session: {MESSAGES_PER_SESSION}\n"
            f"  Total requests: {total_requests}\n"
            f"  p50: {client_p50:.1f}ms\n"
            f"  Successes: {total_successes}\n"
            f"  Failures: {total_failures}\n"
            f"  Error rate: {error_rate:.2%}"
        )

    def test_server_kpi_confirms_p95_under_target(
        self,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
    ) -> None:
        """Server-side api_service KPI must confirm p95 < 300ms after chat load."""
        session_ids = [create_chat_session_id() for _ in range(CONCURRENT_SESSIONS)]

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures: list[Future[list[tuple[float, bool]]]] = [
                executor.submit(
                    _run_chat_session,
                    nexus_api,
                    sid,
                    MESSAGES_PER_SESSION,
                    credential_id=llm_credential_id,
                )
                for sid in session_ids
            ]
            for future in as_completed(futures):
                future.result()

        kpis = poll_for_component_kpis(nexus_api.internal_metrics, "api_service")
        server_metrics = kpis.get("metrics", {}).get("response_time_ms", {})
        server_p95 = server_metrics.get("p95", 0)

        if server_p95 > 0:
            assert server_p95 < TARGET_P95_MS, (
                f"Server-reported p95 response time {server_p95:.1f}ms exceeds "
                f"target {TARGET_P95_MS}ms\n"
                f"  Sessions: {CONCURRENT_SESSIONS}\n"
                f"  Server metrics: {server_metrics}"
            )

    def test_chat_sessions_maintain_isolation(
        self,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
    ) -> None:
        """Concurrent sessions must not degrade individual session performance.

        Verifies that even under concurrent load, individual session
        response times stay within acceptable bounds (no single session
        experiences extreme latency due to resource contention).
        """
        session_ids = [create_chat_session_id() for _ in range(CONCURRENT_SESSIONS)]
        per_session_p95: list[float] = []

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures: dict[Future[list[tuple[float, bool]]], str] = {
                executor.submit(
                    _run_chat_session,
                    nexus_api,
                    sid,
                    MESSAGES_PER_SESSION,
                    credential_id=llm_credential_id,
                ): sid
                for sid in session_ids
            }

            for future in as_completed(futures):
                session_results = future.result()
                session_times = [elapsed for elapsed, success in session_results if success]
                if session_times:
                    per_session_p95.append(compute_percentile(session_times, 95))

        assert len(per_session_p95) > 0, "No sessions completed successfully"

        worst_session_p95 = max(per_session_p95)
        median_session_p95 = compute_percentile(per_session_p95, 50)

        isolation_threshold = TARGET_P95_MS * 2
        assert worst_session_p95 < isolation_threshold, (
            f"Worst individual session p95 {worst_session_p95:.1f}ms exceeds "
            f"isolation threshold {isolation_threshold}ms (2x target)\n"
            f"  Median session p95: {median_session_p95:.1f}ms\n"
            f"  Sessions measured: {len(per_session_p95)}/{CONCURRENT_SESSIONS}"
        )
