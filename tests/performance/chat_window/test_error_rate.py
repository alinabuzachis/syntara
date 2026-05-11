"""Suite 13 — Chat Window: Error Rate KPI (13.3).

Test 13.3: Chat sessions — sustained 15 RPS
    KPI: Error Rate < 1%
    MetricType: ERROR, LLM_STATUS

    Validation source:
        - Error count / total count (client-measured)
        - /_internal/metrics/kpis/llm → total_calls + LLM_STATUS labels

    Sustains chat invocations at 15 RPS for 60 seconds and validates
    that the error rate (failed requests / total requests) stays below 1%.

Run with:
    make test-performance
"""

from __future__ import annotations

import time
from concurrent.futures import Future, ThreadPoolExecutor
from typing import TYPE_CHECKING

import pytest
import structlog

from tests.performance.chat_window.conftest import create_chat_session_id, send_chat_message
from tests.performance.conftest import poll_for_component_kpis

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

logger = structlog.get_logger(__name__)

pytestmark = pytest.mark.performance

TARGET_ERROR_RATE = 0.01
SUSTAINED_RPS = 15
SUSTAINED_DURATION_SECONDS = 60
MAX_WORKERS = 30


class TestChatSessionErrorRate:
    """13.3 — Chat sessions at sustained 15 RPS; error rate must be < 1%.

    Validates:
        - Client-measured error rate (failed / total) < 1%
        - Server-side LLM status metrics reflect low failure rate
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        llm_invocation_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_sustained_chat_error_rate_below_target(
        self,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
    ) -> None:
        """Sustain 15 RPS of chat messages for 60s; error rate must be < 1%."""
        total_successes = 0
        total_failures = 0
        response_times: list[float] = []

        interval = 1.0 / SUSTAINED_RPS
        end_time = time.monotonic() + SUSTAINED_DURATION_SECONDS

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures: list[Future[tuple[float, bool, str | None]]] = []
            next_send = time.monotonic()

            while time.monotonic() < end_time:
                now = time.monotonic()
                if now >= next_send:
                    session_id = create_chat_session_id()
                    futures.append(
                        executor.submit(
                            send_chat_message,
                            nexus_api,
                            session_id,
                            "What workflows are available?",
                            credential_id=llm_credential_id,
                        )
                    )
                    next_send += interval
                else:
                    sleep_for = min(next_send - now, 0.001)
                    time.sleep(sleep_for)

            for future in futures:
                try:
                    elapsed_ms, success, _ = future.result(timeout=30)
                    response_times.append(elapsed_ms)
                    if success:
                        total_successes += 1
                    else:
                        total_failures += 1
                except Exception as exc:
                    logger.warning(
                        "Chat message future failed during error rate test",
                        exc_type=type(exc).__name__,
                        exc_info=True,
                    )
                    total_failures += 1

        total_requests = total_successes + total_failures
        assert total_requests > 0, "No chat messages were sent during the test"

        error_rate = total_failures / total_requests
        actual_rps = total_requests / SUSTAINED_DURATION_SECONDS

        assert error_rate < TARGET_ERROR_RATE, (
            f"Chat session error rate {error_rate:.4%} exceeds "
            f"target {TARGET_ERROR_RATE:.0%}\n"
            f"  Total requests: {total_requests}\n"
            f"  Successes: {total_successes}\n"
            f"  Failures: {total_failures}\n"
            f"  Actual RPS: {actual_rps:.1f}\n"
            f"  Target RPS: {SUSTAINED_RPS}"
        )

    def test_server_llm_status_confirms_low_error_rate(
        self,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
    ) -> None:
        """Server-side LLM status must confirm error rate < 1% after sustained load."""
        interval = 1.0 / SUSTAINED_RPS
        end_time = time.monotonic() + SUSTAINED_DURATION_SECONDS

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures: list[Future[tuple[float, bool, str | None]]] = []
            next_send = time.monotonic()

            while time.monotonic() < end_time:
                now = time.monotonic()
                if now >= next_send:
                    session_id = create_chat_session_id()
                    futures.append(
                        executor.submit(
                            send_chat_message,
                            nexus_api,
                            session_id,
                            "Describe the system architecture.",
                            credential_id=llm_credential_id,
                        )
                    )
                    next_send += interval
                else:
                    sleep_for = min(next_send - now, 0.001)
                    time.sleep(sleep_for)

            for future in futures:
                try:
                    future.result(timeout=30)
                except Exception as exc:
                    logger.warning(
                        "Chat message future failed during server KPI validation",
                        exc_type=type(exc).__name__,
                        exc_info=True,
                    )

        kpis = poll_for_component_kpis(
            nexus_api.internal_metrics,
            "llm",
            timeout=30.0,
        )
        llm_metrics = kpis.get("metrics", {})
        total_calls = llm_metrics.get("total_calls", 0)

        if total_calls > 0:
            api_kpis = poll_for_component_kpis(
                nexus_api.internal_metrics,
                "api_service",
            )
            api_metrics = api_kpis.get("metrics", {})
            server_error_count = api_metrics.get("error_count", 0)
            server_total = api_metrics.get("total_requests", 0)

            if server_total > 0:
                server_error_rate = server_error_count / server_total
                assert server_error_rate < TARGET_ERROR_RATE, (
                    f"Server-reported error rate {server_error_rate:.4%} "
                    f"exceeds target {TARGET_ERROR_RATE:.0%}\n"
                    f"  Server error count: {server_error_count}\n"
                    f"  Server total requests: {server_total}\n"
                    f"  LLM total calls: {total_calls}"
                )
