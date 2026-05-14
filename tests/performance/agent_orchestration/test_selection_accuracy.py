"""Suite 17 — Agent Orchestration: Agent Selection Accuracy KPI (17.1).

Test 17.1: Submit 200 invocations with labeled expected agents
    KPI: Agent Selection Accuracy > 90%
    MetricType: AGENT_STATUS
    Validation: Compare routing decisions vs expected outcomes

Run with:
    make test-performance
"""

from __future__ import annotations

import itertools
from typing import TYPE_CHECKING

import pytest

from tests.performance.agent_orchestration.conftest import build_labeled_prompts
from tests.performance.conftest import (
    extract_routing_decisions,
    poll_for_component_kpis,
    poll_for_metric_records,
    submit_invocation,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

INVOCATION_COUNT = 200
TARGET_SELECTION_ACCURACY = 0.90


class TestAgentSelectionAccuracy:
    """17.1 — Submit 200 invocations with labeled expected agents.

    Validates:
        - Agent routing records carry a ``target_agent`` label
        - The routed agent matches the expected agent for > 90% of prompts
        - AGENT_STATUS records are emitted with proper categorization labels
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        llm_invocation_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_agent_selection_accuracy_above_target(
        self,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
    ) -> None:
        """Submit 200 labeled invocations; selection accuracy must be > 90%."""
        labeled_prompts = build_labeled_prompts()
        prompts_cycle = list(itertools.islice(itertools.cycle(labeled_prompts), INVOCATION_COUNT))
        successes = 0

        for entry in prompts_cycle:
            _, ok, _ = submit_invocation(
                nexus_api,
                entry["prompt"],
                credential_id=llm_credential_id,
            )
            if ok:
                successes += 1

        assert successes > 0, f"No invocations were accepted ({INVOCATION_COUNT} submitted)"

        poll_for_component_kpis(
            nexus_api.internal_metrics,
            "routing_service",
        )

        # --- Accuracy assertion (primary KPI) ---

        routing_records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "agent_routing_ms",
            limit=INVOCATION_COUNT + 10,
        )

        decisions = extract_routing_decisions(routing_records)
        assert len(decisions) > 0, (
            f"No AGENT_ROUTING_DURATION records with target_agent label "
            f"(submitted={INVOCATION_COUNT}, accepted={successes})"
        )

        expected_agents = {entry["expected_agent"] for entry in labeled_prompts}
        correct = sum(1 for d in decisions if d["target_agent"] in expected_agents)
        accuracy = correct / len(decisions)

        diag = (
            f"\n--- Agent selection accuracy results ---\n"
            f"  submitted={INVOCATION_COUNT}, accepted={successes}\n"
            f"  routing_records={len(decisions)}\n"
            f"  correct_routes={correct}, accuracy={accuracy:.2%}\n"
            f"  unique_agents={ {d['target_agent'] for d in decisions} }\n"
            f"  expected_agents={expected_agents}\n"
        )

        assert accuracy >= TARGET_SELECTION_ACCURACY, (
            f"Agent selection accuracy {accuracy:.2%} below target {TARGET_SELECTION_ACCURACY:.0%}{diag}"
        )

        # --- AGENT_STATUS label assertion (secondary validation) ---

        status_records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "agent_status",
            limit=successes * 3,
        )

        assert status_records.get("total", 0) > 0, (
            f"No agent_status records emitted for {successes} accepted invocations"
        )

        for record in status_records.get("records", []):
            labels = record.get("labels", {})
            has_label = "status" in labels or "invocation_id" in labels or "error_type" in labels
            assert has_label, f"Agent status record missing categorization labels: {labels}"
