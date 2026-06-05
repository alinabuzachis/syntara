"""Suite 11 — LLM Model (Nexus Overhead): Response Time KPI (11.1).

Test 11.1: Same prompts through Nexus — 100 requests
    KPI: Response Time (p95) < 300ms
    MetricType: REQUEST_DURATION, LLM_DURATION
    Validation: Compare api_service.response_time_ms.p95 vs
                llm.response_time_ms.p95

Run with:
    make test-performance
"""

from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING, Any

import pytest
import structlog

from tests.performance.conftest import (
    ALL_LLM_TEST_PROMPTS,
    API_SERVICE_COMPONENT,
    DEFAULT_FUTURE_TIMEOUT,
    DEFAULT_INVOCATION_TIMEOUT,
    LLM_COMPONENT,
    compute_percentile,
    poll_for_component_kpis,
    submit_invocation,
    wait_for_invocations,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

logger = structlog.stdlib.get_logger(__name__)

REQUEST_COUNT = 100
TARGET_RESPONSE_TIME_P95_MS = 300
MAX_WORKERS = 20


class TestNexusOverheadResponseTime:
    """11.1 — Same prompts through Nexus — 100 requests.

    Validates:
        - api_service.response_time_ms.p95 < 300ms (total round-trip via Nexus)
        - Comparison between api_service p95 and llm p95 shows Nexus overhead
        - REQUEST_DURATION and LLM_DURATION metrics are both emitted
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        llm_invocation_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_nexus_routed_response_time_p95(
        self,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
        configured_model: str,
    ) -> None:
        """100 requests through Nexus; api_service response time p95 < 300ms."""
        model = configured_model
        client_times: list[float] = []
        invocation_ids: list[str] = []
        successes = 0
        failures = 0

        futures: list[Future[tuple[float, bool, str | None]]] = []
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            for i in range(REQUEST_COUNT):
                prompt = ALL_LLM_TEST_PROMPTS[i % len(ALL_LLM_TEST_PROMPTS)]
                futures.append(
                    executor.submit(
                        submit_invocation,
                        nexus_api,
                        prompt,
                        model=model,
                        credential_id=llm_credential_id,
                    ),
                )

        for i, fut in enumerate(as_completed(futures)):
            try:
                elapsed_ms, ok, inv_id = fut.result(timeout=DEFAULT_FUTURE_TIMEOUT)
                client_times.append(elapsed_ms)
                if ok:
                    successes += 1
                    if inv_id:
                        invocation_ids.append(inv_id)
                else:
                    failures += 1
            except Exception as exc:
                failures += 1
                logger.warning(
                    "nexus_overhead_response_time_future_error",
                    invocation_index=i,
                    error_type=type(exc).__name__,
                    error=str(exc),
                )

        assert len(client_times) > 0, "No invocations were attempted"

        wait_for_invocations(
            nexus_api,
            invocation_ids,
            timeout=DEFAULT_INVOCATION_TIMEOUT,
        )

        # Fetch server-side KPIs for cross-validation (optional, logged on failure)
        api_kpis: dict[str, Any] = {}
        llm_kpis: dict[str, Any] = {}
        try:
            api_kpis = poll_for_component_kpis(
                nexus_api.internal_metrics,
                API_SERVICE_COMPONENT,
            )
        except Exception as exc:
            logger.warning(
                "Failed to fetch api_service KPIs (optional cross-validation skipped)",
                error_type=type(exc).__name__,
                error=str(exc),
            )

        try:
            llm_kpis = poll_for_component_kpis(
                nexus_api.internal_metrics,
                LLM_COMPONENT,
            )
        except Exception as exc:
            logger.warning(
                "Failed to fetch llm KPIs (optional cross-validation skipped)",
                error_type=type(exc).__name__,
                error=str(exc),
            )

        api_response_time = api_kpis.get("metrics", {}).get("response_time_ms", {})
        api_p95 = api_response_time.get("p95", 0)
        api_count = api_response_time.get("count", 0)

        llm_response_time = llm_kpis.get("metrics", {}).get("response_time_ms", {})
        llm_p95 = llm_response_time.get("p95", 0)
        llm_count = llm_response_time.get("count", 0)

        client_p95 = compute_percentile(client_times, 95)
        client_p50 = compute_percentile(client_times, 50)

        overhead_ms = api_p95 - llm_p95 if api_p95 and llm_p95 else None

        diag = (
            f"\n--- Nexus overhead response time results ---\n"
            f"  total={REQUEST_COUNT}, "
            f"successes={successes}, failures={failures}\n"
            f"  client round-trip: "
            f"p50={client_p50:.1f}ms, p95={client_p95:.1f}ms\n"
            f"  server api_service: "
            f"count={api_count}, p95={api_p95}ms\n"
            f"  server llm: "
            f"count={llm_count}, p95={llm_p95}ms\n"
            f"  nexus overhead (api_p95 - llm_p95): {overhead_ms}ms\n"
            f"  api_service stats={api_response_time}\n"
            f"  llm stats={llm_response_time}\n"
        )

        assert api_count > 0, f"No REQUEST_DURATION records emitted — api_service metrics may not be configured{diag}"
        assert llm_count > 0, f"No LLM_DURATION records emitted — the LLM may not be configured{diag}"
        assert api_p95 < TARGET_RESPONSE_TIME_P95_MS, (
            f"Nexus-routed response time p95 {api_p95}ms exceeds target {TARGET_RESPONSE_TIME_P95_MS}ms{diag}"
        )
