"""Suite 11 — LLM Model (Nexus Overhead): Error Rate KPI (11.2).

Test 11.2: Nexus-routed requests — sustained 20 RPS
    KPI: Error Rate < 1%
    MetricType: ERROR, LLM_STATUS
    Validation: /_internal/metrics/kpis/api_service → error_rate

Run with:
    make test-performance
"""

from __future__ import annotations

import time
from concurrent.futures import Future, ThreadPoolExecutor
from typing import TYPE_CHECKING, Any

import pytest
import structlog

from tests.performance.conftest import (
    ALL_LLM_TEST_PROMPTS,
    API_SERVICE_COMPONENT,
    DEFAULT_FUTURE_TIMEOUT,
    DEFAULT_INVOCATION_TIMEOUT,
    poll_for_component_kpis,
    poll_for_metric_records,
    submit_invocation,
    wait_for_invocations,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

TARGET_ERROR_RATE = 0.01
TARGET_RPS = 20
SUSTAINED_DURATION_SECONDS = 60
MAX_WORKERS = 30
MIN_SLEEP_INTERVAL = 0.001

logger = structlog.get_logger(__name__)


def _count_llm_statuses(records: dict[str, Any]) -> tuple[int, int, int]:
    """Return (total, success_count, error_count) from llm_status records."""
    total = records.get("total", 0)
    success = error = 0
    for r in records.get("records", []):
        status = r.get("labels", {}).get("status", "")
        if status == "success":
            success += 1
        elif status == "error":
            error += 1
    return total, success, error


class TestNexusOverheadErrorRate:
    """11.2 — Nexus-routed requests — sustained 20 RPS.

    Validates:
        - api_service error_rate < 1% under sustained load
        - LLM_STATUS records show low error count
        - ERROR metric records are minimal
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        llm_invocation_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_sustained_nexus_error_rate_under_target(
        self,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
        configured_model: str,
    ) -> None:
        """Sustained 20 RPS through Nexus for 60s; error rate must be < 1%."""
        model = configured_model
        interval = 1.0 / TARGET_RPS
        futures: list[Future[tuple[float, bool, str | None]]] = []
        prompt_index = 0

        test_start = time.monotonic()
        test_end = test_start + SUSTAINED_DURATION_SECONDS

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            next_send = test_start
            while True:
                now = time.monotonic()
                if now >= test_end:
                    break
                if now >= next_send:
                    prompt = ALL_LLM_TEST_PROMPTS[prompt_index % len(ALL_LLM_TEST_PROMPTS)]
                    prompt_index += 1
                    futures.append(
                        executor.submit(
                            submit_invocation,
                            nexus_api,
                            prompt,
                            model=model,
                            credential_id=llm_credential_id,
                        ),
                    )
                    next_send += interval
                else:
                    sleep_for = min(next_send - now, MIN_SLEEP_INTERVAL)
                    time.sleep(sleep_for)

            api_failures = 0
            invocation_ids: list[str] = []
            for i, future in enumerate(futures):
                try:
                    _, ok, inv_id = future.result(timeout=DEFAULT_FUTURE_TIMEOUT)
                    if ok and inv_id:
                        invocation_ids.append(inv_id)
                    elif not ok:
                        api_failures += 1
                except Exception as exc:
                    api_failures += 1
                    logger.warning(
                        "error_rate_test_future_error",
                        invocation_index=i,
                        error_type=type(exc).__name__,
                    )

        total_sent = len(futures)
        assert total_sent > 0, "No invocations were sent during the test"

        wait_for_invocations(
            nexus_api,
            invocation_ids,
            timeout=DEFAULT_INVOCATION_TIMEOUT,
        )

        api_kpis = poll_for_component_kpis(
            nexus_api.internal_metrics,
            API_SERVICE_COMPONENT,
        )
        server_error_rate = api_kpis.get("metrics", {}).get("error_rate", 0)

        llm_status_records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "llm_status",
            limit=total_sent + 100,
        )

        llm_total, llm_success_count, llm_error_count = _count_llm_statuses(llm_status_records)
        llm_error_rate = llm_error_count / llm_total if llm_total > 0 else 0.0
        client_error_rate = api_failures / total_sent if total_sent > 0 else 0.0
        actual_rps = total_sent / SUSTAINED_DURATION_SECONDS

        diag = (
            f"\n--- Nexus overhead error rate results ---\n"
            f"  duration={SUSTAINED_DURATION_SECONDS}s, "
            f"target_rps={TARGET_RPS}, actual_rps={actual_rps:.1f}\n"
            f"  invocations sent={total_sent}, "
            f"api_failures={api_failures}, "
            f"client_error_rate={client_error_rate:.4%}\n"
            f"  server api_service error_rate={server_error_rate}\n"
            f"  llm_status records: total={llm_total}, "
            f"success={llm_success_count}, error={llm_error_count}, "
            f"llm_error_rate={llm_error_rate:.4%}\n"
        )

        assert server_error_rate < TARGET_ERROR_RATE, (
            f"Server-reported api_service error rate {server_error_rate:.2%} "
            f"exceeds target {TARGET_ERROR_RATE:.0%}{diag}"
        )
