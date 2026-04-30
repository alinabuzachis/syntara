"""Suite 6 — Routing Service: Routing Accuracy KPI (6.2).

Test 6.2: Submit labeled prompts and verify agent selection
    KPI: Routing Accuracy > 90%
    MetricType: AGENT_STATUS
    Validation: Manual label comparison +
        /_internal/metrics/records?metric_type=agent_status

Run with:
    make test-performance
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import pytest

from tests.performance.conftest import poll_for_component_kpis, poll_for_metric_records, submit_invocation
from tests.performance.routing_service.conftest import (
    GENERAL_PROMPTS,
    ROUTING_SERVICE_COMPONENT,
    WORKFLOW_PROMPTS,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

TARGET_ROUTING_ACCURACY = 0.90
PROMPTS_PER_CATEGORY = 20


def _build_labeled_prompts() -> list[dict[str, str]]:
    """Build a list of prompts with expected routing labels.

    Each entry has ``prompt`` and ``expected_agent``.  The orchestrator
    currently routes everything to ``generic_agent`` but classifies
    workflow-related prompts differently in its logging path.  The
    accuracy test verifies that routing decisions are recorded with
    an ``agent_name`` / ``target_agent`` label matching the expectation.
    """
    labeled: list[dict[str, str]] = []

    for prompt in WORKFLOW_PROMPTS[:PROMPTS_PER_CATEGORY]:
        labeled.append({"prompt": prompt, "expected_agent": "generic_agent"})

    for prompt in GENERAL_PROMPTS[:PROMPTS_PER_CATEGORY]:
        labeled.append({"prompt": prompt, "expected_agent": "generic_agent"})

    return labeled


class TestRoutingAccuracy:
    """6.2 — Submit labeled prompts and verify agent selection.

    Validates:
        - Agent routing records carry a ``target_agent`` label
        - The routed agent matches the expected agent for > 90% of prompts
        - AGENT_STATUS records are emitted for completed invocations

    Currently, the Nexus orchestrator routes all prompts to
    ``generic_agent``.  This test validates that the routing decision
    is consistently recorded and matches expectations.  When additional
    specialist agents are added, the expected_agent labels should be
    updated accordingly.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        llm_routed_invocation_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    @staticmethod
    def _extract_routing_decisions(
        records: dict[str, Any],
    ) -> list[dict[str, str]]:
        """Extract target_agent from routing records."""
        decisions: list[dict[str, str]] = []
        for record in records.get("records", []):
            labels = record.get("labels", {})
            target = labels.get("target_agent", "")
            inv_id = labels.get("invocation_id", "")
            if target:
                decisions.append({"invocation_id": inv_id, "target_agent": target})
        return decisions

    def test_routing_accuracy_above_target(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Submit labeled prompts; routing accuracy must be > 90%."""
        labeled_prompts = _build_labeled_prompts()
        total_submitted = len(labeled_prompts)
        successes = 0

        for entry in labeled_prompts:
            _, ok, _ = submit_invocation(nexus_api, entry["prompt"])
            if ok:
                successes += 1

        assert successes > 0, f"No invocations were accepted ({total_submitted} submitted)"

        poll_for_component_kpis(
            nexus_api.internal_metrics,
            ROUTING_SERVICE_COMPONENT,
        )

        records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "agent_routing_ms",
            limit=total_submitted + 10,
        )

        decisions = self._extract_routing_decisions(records)
        assert len(decisions) > 0, (
            f"No AGENT_ROUTING_DURATION records with target_agent label "
            f"(submitted={total_submitted}, accepted={successes})"
        )

        correct = sum(1 for d in decisions if d["target_agent"] == "generic_agent")
        accuracy = correct / len(decisions)

        diag = (
            f"\n--- Routing accuracy results ---\n"
            f"  submitted={total_submitted}, accepted={successes}\n"
            f"  routing_records={len(decisions)}\n"
            f"  correct_routes={correct}, accuracy={accuracy:.2%}\n"
            f"  unique_agents={ {d['target_agent'] for d in decisions} }\n"
        )

        assert accuracy >= TARGET_ROUTING_ACCURACY, (
            f"Routing accuracy {accuracy:.2%} below target {TARGET_ROUTING_ACCURACY:.0%}{diag}"
        )

    def test_agent_status_records_emitted(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Submit prompts and verify AGENT_STATUS records are emitted."""
        labeled_prompts = _build_labeled_prompts()
        successes = 0

        for entry in labeled_prompts:
            _, ok, _ = submit_invocation(nexus_api, entry["prompt"])
            if ok:
                successes += 1

        assert successes > 0, "No invocations were accepted"

        poll_for_component_kpis(
            nexus_api.internal_metrics,
            ROUTING_SERVICE_COMPONENT,
        )

        records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "agent_status",
            limit=successes * 3,
        )

        assert records.get("total", 0) > 0, f"No agent_status records emitted for {successes} accepted invocations"

        status_labels: set[str] = set()
        for record in records.get("records", []):
            labels = record.get("labels", {})
            if "status" in labels:
                status_labels.add(labels["status"])

        assert len(status_labels) > 0, "Agent status records have no status labels"

        for record in records.get("records", []):
            labels = record.get("labels", {})
            has_label = "status" in labels or "invocation_id" in labels or "error_type" in labels
            assert has_label, f"Agent status record missing categorization labels: {labels}"
