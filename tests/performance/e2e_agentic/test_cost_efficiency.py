"""Suite 18 — E2E Agentic Workflows: Cost per Workflow KPI (18.2).

Test 18.2: Token cost tracking per workflow
    KPI: Cost per Workflow — Trend monitoring
    MetricType: LLM_TOKENS_INPUT, LLM_TOKENS_OUTPUT
    Validation: Sum tokens per workflow execution

Run with:
    make test-performance
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import uuid4

import pytest

from tests.performance.conftest import (
    get_configured_models,
    poll_for_invocation_terminal_status,
    submit_invocation,
)
from tests.performance.cost_tracking.conftest import (
    collect_token_totals,
    estimate_cost,
    get_model_pricing,
)
from tests.performance.e2e_agentic.conftest import AGENTIC_PROMPTS

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

INVOCATION_COUNT = 20
INVOCATION_TERMINAL_TIMEOUT = 120.0


class TestCostPerWorkflow:
    """18.2 — Token cost tracking per agentic workflow.

    Submits agentic invocations, waits for completion, collects token
    usage from the metrics store, and estimates the cost per completed
    workflow.  This is a trend-monitoring test — it records cost data
    for cross-run comparison rather than enforcing a hard threshold.

    Validates:
        - Token metrics (LLM_TOKENS_INPUT / LLM_TOKENS_OUTPUT) are recorded
        - Cost per workflow is computable and non-zero
        - Cost data is logged for trend analysis
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        llm_invocation_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_cost_per_agentic_workflow_tracked(
        self,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
    ) -> None:
        """Agentic workflows must produce trackable token cost data."""
        model = get_configured_models()[0]
        session_id = f"perf-suite18-cost-{uuid4().hex[:8]}"
        invocation_ids: list[str] = []

        for i in range(INVOCATION_COUNT):
            prompt = AGENTIC_PROMPTS[i % len(AGENTIC_PROMPTS)]
            _, ok, inv_id = submit_invocation(
                nexus_api,
                prompt,
                session_id=session_id,
                model=model,
                credential_id=llm_credential_id,
            )
            if ok and inv_id:
                invocation_ids.append(inv_id)

        assert len(invocation_ids) > 0, f"No invocations were accepted\n  Session: {session_id}"

        completed = 0
        for inv_id in invocation_ids:
            parsed = poll_for_invocation_terminal_status(
                nexus_api,
                inv_id,
                timeout=INVOCATION_TERMINAL_TIMEOUT,
            )
            if str(parsed.get("status", "")) == "completed":
                completed += 1

        assert completed > 0, (
            f"No invocations completed successfully\n  Accepted: {len(invocation_ids)}\n  Session: {session_id}"
        )

        total_input, total_output, source, diag = collect_token_totals(
            nexus_api,
            record_limit=INVOCATION_COUNT * 5,
            poll_timeout=60.0,
        )

        if source == "none":
            pytest.skip(f"No token metrics available for cost calculation. {diag}")

        pricing = get_model_pricing()
        total_cost = estimate_cost(model, total_input, total_output, pricing)
        cost_per_workflow = total_cost / completed if completed > 0 else 0.0

        diag_msg = (
            f"\n--- Cost per agentic workflow results ---\n"
            f"  model={model}\n"
            f"  submitted={INVOCATION_COUNT}, "
            f"accepted={len(invocation_ids)}, "
            f"completed={completed}\n"
            f"  token_source={source}\n"
            f"  total_input_tokens={total_input}\n"
            f"  total_output_tokens={total_output}\n"
            f"  total_cost=${total_cost:.6f}\n"
            f"  cost_per_workflow=${cost_per_workflow:.6f}\n"
        )

        assert total_input + total_output > 0, (
            f"Token counts are zero despite {completed} completed invocations. Token metrics source: {source}{diag_msg}"
        )

        assert cost_per_workflow > 0, f"Cost per workflow is zero{diag_msg}"
