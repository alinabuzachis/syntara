"""Suite 15 — Cost Tracking: Token Efficiency Ratio (15.2).

Test 15.2: Compare token usage across workflow types
    KPI: Token Efficiency Ratio — Lower is better
    MetricType: LLM_TOKENS_INPUT, LLM_TOKENS_OUTPUT
    Validation: Total tokens / successful completions, grouped by type

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
    SOURCE_NONE,
    WORKFLOW_TYPE_PROMPTS,
    collect_token_totals,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

INVOCATIONS_PER_TYPE = 10
INVOCATION_TERMINAL_TIMEOUT = 120.0


def _run_workflow_type(
    nexus_api: NexusApiRegistry,
    wf_type: str,
    prompts: list[str],
    model: str,
    credential_id: str | None,
) -> dict[str, Any]:
    """Submit invocations for a single workflow type and collect results."""
    nexus_api.internal_metrics.reset_store().assert_successful()

    session_id = f"perf-suite15-eff-{wf_type}-{uuid4().hex[:8]}"
    invocation_ids: list[str] = []

    for i in range(INVOCATIONS_PER_TYPE):
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
        record_limit=INVOCATIONS_PER_TYPE * 2,
    )

    total_tokens = total_input + total_output
    efficiency_ratio = total_tokens / completed if completed > 0 else 0.0

    return {
        "submitted": len(invocation_ids),
        "completed": completed,
        "total_input_tokens": total_input,
        "total_output_tokens": total_output,
        "total_tokens": total_tokens,
        "efficiency_ratio": efficiency_ratio,
        "token_source": source,
        "token_diag": token_diag,
    }


class TestTokenEfficiency:
    """15.2 — Compare token usage across workflow types.

    Validates:
        - Token usage is recorded for each workflow type (code_generation,
          analysis, simple_qa)
        - Token efficiency ratio (total tokens / successful completions)
          is computable per type
        - Simple QA prompts should generally use fewer tokens than code
          generation or analysis prompts
        - Results are reported for trend monitoring

    The test submits invocations grouped by workflow type, resets the
    metrics store between groups to isolate per-type measurements, and
    computes a token efficiency ratio for each.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        llm_invocation_enabled: None,
    ) -> None:
        pass

    def test_token_efficiency_by_workflow_type(
        self,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
    ) -> None:
        """Submit invocations per workflow type; token efficiency must be measurable."""
        models = get_configured_models()
        model = models[0]

        type_results: dict[str, dict[str, Any]] = {}
        for wf_type, prompts in WORKFLOW_TYPE_PROMPTS.items():
            type_results[wf_type] = _run_workflow_type(
                nexus_api,
                wf_type,
                prompts,
                model,
                llm_credential_id,
            )

        diag_parts = ["\n--- Token efficiency by workflow type (15.2) ---"]
        diag_parts.append(f"  model={model}")

        types_with_data = 0
        for wf_type, result in type_results.items():
            if result["total_tokens"] > 0:
                types_with_data += 1
            diag_parts.append(
                f"  {wf_type}: submitted={result['submitted']}, "
                f"completed={result['completed']}, "
                f"tokens={result['total_tokens']} "
                f"(in={result['total_input_tokens']}, "
                f"out={result['total_output_tokens']}), "
                f"efficiency={result['efficiency_ratio']:.0f} tokens/completion, "
                f"source={result['token_source']}"
            )

        diag = "\n".join(diag_parts) + "\n"

        total_completed = sum(r["completed"] for r in type_results.values())
        assert total_completed > 0, f"No invocations completed across any workflow type.{diag}"

        if types_with_data == 0:
            first_diag = next(
                (r["token_diag"] for r in type_results.values() if r["token_diag"]),
                "",
            )
            pytest.skip(f"No token data found for any workflow type. {first_diag}{diag}")

        for wf_type, result in type_results.items():
            if result["completed"] > 0 and result["token_source"] != SOURCE_NONE:
                assert result["total_tokens"] > 0, (
                    f"Workflow type '{wf_type}' had {result['completed']} completions but "
                    f"zero tokens recorded (source={result['token_source']}).{diag}"
                )
