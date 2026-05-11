"""Suite 13 — Chat Window: Streaming TTFT KPI (13.2).

Test 13.2: Chat streaming responses — Time To First Token
    KPI: TTFT (p95) ≤ 200ms
    MetricType: LLM_TTFT

    Validation source:
        - /_internal/metrics/kpis/llm → ttft_ms.p95
        - Client-side invocation submission + server-reported TTFT

    This test creates concurrent chat sessions that trigger LLM streaming
    responses, then validates the server-recorded TTFT metric stays within
    the 200ms p95 target.

Run with:
    make test-performance
"""

from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING

import pytest

from tests.performance.chat_window.conftest import create_chat_session_id, send_chat_message
from tests.performance.conftest import poll_for_component_kpis

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

TARGET_TTFT_P95_MS = 200
NUM_SESSIONS = 20
MAX_WORKERS = 10


def _submit_chat_for_streaming(
    nexus_api: NexusApiRegistry,
    session_id: str,
    *,
    credential_id: str | None = None,
) -> tuple[float, bool, str | None]:
    """Submit a chat message that triggers an LLM streaming response.

    Returns (elapsed_ms, success, invocation_id).
    The elapsed_ms here is the API acceptance time, not the TTFT itself —
    TTFT is measured server-side via the LLMStreamTracker.
    """
    return send_chat_message(
        nexus_api,
        session_id,
        "Explain the concept of distributed systems in detail.",
        credential_id=credential_id,
    )


class TestChatStreamingTTFT:
    """13.2 — Chat streaming responses: TTFT (p95) ≤ 200ms.

    Validates:
        - Server-side LLM TTFT metric (llm → ttft_ms.p95) ≤ 200ms
        - Invocations are accepted successfully under concurrent load

    TTFT (Time To First Token) is measured server-side by the
    LLMStreamTracker which records the delta between
    ``on_chat_model_start`` and the first ``on_chat_model_stream`` event
    in the LangGraph streaming pipeline.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        llm_invocation_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_streaming_ttft_p95_under_target(
        self,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
    ) -> None:
        """Server-reported TTFT p95 must be ≤ 200ms."""
        session_ids = [create_chat_session_id() for _ in range(NUM_SESSIONS)]
        invocation_ids: list[str] = []
        total_successes = 0
        total_failures = 0

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures: list[Future[tuple[float, bool, str | None]]] = [
                executor.submit(
                    _submit_chat_for_streaming,
                    nexus_api,
                    sid,
                    credential_id=llm_credential_id,
                )
                for sid in session_ids
            ]

            for future in as_completed(futures):
                _, success, inv_id = future.result()
                if success:
                    total_successes += 1
                    if inv_id:
                        invocation_ids.append(inv_id)
                else:
                    total_failures += 1

        assert total_successes > 0, (
            f"No chat invocations succeeded\n  Sessions attempted: {NUM_SESSIONS}\n  Failures: {total_failures}"
        )

        kpis = poll_for_component_kpis(
            nexus_api.internal_metrics,
            "llm",
            timeout=30.0,
        )
        ttft_metrics = kpis.get("metrics", {}).get("ttft_ms", {})
        server_ttft_p95 = ttft_metrics.get("p95", 0)
        server_ttft_count = ttft_metrics.get("count", 0)

        assert server_ttft_count > 0, (
            f"No TTFT records found in LLM KPIs after {total_successes} "
            f"successful invocations\n"
            f"  Invocations created: {len(invocation_ids)}\n"
            f"  LLM KPI metrics: {kpis.get('metrics', {})}"
        )

        assert server_ttft_p95 <= TARGET_TTFT_P95_MS, (
            f"Server-reported TTFT p95 {server_ttft_p95:.1f}ms exceeds "
            f"target {TARGET_TTFT_P95_MS}ms\n"
            f"  TTFT count: {server_ttft_count}\n"
            f"  TTFT p50: {ttft_metrics.get('p50', 'N/A')}ms\n"
            f"  TTFT p99: {ttft_metrics.get('p99', 'N/A')}ms\n"
            f"  Successful invocations: {total_successes}/{NUM_SESSIONS}"
        )
