"""Shared fixtures for Suite 15: Cost Tracking performance tests.

These tests run against a live Nexus deployment (typically OpenShift) and
validate the Cost Efficiency KPIs from the Nexus Performance Test Plan.

Suite-wide fixtures (perf_test_mode_enabled, llm_credential_id,
llm_invocation_enabled) and helpers (compute_percentile,
poll_for_component_kpis, poll_for_metric_records, submit_invocation,
find_llm_credential_id, poll_for_invocation_terminal_status,
get_configured_models) are defined in the parent
tests/performance/conftest.py and inherited automatically.
This file adds cost-tracking-specific pricing tables, helpers, and
prompt data.

Cost tracking tests exercise token usage monitoring via the invocation
API.  Each completed invocation records ``LLM_TOKENS_INPUT`` and
``LLM_TOKENS_OUTPUT`` metric records.  Cost is estimated client-side
using a fixed pricing table per model.

Prerequisites:
    - APP_BASE_URL pointing to the Nexus deployment
    - metrics.perf_test_mode enabled on the target instance
    - Valid admin credentials (APP_ADMIN_PASSWORD_PATH or .secrets/admin-password)
    - **LLM Provider credential** created and enabled on the deployment,
      OR ``E2E_LLM_CREDENTIAL_CONFIGURED=1`` env var set on the deployment
      with a valid ``openrouter_api_key`` in settings.

Run with:
    make test-performance
"""

from __future__ import annotations

import os
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

# ---------------------------------------------------------------------------
# Model pricing (USD per 1K tokens)
# Source: OpenRouter model pages, retrieved 2026-05-07
# https://openrouter.ai/anthropic/claude-sonnet-4
# https://openrouter.ai/openai/gpt-4o
# https://openrouter.ai/google/gemini-2.0-flash-001
# https://openrouter.ai/moonshotai/kimi-k2.6
# ---------------------------------------------------------------------------

DEFAULT_PRICING: dict[str, dict[str, float]] = {
    "anthropic/claude-sonnet-4": {"input": 0.003, "output": 0.015},
    "openai/gpt-4o": {"input": 0.0025, "output": 0.010},
    "google/gemini-2.0-flash-001": {"input": 0.0001, "output": 0.0004},
    "moonshotai/kimi-k2.6": {"input": 0.00075, "output": 0.0035},
}

FALLBACK_PRICE_PER_1K = {"input": 0.002, "output": 0.008}


def get_model_pricing() -> dict[str, dict[str, float]]:
    """Return model pricing table.

    Uses ``PERF_TEST_MODEL_PRICING`` env var (JSON) if set, otherwise
    falls back to ``DEFAULT_PRICING``.  Invalid JSON raises immediately
    so configuration errors are not silently ignored.
    """
    import json

    env_pricing = os.environ.get("PERF_TEST_MODEL_PRICING", "")
    if env_pricing.strip():
        return dict(json.loads(env_pricing))
    return dict(DEFAULT_PRICING)


def estimate_cost(
    model: str,
    input_tokens: int,
    output_tokens: int,
    pricing: dict[str, dict[str, float]] | None = None,
) -> float:
    """Estimate USD cost for a single invocation based on token counts.

    This is a pure calculation helper — it does **not** read the
    ``PERF_TEST_MODEL_PRICING`` env var itself.  Callers that need
    env-var overrides should pass ``pricing=get_model_pricing()``.

    Args:
        model: Model identifier (e.g. ``"openai/gpt-4o"``).
        input_tokens: Number of input (prompt) tokens.
        output_tokens: Number of output (completion) tokens.
        pricing: Pricing table mapping model names to
            ``{"input": <per_1K>, "output": <per_1K>}`` dicts.
            Falls back to ``DEFAULT_PRICING`` when *None*.

    Returns:
        Estimated cost in USD.

    """
    table = pricing or DEFAULT_PRICING
    rates = table.get(model, FALLBACK_PRICE_PER_1K)
    return (input_tokens * rates["input"] / 1000) + (output_tokens * rates["output"] / 1000)


def extract_token_records(
    records: dict[str, Any],
) -> list[dict[str, Any]]:
    """Extract individual token metric records with labels and values.

    Returns a list of dicts with keys: ``value``, ``labels``, and any
    other fields present in the raw record.
    """
    return [r for r in records.get("records", []) if isinstance(r.get("value"), (int, float)) and r["value"] >= 0]


SOURCE_NONE = "none"
SOURCE_RECORDS = "records"
SOURCE_KPIS = "kpis"

