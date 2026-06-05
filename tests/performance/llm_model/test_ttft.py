"""Suite 10 — LLM Model (Direct): Time to First Token KPI (10.4).

Test 10.4: Streaming LLM responses — 50 requests
    KPI: Time to First Token (TTFT) — baseline measurement
    MetricType: LLM_TTFT
    Validation: client-side TTFT p95

Run with:
    make test-performance
"""

from __future__ import annotations

import itertools
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import httpx
import pytest
import structlog

from tests.performance.conftest import compute_percentile
from tests.performance.llm_model.conftest import (
    CONCURRENT_WORKERS,
    DIRECT_LLM_PROMPTS,
    MAX_TOKENS,
    OPENROUTER_BASE_URL,
    REQUEST_TIMEOUT_S,
    get_direct_llm_model,
    probe_openrouter_or_skip,
)

pytestmark = pytest.mark.performance

logger = structlog.stdlib.get_logger(__name__)

STREAMING_REQUESTS = 50


def _stream_openrouter_ttft(
    api_key: str,
    prompt: str,
    *,
    model: str,
    base_url: str = OPENROUTER_BASE_URL,
) -> tuple[float, bool, int]:
    """Send a streaming chat-completion request and measure TTFT.

    TTFT is the wall-clock time from request start to the first
    ``data:`` SSE chunk that contains token content.

    Returns (ttft_ms, success, status_code).
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/syntara-orchestration/syntara",
        "X-Title": "Nexus Performance Test",
    }
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": MAX_TOKENS,
        "temperature": 0.0,
        "stream": True,
    }

    start = time.monotonic()
    try:
        with httpx.stream(
            "POST",
            f"{base_url}/chat/completions",
            headers=headers,
            json=payload,
            timeout=REQUEST_TIMEOUT_S,
        ) as response:
            if response.status_code != 200:
                return (time.monotonic() - start) * 1000, False, response.status_code

            for raw_line in response.iter_lines():
                stripped = raw_line.strip()
                if not stripped or stripped.startswith(":"):
                    continue
                sse_data = stripped.removeprefix("data: ")
                if sse_data == "[DONE]":
                    break
                try:
                    chunk = json.loads(sse_data)
                    content = chunk["choices"][0]["delta"]["content"]
                except (json.JSONDecodeError, KeyError, IndexError, TypeError):
                    continue
                if content:
                    ttft_ms = (time.monotonic() - start) * 1000
                    return ttft_ms, True, response.status_code

            # 200 but no content tokens received — treat as failure
            return (time.monotonic() - start) * 1000, False, response.status_code
    except Exception as exc:
        elapsed_ms = (time.monotonic() - start) * 1000
        logger.warning(
            "Streaming OpenRouter call failed",
            error_type=type(exc).__name__,
            elapsed_ms=f"{elapsed_ms:.1f}",
        )
        return elapsed_ms, False, 0


class TestDirectLLMTimeToFirstToken:
    """10.4 — Streaming LLM responses — 50 requests.

    Validates:
        - Client-measured TTFT p95 is captured as a baseline

    The test sends 50 streaming requests to the OpenRouter
    ``/v1/chat/completions`` endpoint with ``stream: true`` and
    records the time from request start to the first SSE data chunk.
    This is a baseline measurement — the p95 value is reported for
    future threshold tuning.
    """

    def test_streaming_ttft_baseline(
        self,
        openrouter_api_key: str,
    ) -> None:
        """50 streaming OpenRouter requests; capture TTFT baseline."""
        model = get_direct_llm_model()
        probe_openrouter_or_skip(openrouter_api_key, model)

        prompts = list(
            itertools.islice(
                itertools.cycle(DIRECT_LLM_PROMPTS),
                STREAMING_REQUESTS,
            )
        )

        ttft_values: list[float] = []
        successes = 0
        failures = 0
        status_counts: dict[int, int] = {}

        with ThreadPoolExecutor(max_workers=CONCURRENT_WORKERS) as executor:
            futures = [
                executor.submit(
                    _stream_openrouter_ttft,
                    openrouter_api_key,
                    prompt,
                    model=model,
                )
                for prompt in prompts
            ]
            for future in as_completed(futures):
                ttft_ms, ok, status_code = future.result()
                status_counts[status_code] = status_counts.get(status_code, 0) + 1
                if ok:
                    ttft_values.append(ttft_ms)
                    successes += 1
                else:
                    failures += 1

        assert successes > 0, (
            f"All {STREAMING_REQUESTS} streaming requests failed. "
            f"Status distribution: {status_counts}. "
            f"Check PERF_TEST_OPENROUTER_API_KEY and model '{model}'."
        )

        client_p95 = compute_percentile(ttft_values, 95)
        client_p50 = compute_percentile(ttft_values, 50)
        client_min = min(ttft_values)
        client_max = max(ttft_values)

        diag = (
            f"\n--- Direct LLM TTFT baseline results (10.4) ---\n"
            f"  model={model}\n"
            f"  total_requests={STREAMING_REQUESTS}, "
            f"successes={successes}, failures={failures}\n"
            f"  client TTFT: min={client_min:.1f}ms, "
            f"p50={client_p50:.1f}ms, p95={client_p95:.1f}ms, "
            f"max={client_max:.1f}ms\n"
            f"  status_distribution={status_counts}\n"
        )

        assert client_p95 > 0, f"TTFT p95 is zero — measurement may be broken{diag}"

        logger.info(
            "TTFT baseline captured",
            model=model,
            p50_ms=round(client_p50, 1),
            p95_ms=round(client_p95, 1),
            samples=successes,
        )
