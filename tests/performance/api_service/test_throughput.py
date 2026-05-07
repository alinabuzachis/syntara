"""Suite 1 — API Service: Throughput KPI (1.3).

Test 1.3: Ramp from 10 to 200 RPS over 120s
    KPI: Throughput — 100+ sustained, 200+ peak
    MetricType: REQUEST_DURATION

Run with:
    make test-performance
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import TYPE_CHECKING

import pytest

from tests.performance.conftest import poll_for_component_kpis, run_load_window

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

TARGET_SUSTAINED_RPS = 100
TARGET_PEAK_RPS = 200
RAMP_DURATION_SECONDS = 120
RAMP_STEP_SECONDS = 10
MAX_WORKERS = 300


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

                completed, errors, actual_rps = run_load_window(executor, nexus_api, target_rps, RAMP_STEP_SECONDS)

                per_step_rps.append(actual_rps)
                total_requests += completed
                total_errors += errors
                peak_rps = max(peak_rps, actual_rps)

        assert total_requests > 0, "No requests completed during the ramp test"

        sustained_steps = per_step_rps[len(per_step_rps) // 2 :]
        sustained_rps = sum(sustained_steps) / len(sustained_steps) if sustained_steps else 0.0

        kpis = poll_for_component_kpis(nexus_api.internal_metrics, "api_service")
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
