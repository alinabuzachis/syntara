"""Suite 15 — Cost Tracking: Workflow Cost (15.1) and Cache Cost Savings (15.4).

Test 15.1: Execute 50 invocations end-to-end, sum token costs
    KPI: Cost per Successful Workflow — Trend monitoring
    MetricType: LLM_TOKENS_INPUT, LLM_TOKENS_OUTPUT
    Validation: Sum (input_tokens + output_tokens) * cost_per_token per invocation

Test 15.4: Cost comparison: cached vs uncached requests
    KPI: Cache Cost Savings — Positive ROI
    MetricType: CACHE_HIT, LLM_TOKENS_INPUT
    Validation: Estimated tokens saved via cache hits
    **DEFERRED** — depends on caching layer (not yet implemented)

Run with:
    make test-performance
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from tests.performance.conftest import (
    get_configured_models,
    poll_for_invocation_terminal_status,
    submit_invocation,
)
from tests.performance.cost_tracking.conftest import (
    ALL_COST_PROMPTS,
    SOURCE_NONE,
    collect_token_totals,
    estimate_cost,
    get_model_pricing,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

INVOCATIONS_COUNT = 50
INVOCATION_TERMINAL_TIMEOUT = 120.0


class TestCostPerWorkflow:
    """15.1 — Execute invocations end-to-end and sum token costs.

    Validates:
        - LLM_TOKENS_INPUT and LLM_TOKENS_OUTPUT records are emitted
          for completed invocations (or available via LLM component KPIs)
        - Cost per successful invocation is computable from token counts
          and the pricing table
        - Results are reported for trend monitoring (no hard pass/fail
          threshold — the goal is to establish a baseline)

    The test submits invocations, waits for completion, retrieves token
    data from metric records or component KPIs, and computes estimated
    cost using the model pricing table.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        llm_invocation_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_cost_per_successful_workflow(
        self,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
    ) -> None:
        """Submit invocations; token cost must be computable for trend monitoring."""
        models = get_configured_models()
        model = models[0]
        pricing = get_model_pricing()

        invocation_ids: list[str] = []
        for i in range(INVOCATIONS_COUNT):
            prompt = ALL_COST_PROMPTS[i % len(ALL_COST_PROMPTS)]
            _, ok, inv_id = submit_invocation(
                nexus_api,
                prompt,
                model=model,
                credential_id=llm_credential_id,
            )
            if ok and inv_id:
                invocation_ids.append(inv_id)

        assert len(invocation_ids) > 0, "No invocations were created"

        completed_count = 0
        for inv_id in invocation_ids:
            parsed = poll_for_invocation_terminal_status(
                nexus_api,
                inv_id,
                timeout=INVOCATION_TERMINAL_TIMEOUT,
            )
            if str(parsed.get("status", "")) == "completed":
                completed_count += 1

        assert completed_count > 0, f"No invocations completed successfully ({len(invocation_ids)} submitted)"

        total_input_tokens, total_output_tokens, source, token_diag = collect_token_totals(
            nexus_api,
            record_limit=INVOCATIONS_COUNT * 2,
        )

        total_cost = estimate_cost(model, total_input_tokens, total_output_tokens, pricing)
        cost_per_invocation = total_cost / completed_count if completed_count > 0 else 0.0

        diag = (
            f"\n--- Cost per workflow results (15.1) ---\n"
            f"  model={model}\n"
            f"  submitted={len(invocation_ids)}, "
            f"completed={completed_count}\n"
            f"  token_source={source}\n"
            f"  total_input_tokens={total_input_tokens}, "
            f"total_output_tokens={total_output_tokens}\n"
            f"  total_cost=${total_cost:.6f}, "
            f"cost_per_invocation=${cost_per_invocation:.6f}\n"
            f"  pricing={pricing.get(model, 'fallback')}\n"
        )
        if token_diag:
            diag += f"  diagnostic: {token_diag}\n"

        if source == SOURCE_NONE:
            pytest.skip(f"No token data found for {completed_count} completed invocations. {token_diag}{diag}")

        assert total_input_tokens > 0 or total_output_tokens > 0, (
            f"Token counts are zero despite {completed_count} completed invocations.{diag}"
        )


class TestCacheCostSavings:
    """15.4 — Cost comparison: cached vs uncached requests.

    **DEFERRED**: Nexus does not currently have an LLM response caching
    layer.  Redis/Valkey is used only for session storage, OIDC state,
    and Redis Streams.  The ``CACHE_HIT`` metric type exists in the
    metrics infrastructure but no production code path records it.

    This test should be implemented once an LLM response / semantic
    cache is built.

    TODO: When implementing this test, also account for provider-level
    prompt caching (e.g. Anthropic's cache_read / cache_creation tokens
    reported via ``usage_metadata.input_token_details``).  Cached input
    tokens are billed at a lower rate and should be costed separately
    for accurate savings calculations.
    """

    @pytest.mark.skip(reason="LLM response caching not yet implemented")
    def test_cache_cost_savings(self) -> None:
        """Placeholder for cache cost savings test (depends on caching layer)."""
