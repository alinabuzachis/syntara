"""Suite 15 — Cost Tracking: Effective Cost per Token (15.3).

Test 15.3: Run identical tasks on different models
    KPI: Effective Cost per Token — Monitor trends
    MetricType: LLM_TOKENS_INPUT, LLM_TOKENS_OUTPUT
    Validation: Total cost / total tokens, grouped by model

Run with:
    make test-performance
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any
from uuid import uuid4

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

INVOCATIONS_PER_MODEL = 10
INVOCATION_TERMINAL_TIMEOUT = 120.0


def _run_model_invocations(
    nexus_api: NexusApiRegistry,
    model: str,
    prompts: list[str],
    credential_id: str | None,
    pricing: dict[str, dict[str, float]],
) -> dict[str, Any]:
    """Submit prompts for a single model and collect token/cost results."""
    nexus_api.internal_metrics.reset_store().assert_successful()

    session_id = f"perf-suite15-cpt-{model.split('/')[-1]}-{uuid4().hex[:8]}"
    invocation_ids: list[str] = []

    for i in range(INVOCATIONS_PER_MODEL):
        prompt = prompts[i % len(prompts)]
        _, ok, inv_id = submit_invocation(
            nexus_api,
            prompt,
            session_id=session_id,
            model=model,
            credential_id=credential_id,
        )
        if ok and inv_id:
            invocation_ids.append(inv_id)

    completed = 0
    for inv_id in invocation_ids:
        parsed = poll_for_invocation_terminal_status(
            nexus_api,
            inv_id,
            timeout=INVOCATION_TERMINAL_TIMEOUT,
        )
        if str(parsed.get("status", "")) == "completed":
            completed += 1

    total_input, total_output, source, token_diag = collect_token_totals(
        nexus_api,
        record_limit=INVOCATIONS_PER_MODEL * 2,
    )

    total_tokens = total_input + total_output
    total_cost = estimate_cost(model, total_input, total_output, pricing)
    cost_per_token = total_cost / total_tokens if total_tokens > 0 else 0.0

    return {
        "submitted": len(invocation_ids),
        "completed": completed,
        "total_input_tokens": total_input,
        "total_output_tokens": total_output,
        "total_tokens": total_tokens,
        "total_cost": total_cost,
        "cost_per_token": cost_per_token,
        "token_source": source,
        "token_diag": token_diag,
    }


class TestCostPerToken:
    """15.3 — Run identical tasks on different models.

    Validates:
        - The same set of prompts is submitted to each configured model
        - Token counts are collected from metric records or LLM component
          KPIs (fallback when LLM provider doesn't return usage metadata)
        - Effective cost per token (total_cost / total_tokens) is
          computable per model
        - Results are reported for cross-model cost comparison (trend
          monitoring — no hard threshold)

    The test resets the metrics store between models so each model's
    token data is isolated.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        llm_invocation_enabled: None,
    ) -> None:
        pass

    def test_effective_cost_per_token_across_models(
        self,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
    ) -> None:
        """Submit identical prompts to each model; cost per token must be computable."""
        models = get_configured_models()
        assert len(models) > 0, "No test models configured"
        pricing = get_model_pricing()
        prompts = ALL_COST_PROMPTS[:INVOCATIONS_PER_MODEL]

        model_results: dict[str, dict[str, Any]] = {}
        for model in models:
            model_results[model] = _run_model_invocations(
                nexus_api,
                model,
                prompts,
                llm_credential_id,
                pricing,
            )

        diag_parts = ["\n--- Effective cost per token by model (15.3) ---"]
        models_with_data = 0

        for model, result in model_results.items():
            if result["total_tokens"] > 0:
                models_with_data += 1
            rates = pricing.get(model, {"input": "fallback", "output": "fallback"})
            diag_parts.append(
                f"  {model}: submitted={result['submitted']}, "
                f"completed={result['completed']}, "
                f"tokens={result['total_tokens']} "
                f"(in={result['total_input_tokens']}, "
                f"out={result['total_output_tokens']}), "
                f"cost=${result['total_cost']:.6f}, "
                f"cost_per_token=${result['cost_per_token']:.8f}, "
                f"rates={rates}, source={result['token_source']}"
            )

        diag = "\n".join(diag_parts) + "\n"

        total_completed = sum(r["completed"] for r in model_results.values())
        assert total_completed > 0, f"No invocations completed across any model.{diag}"

        if models_with_data == 0:
            first_diag = next(
                (r["token_diag"] for r in model_results.values() if r["token_diag"]),
                "",
            )
            pytest.skip(f"No token data found for any model. {first_diag}{diag}")

        for model, result in model_results.items():
            if result["completed"] > 0 and result["token_source"] != SOURCE_NONE:
                assert result["total_tokens"] > 0, (
                    f"Model '{model}' had {result['completed']} completions but "
                    f"zero tokens recorded (source={result['token_source']}).{diag}"
                )
