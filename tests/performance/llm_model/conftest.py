"""Shared fixtures and helpers for Suite 10: LLM Model (Direct) performance tests.

These tests call the OpenRouter API directly (bypassing Nexus) to establish
a baseline for raw LLM latency, then cross-reference against the Nexus
internal metrics endpoint.

The OpenRouter API key must be provided via the
``PERF_TEST_OPENROUTER_API_KEY`` environment variable.  If the key is
missing or invalid the test logs the failure and exits immediately.

Prerequisites:
    - ``PERF_TEST_OPENROUTER_API_KEY`` set to a valid OpenRouter API key
    - APP_BASE_URL pointing to the Nexus deployment (for KPI validation)
    - metrics.perf_test_mode enabled on the target instance

Run with:
    make test-performance
"""

from __future__ import annotations

import itertools
import os
import time
from concurrent.futures import Future, ThreadPoolExecutor

import httpx
import pytest
import structlog

logger = structlog.get_logger(__name__)

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

DEFAULT_MODEL = "anthropic/claude-sonnet-4"

DIRECT_LLM_PROMPTS: list[str] = [
    "Reply with exactly one word: hello.",
    "What is 2+2? Reply with just the number.",
    "Say 'pong'.",
    "Name one color.",
    "Reply with 'ok'.",
]

CONCURRENT_WORKERS = 10
REQUEST_TIMEOUT_S = 30.0
MAX_TOKENS = 20


def get_direct_llm_model() -> str:
    """Return the model to use for direct LLM calls.

    Uses ``PERF_TEST_DIRECT_LLM_MODEL`` env var if set, otherwise
    falls back to ``DEFAULT_MODEL``.
    """
    return os.environ.get("PERF_TEST_DIRECT_LLM_MODEL", DEFAULT_MODEL)


def call_openrouter(
    api_key: str,
    prompt: str,
    *,
    model: str,
    base_url: str = OPENROUTER_BASE_URL,
    max_tokens: int = MAX_TOKENS,
) -> tuple[float, bool, int]:
    """Send a single chat-completion request to OpenRouter.

    Returns (elapsed_ms, success, status_code).
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
        "max_tokens": max_tokens,
        "temperature": 0.0,
    }

    start = time.monotonic()
    try:
        response = httpx.post(
            f"{base_url}/chat/completions",
            headers=headers,
            json=payload,
            timeout=REQUEST_TIMEOUT_S,
        )
        elapsed_ms = (time.monotonic() - start) * 1000
        return elapsed_ms, response.status_code == 200, response.status_code
    except Exception as exc:
        elapsed_ms = (time.monotonic() - start) * 1000
        logger.warning(
            "Direct OpenRouter call failed",
            exc_type=type(exc).__name__,
            elapsed_ms=f"{elapsed_ms:.1f}",
        )
        return elapsed_ms, False, 0


def probe_openrouter_or_skip(api_key: str, model: str) -> None:
    """Send a single probe request; ``pytest.skip`` on failure."""
    _probe_ms, probe_ok, probe_status = call_openrouter(
        api_key,
        DIRECT_LLM_PROMPTS[0],
        model=model,
    )
    if not probe_ok:
        pytest.skip(
            f"OpenRouter probe failed (HTTP {probe_status}) — "
            f"skipping. Verify PERF_TEST_OPENROUTER_API_KEY and model '{model}'."
        )


def run_rate_window(
    api_key: str,
    model: str,
    *,
    target_rps: int,
    duration: int,
    max_workers: int = CONCURRENT_WORKERS,
) -> tuple[list[float], int, int, float]:
    """Fire requests at *target_rps* for *duration* seconds.

    Returns (response_times, successes, errors, wall_time_seconds).
    """
    prompts = itertools.cycle(DIRECT_LLM_PROMPTS)
    interval = 1.0 / target_rps
    futures: list[Future[tuple[float, bool, int]]] = []

    window_start = time.monotonic()
    window_end = window_start + duration
    next_send = window_start

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        while True:
            now = time.monotonic()
            if now >= window_end:
                break
            if now >= next_send:
                fut = executor.submit(
                    call_openrouter,
                    api_key,
                    next(prompts),
                    model=model,
                )
                futures.append(fut)
                next_send += interval
            else:
                time.sleep(min(next_send - now, 0.001))

    response_times: list[float] = []
    successes = 0
    errors = 0
    for fut in futures:
        try:
            elapsed_ms, ok, _ = fut.result(timeout=REQUEST_TIMEOUT_S)
        except Exception:
            elapsed_ms, ok = REQUEST_TIMEOUT_S * 1000, False
        response_times.append(elapsed_ms)
        if ok:
            successes += 1
        else:
            errors += 1

    wall_time = time.monotonic() - window_start
    return response_times, successes, errors, wall_time


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def openrouter_api_key() -> str:
    """Provide the OpenRouter API key or skip if unavailable."""
    key = os.environ.get("PERF_TEST_OPENROUTER_API_KEY")
    if not key:
        pytest.skip("PERF_TEST_OPENROUTER_API_KEY is not set — skipping Suite 10 (LLM Model Direct)")

    return key
