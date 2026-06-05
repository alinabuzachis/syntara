"""Suite 10 — LLM Model (Direct): Latency vs Input Size KPI (10.5).

Test 10.5: Varying prompt sizes (100, 500, 2000, 5000 tokens)
    KPI: Latency vs Input Size — linear scaling
    MetricType: LLM_DURATION, LLM_TOKENS_INPUT
    Validation: client-side duration correlated with token count

Run with:
    make test-performance
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed

import pytest
import structlog

from tests.performance.conftest import compute_percentile
from tests.performance.llm_model.conftest import (
    call_openrouter,
    get_direct_llm_model,
    probe_openrouter_or_skip,
)

pytestmark = pytest.mark.performance

logger = structlog.stdlib.get_logger(__name__)

TOKEN_SIZES = [100, 500, 2000, 5000]
REQUESTS_PER_SIZE = 10
CONCURRENT_WORKERS = 5

FILLER_WORD = "hello "
APPROX_CHARS_PER_TOKEN = 4


def _build_prompt(target_tokens: int) -> str:
    """Build a prompt that is approximately *target_tokens* tokens long."""
    filler_length = target_tokens * APPROX_CHARS_PER_TOKEN
    filler = (FILLER_WORD * (filler_length // len(FILLER_WORD) + 1))[:filler_length]
    return f"Repeat the word 'ok'. Ignore the following filler text:\n{filler}"


def _compute_scaling_ratio(
    size_latencies: dict[int, list[float]],
) -> float | None:
    """Compute the ratio of largest-to-smallest median latency.

    For perfectly linear scaling this equals largest_size / smallest_size.
    Returns ``None`` if there are fewer than two size buckets with data.
    """
    medians: list[tuple[int, float]] = []
    for size in sorted(size_latencies):
        values = size_latencies[size]
        if values:
            medians.append((size, compute_percentile(values, 50)))

    if len(medians) < 2:
        return None

    smallest_size, smallest_median = medians[0]
    largest_size, largest_median = medians[-1]

    if smallest_median <= 0:
        return None

    actual_ratio = largest_median / smallest_median
    ideal_ratio = largest_size / smallest_size
    return actual_ratio / ideal_ratio


class TestLatencyVsInputSize:
    """10.5 — Varying prompt sizes (100, 500, 2000, 5000 tokens).

    Validates:
        - Latency scales approximately linearly with input token count
        - The scaling ratio (actual / ideal) should be <= 3.0
          (generous bound — sub-linear is fine, super-linear by > 3x
          indicates a problem)

    For each token size the test sends 10 requests with a filler prompt
    of that approximate length, measures p50 latency, and checks that
    the ratio of largest-to-smallest median latency does not exceed 3x
    the ideal linear ratio.
    """

    MAX_SCALING_RATIO = 3.0

    def test_latency_scales_linearly_with_input(
        self,
        openrouter_api_key: str,
    ) -> None:
        """Latency across prompt sizes must scale roughly linearly."""
        model = get_direct_llm_model()
        probe_openrouter_or_skip(openrouter_api_key, model)

        size_latencies: dict[int, list[float]] = {s: [] for s in TOKEN_SIZES}
        size_failures: dict[int, int] = dict.fromkeys(TOKEN_SIZES, 0)

        for token_size in TOKEN_SIZES:
            prompt = _build_prompt(token_size)
            with ThreadPoolExecutor(max_workers=CONCURRENT_WORKERS) as executor:
                futures = [
                    executor.submit(
                        call_openrouter,
                        openrouter_api_key,
                        prompt,
                        model=model,
                        max_tokens=10,
                    )
                    for _ in range(REQUESTS_PER_SIZE)
                ]
                for future in as_completed(futures):
                    elapsed_ms, ok, _ = future.result()
                    if ok:
                        size_latencies[token_size].append(elapsed_ms)
                    else:
                        size_failures[token_size] += 1

        total_successes = sum(len(v) for v in size_latencies.values())
        assert total_successes > 0, f"All requests failed across all token sizes. Failures per size: {size_failures}"

        scaling_ratio = _compute_scaling_ratio(size_latencies)

        diag_parts = ["\n--- Latency vs input size results (10.5) ---", f"  model={model}"]
        for size in TOKEN_SIZES:
            values = size_latencies[size]
            fails = size_failures[size]
            if values:
                p50 = compute_percentile(values, 50)
                p95 = compute_percentile(values, 95)
                diag_parts.append(f"  ~{size} tokens: n={len(values)}, fails={fails}, p50={p50:.0f}ms, p95={p95:.0f}ms")
            else:
                diag_parts.append(f"  ~{size} tokens: n=0, fails={fails}")

        diag_parts.append(
            f"  scaling_ratio={f'{scaling_ratio:.2f}' if scaling_ratio is not None else 'N/A'} "
            f"(max allowed={self.MAX_SCALING_RATIO})"
        )
        diag = "\n".join(diag_parts) + "\n"

        sizes_with_data = sum(1 for v in size_latencies.values() if v)
        assert sizes_with_data >= 2, f"Need at least 2 token sizes with data to measure scaling{diag}"

        assert scaling_ratio is not None, f"Could not compute scaling ratio{diag}"
        assert scaling_ratio <= self.MAX_SCALING_RATIO, (
            f"Latency scaling ratio {scaling_ratio:.2f} exceeds max allowed {self.MAX_SCALING_RATIO}{diag}"
        )

        logger.info(
            "Latency scaling baseline captured",
            model=model,
            scaling_ratio=round(scaling_ratio, 2),
            sizes_tested=sizes_with_data,
        )
