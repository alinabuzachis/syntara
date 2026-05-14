"""Suite 10 — LLM Model (Direct): Response Time KPI (10.1).

Test 10.1: Direct LLM API calls (bypass Nexus) — 100 requests
    KPI: Response Time (p95) < 200ms
    MetricType: LLM_DURATION
    Validation: /_internal/metrics/kpis/llm → response_time_ms.p95

Run with:
    make test-performance
"""

from __future__ import annotations

import itertools
from concurrent.futures import ThreadPoolExecutor, as_completed

import pytest
import structlog

from tests.performance.conftest import compute_percentile
from tests.performance.llm_model.conftest import (
    CONCURRENT_WORKERS,
    DIRECT_LLM_PROMPTS,
    call_openrouter,
    get_direct_llm_model,
    probe_openrouter_or_skip,
)

pytestmark = pytest.mark.performance

logger = structlog.get_logger(__name__)

TOTAL_REQUESTS = 100
TARGET_P95_MS = 200


class TestDirectLLMResponseTime:
    """10.1 — Direct LLM API calls (bypass Nexus) — 100 requests.

    Validates:
        - Client-measured p95 response time < 200ms

    The test sends 100 concurrent requests to the OpenRouter
    ``/v1/chat/completions`` endpoint using minimal prompts (to
    minimise token-generation latency) and measures raw transport +
    model inference time.
    """

    def test_direct_llm_p95_under_target(
        self,
        openrouter_api_key: str,
    ) -> None:
        """100 direct OpenRouter requests; p95 must be < 200ms."""
        model = get_direct_llm_model()
        probe_openrouter_or_skip(openrouter_api_key, model)

        prompts = list(
            itertools.islice(
                itertools.cycle(DIRECT_LLM_PROMPTS),
                TOTAL_REQUESTS,
            )
        )

        response_times: list[float] = []
        successes = 0
        failures = 0
        status_counts: dict[int, int] = {}

        with ThreadPoolExecutor(max_workers=CONCURRENT_WORKERS) as executor:
            futures = [
                executor.submit(
                    call_openrouter,
                    openrouter_api_key,
                    prompt,
                    model=model,
                )
                for prompt in prompts
            ]
            for future in as_completed(futures):
                elapsed_ms, ok, status_code = future.result()
                response_times.append(elapsed_ms)
                status_counts[status_code] = status_counts.get(status_code, 0) + 1
                if ok:
                    successes += 1
                else:
                    failures += 1

        assert len(response_times) == TOTAL_REQUESTS, f"Expected {TOTAL_REQUESTS} responses, got {len(response_times)}"
        assert successes > 0, (
            f"All {TOTAL_REQUESTS} requests failed. "
            f"Status distribution: {status_counts}. "
            f"Check PERF_TEST_OPENROUTER_API_KEY and model '{model}'."
        )

        client_p95 = compute_percentile(response_times, 95)
        client_p50 = compute_percentile(response_times, 50)
        client_min = min(response_times)
        client_max = max(response_times)
        error_rate = failures / TOTAL_REQUESTS

        diag = (
            f"\n--- Direct LLM response time results (10.1) ---\n"
            f"  model={model}\n"
            f"  total_requests={TOTAL_REQUESTS}, "
            f"successes={successes}, failures={failures}\n"
            f"  error_rate={error_rate:.2%}\n"
            f"  client: min={client_min:.1f}ms, "
            f"p50={client_p50:.1f}ms, p95={client_p95:.1f}ms, "
            f"max={client_max:.1f}ms\n"
            f"  status_distribution={status_counts}\n"
        )

        assert client_p95 < TARGET_P95_MS, (
            f"Client-measured p95 response time {client_p95:.1f}ms exceeds target {TARGET_P95_MS}ms{diag}"
        )
