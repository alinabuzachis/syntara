"""Suite 8 — Database: Connection Pool Utilization KPI (8.2).

Test 8.2: Sustained load at 100 RPS for 5 minutes
    KPI: Pool Utilization
    Target: < 80% normal (average), < 95% peak
    MetricType: DATABASE_CONNECTION_POOL_UTILIZATION

Validation:
    /_internal/metrics/kpis/database → pool_utilization

Run with:
    make test-performance
"""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor
from typing import TYPE_CHECKING, Any

import pytest

from tests.performance.conftest import (
    compute_percentile,
    poll_for_component_kpis,
    poll_for_metric_records,
    run_load_window,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

TARGET_RPS = 100
SUSTAINED_DURATION_SECONDS = 300
SAMPLE_INTERVAL_SECONDS = 30
MAX_WORKERS = 150
POOL_RECOVERY_WAIT_SECONDS = 10

TARGET_NORMAL_UTILIZATION = 0.80
TARGET_PEAK_UTILIZATION = 0.95


class TestDatabasePoolUtilization:
    """8.2 — Sustained load at 100 RPS for 5 minutes.

    Validates:
        - Average pool utilization stays below 80% under sustained load
        - Peak pool utilization stays below 95%
        - Server-side KPI (database → pool_utilization) confirms targets
        - DATABASE_CONNECTION_POOL_UTILIZATION metric records are emitted
    """

    @staticmethod
    def _sample_pool_utilization(kpis: dict[str, Any]) -> dict[str, float]:
        """Extract pool utilization stats from KPI response."""
        pool_metrics = kpis.get("metrics", {}).get("pool_utilization", {})
        return {
            "p50": pool_metrics.get("p50", 0),
            "p95": pool_metrics.get("p95", 0),
            "p99": pool_metrics.get("p99", 0),
            "max": pool_metrics.get("max", 0),
            "mean": pool_metrics.get("mean", 0),
        }

    def test_pool_utilization_under_sustained_load(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """100 RPS for 5 minutes; pool utilization must be < 80% avg, < 95% peak."""
        num_windows = SUSTAINED_DURATION_SECONDS // SAMPLE_INTERVAL_SECONDS
        total_requests = 0
        total_errors = 0
        per_window_rps: list[float] = []
        utilization_samples: list[float] = []

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            for _ in range(num_windows):
                completed, errors, actual_rps = run_load_window(
                    executor, nexus_api, TARGET_RPS, SAMPLE_INTERVAL_SECONDS
                )
                total_requests += completed
                total_errors += errors
                per_window_rps.append(actual_rps)

                kpis = poll_for_component_kpis(nexus_api.internal_metrics, "database", timeout=5.0)
                pool_stats = self._sample_pool_utilization(kpis)
                if pool_stats["p95"] > 0:
                    utilization_samples.append(pool_stats["p95"])

        assert total_requests > 0, "No requests completed during sustained load test"

        kpis = poll_for_component_kpis(nexus_api.internal_metrics, "database")
        final_pool_stats = self._sample_pool_utilization(kpis)

        records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "database_connection_pool_utilization_ratio",
            limit=200,
        )

        record_values: list[float] = []
        for record in records.get("records", []):
            val = record.get("value")
            if isinstance(val, (int, float)):
                record_values.append(float(val))

        avg_utilization = final_pool_stats.get("mean", 0)
        peak_utilization = final_pool_stats.get("max", 0)

        if not avg_utilization and record_values:
            avg_utilization = sum(record_values) / len(record_values)
        if not peak_utilization and record_values:
            peak_utilization = max(record_values)

        sampled_peak = max(utilization_samples) if utilization_samples else 0
        peak_utilization = max(peak_utilization, sampled_peak)

        avg_rps = sum(per_window_rps) / len(per_window_rps) if per_window_rps else 0
        error_rate = total_errors / total_requests if total_requests else 1.0

        diag = (
            f"\n--- Pool utilization results ---\n"
            f"  duration={SUSTAINED_DURATION_SECONDS}s, "
            f"target_rps={TARGET_RPS}\n"
            f"  total_requests={total_requests}, "
            f"avg_rps={avg_rps:.1f}, "
            f"error_rate={error_rate:.2%}\n"
            f"  avg_utilization={avg_utilization:.4f} "
            f"({avg_utilization * 100:.1f}%)\n"
            f"  peak_utilization={peak_utilization:.4f} "
            f"({peak_utilization * 100:.1f}%)\n"
            f"  server_pool_stats={final_pool_stats}\n"
            f"  utilization_samples={len(utilization_samples)}\n"
            f"  metric_record_count={records.get('total', 0)}\n"
        )

        assert records.get("total", 0) > 0, f"No DATABASE_CONNECTION_POOL_UTILIZATION metric records emitted{diag}"

        if avg_utilization > 0:
            assert avg_utilization < TARGET_NORMAL_UTILIZATION, (
                f"Average pool utilization {avg_utilization * 100:.1f}% "
                f"exceeds normal target {TARGET_NORMAL_UTILIZATION * 100:.0f}%{diag}"
            )

        if peak_utilization > 0:
            assert peak_utilization < TARGET_PEAK_UTILIZATION, (
                f"Peak pool utilization {peak_utilization * 100:.1f}% "
                f"exceeds peak target {TARGET_PEAK_UTILIZATION * 100:.0f}%{diag}"
            )

    def test_pool_utilization_recovery_after_load(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """After a burst of load, pool utilization must recover below 80%.

        Sends a short burst at 100 RPS for 30s, waits for recovery period,
        then checks that utilization has dropped back to healthy levels.
        """
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            completed, errors, actual_rps = run_load_window(executor, nexus_api, TARGET_RPS, 30)

        assert completed > 0, "No requests completed during burst phase"

        time.sleep(POOL_RECOVERY_WAIT_SECONDS)

        kpis = poll_for_component_kpis(nexus_api.internal_metrics, "database")
        pool_stats = self._sample_pool_utilization(kpis)

        records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "database_connection_pool_utilization_ratio",
            limit=50,
        )

        recent_values: list[float] = []
        for record in records.get("records", []):
            val = record.get("value")
            if isinstance(val, (int, float)):
                recent_values.append(float(val))

        recovery_utilization = pool_stats.get("p50", 0)
        if not recovery_utilization and recent_values:
            recovery_utilization = compute_percentile(recent_values, 50)

        diag = (
            f"\n--- Pool recovery results ---\n"
            f"  burst_requests={completed}, burst_rps={actual_rps:.1f}, "
            f"burst_errors={errors}\n"
            f"  recovery_utilization={recovery_utilization:.4f} "
            f"({recovery_utilization * 100:.1f}%)\n"
            f"  server_pool_stats={pool_stats}\n"
            f"  recent_record_count={records.get('total', 0)}\n"
        )

        if recovery_utilization > 0:
            assert recovery_utilization < TARGET_NORMAL_UTILIZATION, (
                f"Post-load pool utilization {recovery_utilization * 100:.1f}% "
                f"did not recover below {TARGET_NORMAL_UTILIZATION * 100:.0f}%{diag}"
            )
