"""Suite 10 — LLM Model (Direct): Error Rate KPI (10.2).

Test 10.2: Direct LLM API calls — sustained 20 RPS
    KPI: Error Rate < 1%
    MetricType: LLM_STATUS
    Validation: client-side error count / total

Run with:
    make test-performance
"""

from __future__ import annotations

import pytest

from tests.performance.llm_model.conftest import (
    CONCURRENT_WORKERS,
    get_direct_llm_model,
    probe_openrouter_or_skip,
    run_rate_window,
)

pytestmark = pytest.mark.performance

SUSTAINED_RPS = 20
SUSTAINED_DURATION_SECONDS = 60
TARGET_ERROR_RATE = 0.01  # < 1%


class TestDirectLLMErrorRate:
    """10.2 — Direct LLM API calls — sustained 20 RPS.

    Validates:
        - Client-measured error rate < 1% over a sustained load window

    The test sends requests at a steady 20 RPS for 60 seconds to the
    OpenRouter ``/v1/chat/completions`` endpoint and counts non-200
    responses as errors.
    """

    def test_sustained_error_rate_under_target(
        self,
        openrouter_api_key: str,
    ) -> None:
        """20 RPS for 60s; error rate must be < 1%."""
        model = get_direct_llm_model()
        probe_openrouter_or_skip(openrouter_api_key, model)

        _, successes, errors, _wall_time = run_rate_window(
            openrouter_api_key,
            model,
            target_rps=SUSTAINED_RPS,
            duration=SUSTAINED_DURATION_SECONDS,
            max_workers=CONCURRENT_WORKERS,
        )

        total = successes + errors
        assert total > 0, "No requests were sent during the sustained window"

        client_error_rate = errors / total
        actual_rps = total / SUSTAINED_DURATION_SECONDS

        diag = (
            f"\n--- Direct LLM error rate results (10.2) ---\n"
            f"  model={model}\n"
            f"  duration={SUSTAINED_DURATION_SECONDS}s, target_rps={SUSTAINED_RPS}\n"
            f"  total_requests={total}, actual_rps={actual_rps:.1f}\n"
            f"  successes={successes}, errors={errors}\n"
            f"  client_error_rate={client_error_rate:.2%}\n"
        )

        assert client_error_rate < TARGET_ERROR_RATE, (
            f"Client-measured error rate {client_error_rate:.2%} exceeds target {TARGET_ERROR_RATE:.0%}{diag}"
        )
