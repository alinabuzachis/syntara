"""Suite 10 — LLM Model (Direct): Throughput KPI (10.3).

Test 10.3: Direct LLM API calls — burst to 50 RPS
    KPI: Throughput 20+ RPS
    MetricType: LLM_DURATION
    Validation: Record count / elapsed time

Run with:
    make test-performance
"""

from __future__ import annotations

import pytest

from tests.performance.llm_model.conftest import (
    get_direct_llm_model,
    probe_openrouter_or_skip,
    run_rate_window,
)

pytestmark = pytest.mark.performance

BURST_RPS = 50
BURST_DURATION_SECONDS = 30
TARGET_THROUGHPUT_RPS = 20
BURST_WORKERS = 25


class TestDirectLLMThroughput:
    """10.3 — Direct LLM API calls — burst to 50 RPS.

    Validates:
        - Achieved throughput >= 20 RPS (successful completions / wall time)

    The test attempts to sustain 50 RPS for 30 seconds against the
    OpenRouter endpoint.  The KPI target is that at least 20 successful
    responses per second are achieved, confirming the provider can
    handle burst traffic.
    """

    def test_burst_throughput_above_target(
        self,
        openrouter_api_key: str,
    ) -> None:
        """Burst to 50 RPS for 30s; achieved throughput must be >= 20 RPS."""
        model = get_direct_llm_model()
        probe_openrouter_or_skip(openrouter_api_key, model)

        response_times, successes, errors, wall_time = run_rate_window(
            openrouter_api_key,
            model,
            target_rps=BURST_RPS,
            duration=BURST_DURATION_SECONDS,
            max_workers=BURST_WORKERS,
        )

        total = len(response_times)
        assert total > 0, "No requests completed during the burst window"

        achieved_rps = successes / wall_time if wall_time > 0 else 0.0
        target_rps_sent = total / wall_time if wall_time > 0 else 0.0

        diag = (
            f"\n--- Direct LLM throughput results (10.3) ---\n"
            f"  model={model}\n"
            f"  burst_target={BURST_RPS} RPS, duration={BURST_DURATION_SECONDS}s\n"
            f"  total_sent={total}, sent_rps={target_rps_sent:.1f}\n"
            f"  successes={successes}, errors={errors}\n"
            f"  wall_time={wall_time:.1f}s\n"
            f"  achieved_rps={achieved_rps:.1f} (target >= {TARGET_THROUGHPUT_RPS})\n"
        )

        assert achieved_rps >= TARGET_THROUGHPUT_RPS, (
            f"Achieved throughput {achieved_rps:.1f} RPS is below target {TARGET_THROUGHPUT_RPS} RPS{diag}"
        )
