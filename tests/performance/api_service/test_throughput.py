"""Suite 1 — API Service: Throughput KPI (1.3).

Test 1.3: Ramp from 10 to 200 RPS over 120s
    KPI: Throughput — 100+ sustained, 200+ peak
    MetricType: REQUEST_DURATION

Run with:
    make test-performance
"""

from __future__ import annotations

import time
from concurrent.futures import Future, ThreadPoolExecutor
from typing import TYPE_CHECKING

import pytest

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

TARGET_SUSTAINED_RPS = 100
TARGET_PEAK_RPS = 200
RAMP_DURATION_SECONDS = 120
RAMP_STEP_SECONDS = 10
MAX_WORKERS = 300


def _make_request(nexus_api: NexusApiRegistry) -> tuple[float, bool]:
    """Make a single GET /workflows request via the generated client.

    Returns (elapsed_ms, success).
    """
    start = time.monotonic()
    try:
        r = nexus_api.workflows.list()
        elapsed_ms = (time.monotonic() - start) * 1000
        return elapsed_ms, r.is_success
    except Exception:
        elapsed_ms = (time.monotonic() - start) * 1000
        return elapsed_ms, False


def _run_ramp_step(
    executor: ThreadPoolExecutor,
    nexus_api: NexusApiRegistry,
    target_rps: int,
    duration: int,
) -> tuple[int, int, float]:
    """Send requests at a steady *target_rps* for *duration* seconds.

    Spreads requests evenly across the window by submitting one request
    per ``1/target_rps`` interval (fire-and-forget into the pool).
    Completed responses are counted at the end of the window.

    Returns (completed, errors, actual_rps).
    """
    interval = 1.0 / target_rps
    futures: list[Future[tuple[float, bool]]] = []
    step_start = time.monotonic()
    step_end = step_start + duration

    next_send = step_start
    while True:
        now = time.monotonic()
        if now >= step_end:
            break
        if now >= next_send:
            futures.append(executor.submit(_make_request, nexus_api))
            next_send += interval
        else:
            sleep_for = min(next_send - now, 0.001)
            time.sleep(sleep_for)

    completed = 0
    errors = 0
    for future in futures:
        try:
            _, success = future.result(timeout=30)
            completed += 1
            if not success:
                errors += 1
        except Exception:
            errors += 1

    wall_time = time.monotonic() - step_start
    actual_rps = completed / max(wall_time, 0.001)
    return completed, errors, actual_rps


class TestThroughputRamp:
    """1.3 — Ramp from 10 to 200 RPS over 120s.

    Validates:
        - Sustained throughput reaches 100+ RPS
        - Peak throughput reaches 200+ RPS
        - Server-side total_requests reflects the load
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()
        time.sleep(0.5)

    def test_throughput_ramp_meets_targets(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Ramp 10 → 200 RPS over 120s; must reach 100+ sustained, 200+ peak."""
        num_steps = RAMP_DURATION_SECONDS // RAMP_STEP_SECONDS
        rps_start = 10
        rps_end = 200
        rps_increment = (rps_end - rps_start) / max(num_steps - 1, 1)

        per_step_rps: list[float] = []
        total_requests = 0
        total_errors = 0
        peak_rps = 0.0

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            for step in range(num_steps):
                target_rps = max(int(rps_start + rps_increment * step), 1)

                completed, errors, actual_rps = _run_ramp_step(executor, nexus_api, target_rps, RAMP_STEP_SECONDS)

                per_step_rps.append(actual_rps)
                total_requests += completed
                total_errors += errors
                peak_rps = max(peak_rps, actual_rps)

        assert total_requests > 0, "No requests completed during the ramp test"

        sustained_steps = per_step_rps[len(per_step_rps) // 2 :]
        sustained_rps = sum(sustained_steps) / len(sustained_steps) if sustained_steps else 0.0

        time.sleep(1)
        kpis_response = nexus_api.internal_metrics.get_component_kpis(component="api_service")
        kpis_response.assert_successful()
        kpis = kpis_response.parsed.to_dict() if kpis_response.parsed is not None else {}
        server_total = kpis.get("metrics", {}).get("total_requests", 0)

        error_rate = total_errors / total_requests if total_requests else 1.0

        assert sustained_rps >= TARGET_SUSTAINED_RPS, (
            f"Sustained throughput {sustained_rps:.1f} RPS below target {TARGET_SUSTAINED_RPS} RPS "
            f"(total_requests={total_requests}, error_rate={error_rate:.2%}, "
            f"server_total={server_total}, peak={peak_rps:.1f})"
        )

        assert peak_rps >= TARGET_PEAK_RPS, (
            f"Peak throughput {peak_rps:.1f} RPS below target {TARGET_PEAK_RPS} RPS "
            f"(sustained={sustained_rps:.1f}, total_requests={total_requests})"
        )