_STREAM_USAGE_HINT = (
    "The deployment's ChatOpenAI may be missing stream_usage=True "
    "(see openrouter_config.py). Without it, token counts are not "
    "included in streamed LLM responses and no llm_tokens_input/"
    "llm_tokens_output metrics are recorded."
)


def collect_token_totals(
    nexus_api: NexusApiRegistry,
    *,
    record_limit: int = 200,
    poll_timeout: float = 30.0,
) -> tuple[int, int, str, str]:
    """Collect total input/output token counts from available sources.

    Tries the ``llm_tokens_input`` / ``llm_tokens_output`` metric records
    first.  If no records are found (some LLM providers don't return token
    usage metadata), falls back to the LLM component KPIs which aggregate
    ``tokens_input`` / ``tokens_output`` from the same metric store.

    When neither source has data, queries ``llm_duration_ms`` to
    determine whether the LLM instrumentation ran at all and produces a
    targeted diagnostic hint.

    Returns:
        Tuple of (total_input_tokens, total_output_tokens, source, diag)
        where *source* is ``"records"``, ``"kpis"``, or ``"none"`` and
        *diag* is an empty string on success or a diagnostic message
        explaining why token data is missing.

    """
    from tests.performance.conftest import poll_for_component_kpis, poll_for_metric_records

    input_records = poll_for_metric_records(
        nexus_api.internal_metrics,
        "llm_tokens_input",
        limit=record_limit,
        timeout=poll_timeout,
    )
    output_records = poll_for_metric_records(
        nexus_api.internal_metrics,
        "llm_tokens_output",
        limit=record_limit,
        timeout=poll_timeout,
    )

    input_entries = extract_token_records(input_records)
    output_entries = extract_token_records(output_records)

    if input_entries or output_entries:
        return (
            sum(int(r["value"]) for r in input_entries),
            sum(int(r["value"]) for r in output_entries),
            SOURCE_RECORDS,
            "",
        )

    kpis = poll_for_component_kpis(
        nexus_api.internal_metrics,
        "llm",
        timeout=poll_timeout,
    )
    metrics = kpis.get("metrics", {})
    input_stats = metrics.get("tokens_input", {})
    output_stats = metrics.get("tokens_output", {})

    raw_input_sum = input_stats.get("sum")
    kpi_input = (
        int(raw_input_sum)
        if raw_input_sum is not None
        else int(input_stats.get("count", 0) * input_stats.get("mean", 0))
    )
    raw_output_sum = output_stats.get("sum")
    kpi_output = (
        int(raw_output_sum)
        if raw_output_sum is not None
        else int(output_stats.get("count", 0) * output_stats.get("mean", 0))
    )

    if kpi_input > 0 or kpi_output > 0:
        return kpi_input, kpi_output, SOURCE_KPIS, ""

    duration_records = poll_for_metric_records(
        nexus_api.internal_metrics,
        "llm_duration_ms",
        limit=10,
        timeout=5.0,
    )
    llm_calls_recorded = duration_records.get("total", 0) > 0

    if llm_calls_recorded:
        diag = "LLM duration/status metrics ARE recorded but token metrics are NOT. " + _STREAM_USAGE_HINT
    else:
        diag = (
            "No LLM metrics found at all (no llm_duration_ms records). "
            "The metrics recorder may not be active, or perf_test_mode "
            "may have been reset between invocation completion and "
            "metric collection."
        )

    return 0, 0, SOURCE_NONE, diag


# ---------------------------------------------------------------------------
# Workflow type prompts for token efficiency comparison (15.2)
# ---------------------------------------------------------------------------

WORKFLOW_TYPE_PROMPTS: dict[str, list[str]] = {
    "code_generation": [
        "Write a Python function to sort a list using merge sort",
        "Create a REST API endpoint that handles CRUD operations",
        "Implement a binary tree traversal algorithm in Python",
        "Write a Python decorator for caching function results",
        "Build a simple command-line calculator in Python",
    ],
    "analysis": [
        "Analyze the pros and cons of microservices architecture",
        "Explain how Kubernetes handles pod scheduling",
        "Compare PostgreSQL and MySQL for enterprise workloads",
        "Describe the key differences between REST and GraphQL",
        "Summarize best practices for database indexing",
    ],
    "simple_qa": [
        "What is a load balancer?",
        "Define continuous integration",
        "What does HTTPS stand for?",
        "Explain what an API gateway does",
        "What is the purpose of a reverse proxy?",
    ],
}

ALL_COST_PROMPTS: list[str] = [prompt for prompts in WORKFLOW_TYPE_PROMPTS.values() for prompt in prompts]
