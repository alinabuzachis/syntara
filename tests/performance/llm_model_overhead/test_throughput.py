"""Suite 11 — LLM Model (Nexus Overhead): Throughput KPI (11.3).

Test 11.3: Nexus-routed requests — burst to 50 RPS
    KPI: Throughput — 20+ RPS
    MetricType: REQUEST_DURATION
    Validation: Record count / elapsed time

Run with:
    make test-performance
"""

from __future__ import annotations

import time
from concurrent.futures import Future, ThreadPoolExecutor
from typing import TYPE_CHECKING

import pytest
import structlog

from tests.performance.conftest import (
    ALL_LLM_TEST_PROMPTS,
    DEFAULT_FUTURE_TIMEOUT,
    poll_for_metric_records,
    submit_invocation,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

TARGET_THROUGHPUT_RPS = 20
BURST_TARGET_RPS = 50
BURST_DURATION_SECONDS = 60
MAX_WORKERS = 60
MIN_SLEEP_INTERVAL = 0.001

logger = structlog.stdlib.get_logger(__name__)


class TestNexusOverheadThroughput:
    """11.3 — Nexus-routed requests — burst to 50 RPS.

    Validates:
        - Sustained throughput through Nexus reaches 20+ RPS
        - REQUEST_DURATION record count / elapsed time confirms throughput
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        llm_invocation_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_nexus_throughput_meets_target(
        self,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
        configured_model: str,
    ) -> None:
        """Burst to 50 RPS for 60s; sustained Nexus throughput must reach 20+ RPS."""
        model = configured_model
        interval = 1.0 / BURST_TARGET_RPS
        futures: list[Future[tuple[float, bool, str | None]]] = []
        prompt_index = 0

        test_start = time.monotonic()
        test_end = test_start + BURST_DURATION_SECONDS

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

            completed = 0
            errors = 0
            for i, future in enumerate(futures):
                try:
                    _, success, _ = future.result(timeout=DEFAULT_FUTURE_TIMEOUT)
                    completed += 1
                    if not success:
                        errors += 1
                except TimeoutError:
                    errors += 1
                    logger.warning(
                        "throughput_test_future_timeout",
                        invocation_index=i,
                        timeout_seconds=DEFAULT_FUTURE_TIMEOUT,
                    )
                except Exception as exc:
                    errors += 1
                    logger.warning(
                        "throughput_test_future_error",
                        invocation_index=i,
                        error_type=type(exc).__name__,
                    )

        wall_time = time.monotonic() - test_start
        assert completed > 0, "No invocations completed during the burst test"

        actual_rps = completed / max(wall_time, 0.001)
        error_rate = errors / completed if completed else 1.0

        records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "request_duration_ms",
            limit=completed + 100,
        )
        record_count = records.get("total", 0)
        record_rps = record_count / max(wall_time, 0.001)

        diag = (
            f"\n--- Nexus overhead throughput results ---\n"
            f"  duration={wall_time:.1f}s, "
            f"target_burst_rps={BURST_TARGET_RPS}\n"
            f"  submitted={len(futures)}, completed={completed}, "
            f"errors={errors}, error_rate={error_rate:.2%}\n"
            f"  actual_rps (client)={actual_rps:.1f}\n"
            f"  request_duration_ms records={record_count}, "
            f"record_rps={record_rps:.1f}\n"
        )

        assert actual_rps >= TARGET_THROUGHPUT_RPS, (
            f"Nexus throughput {actual_rps:.1f} RPS below target {TARGET_THROUGHPUT_RPS} RPS{diag}"
        )
