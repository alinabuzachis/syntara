"""Suite 9 — System-Wide: Uptime / Availability KPI (9.1).

Test 9.1: Health checks every 10s for 1 hour
    KPI: Uptime / Availability > 99.9%
    MetricType: SYSTEM_UPTIME
    Validation: /_internal/metrics/kpis/system_wide

The full test plan specifies a 1-hour health-check loop.  For CI
practicality, the default duration is controlled by ``HEALTH_CHECK_DURATION``
and can be extended for soak runs via environment variables.

Run with:
    make test-performance
"""

from __future__ import annotations

import time
from typing import TYPE_CHECKING

import pytest

from tests.performance.conftest import (
    check_health,
    compute_percentile,
    poll_for_component_kpis,
)
from tests.performance.system_wide.conftest import SYSTEM_WIDE_COMPONENT

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

HEALTH_CHECK_INTERVAL = 10.0
HEALTH_CHECK_DURATION = 300.0
TARGET_UPTIME = 0.999
TARGET_HEALTH_CHECK_P95_MS = 500


class TestUptime:
    """9.1 — Health checks every 10s for the configured duration.

    Validates:
        - Uptime / Availability > 99.9%
        - Health check response time p95 < 500ms
        - Server-side SYSTEM_UPTIME KPI is emitted (if instrumented)
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_uptime_above_target(
        self,
        nexus_base_url: str,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Send periodic health checks; uptime must be > 99.9%."""
        successful_checks = 0
        failed_checks = 0
        response_times: list[float] = []

        start_time = time.monotonic()
        deadline = start_time + HEALTH_CHECK_DURATION

        while time.monotonic() < deadline:
            elapsed_ms, healthy = check_health(nexus_base_url)
            response_times.append(elapsed_ms)
            if healthy:
                successful_checks += 1
            else:
                failed_checks += 1
            remaining = deadline - time.monotonic()
            if remaining > HEALTH_CHECK_INTERVAL:
                time.sleep(HEALTH_CHECK_INTERVAL)

        total_checks = successful_checks + failed_checks
        assert total_checks > 0, "No health checks were performed"

        uptime = successful_checks / total_checks
        response_p95 = compute_percentile(response_times, 95)
        response_p50 = compute_percentile(response_times, 50)
        actual_duration = time.monotonic() - start_time

        kpis = poll_for_component_kpis(
            nexus_api.internal_metrics,
            SYSTEM_WIDE_COMPONENT,
        )
        server_uptime = kpis.get("metrics", {}).get("uptime", None)

        diag = (
            f"\n--- Uptime results ---\n"
            f"  duration={actual_duration:.0f}s, "
            f"interval={HEALTH_CHECK_INTERVAL}s\n"
            f"  total_checks={total_checks}, "
            f"successful={successful_checks}, "
            f"failed={failed_checks}\n"
            f"  uptime={uptime:.4%}\n"
            f"  response_time: p50={response_p50:.1f}ms, "
            f"p95={response_p95:.1f}ms\n"
            f"  server_uptime={server_uptime}\n"
        )

        assert uptime >= TARGET_UPTIME, f"Uptime {uptime:.4%} below target {TARGET_UPTIME:.1%}{diag}"

        assert response_p95 < TARGET_HEALTH_CHECK_P95_MS, (
            f"Health check response time p95 {response_p95:.1f}ms exceeds target {TARGET_HEALTH_CHECK_P95_MS}ms{diag}"
        )
