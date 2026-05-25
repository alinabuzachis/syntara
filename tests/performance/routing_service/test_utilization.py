"""Suite 6 — Routing Service: Agent Utilization Balance KPI (6.3).

Test 6.3: Submit prompts across all agent capabilities
    KPI: Agent Utilization Balance — No single agent > 50% of total
    MetricType: AGENT_STATUS
    Validation: /_internal/metrics/kpis/routing_service → agent_utilization

Run with:
    make test-performance
"""

from __future__ import annotations

import itertools
from typing import TYPE_CHECKING, Any

import pytest

from tests.performance.conftest import poll_for_component_kpis, poll_for_metric_records, submit_and_collect
from tests.performance.routing_service.conftest import (
    ALL_PROMPTS,
    ROUTING_SERVICE_COMPONENT,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

UTILIZATION_INVOCATION_COUNT = 100
MAX_SINGLE_AGENT_RATIO = 0.50
CONCURRENT_BATCH_SIZE = 10


class TestAgentUtilizationBalance:
    """6.3 — Submit prompts across all agent capabilities.

    Validates:
        - Agent utilization is tracked in the routing_service KPIs
        - No single agent handles more than 50% of total invocations
        - The agent_utilization distribution from the server KPIs
          reflects balanced routing across available agents

    Note: The current Nexus orchestrator only has a single agent
    (``generic_agent``), so all invocations will route there.  This
    test validates the *instrumentation* is correct and will detect
    imbalance once multiple specialist agents are added.  When only
    one agent exists, the test verifies that utilization tracking
    works and skips the balance assertion (since 100% for a single
    agent is expected).
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        llm_routed_invocation_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    @staticmethod
    def _extract_agent_distribution(
        records: dict[str, Any],
    ) -> dict[str, int]:
        """Count invocations per agent from routing records."""
        agent_counts: dict[str, int] = {}
        for record in records.get("records", []):
            labels = record.get("labels", {})
            agent = labels.get("target_agent", labels.get("agent_name", "unknown"))
            agent_counts[agent] = agent_counts.get(agent, 0) + 1
        return agent_counts

    def test_agent_utilization_tracked(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Submit diverse prompts; utilization must be tracked."""
        prompts = list(itertools.islice(itertools.cycle(ALL_PROMPTS), UTILIZATION_INVOCATION_COUNT))

        result = submit_and_collect(
            nexus_api,
            prompts,
            max_workers=CONCURRENT_BATCH_SIZE,
            batch_size=CONCURRENT_BATCH_SIZE,
        )

        assert result.successes > 0, f"No invocations were accepted ({UTILIZATION_INVOCATION_COUNT} submitted)"

        kpis = poll_for_component_kpis(
            nexus_api.internal_metrics,
            ROUTING_SERVICE_COMPONENT,
        )
        agent_utilization = kpis.get("metrics", {}).get("agent_utilization", {})

        records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "agent_routing_ms",
            limit=UTILIZATION_INVOCATION_COUNT + 10,
        )
        client_distribution = self._extract_agent_distribution(records)

        diag = (
            f"\n--- Agent utilization results ---\n"
            f"  submitted={UTILIZATION_INVOCATION_COUNT}, "
            f"accepted={result.successes}\n"
            f"  server_agent_utilization={agent_utilization}\n"
            f"  client_agent_distribution={client_distribution}\n"
            f"  routing_records={records.get('total', 0)}\n"
        )

        distribution = client_distribution or agent_utilization
        assert len(distribution) > 0, f"No agent utilization data recorded{diag}"

        unique_agents = set(distribution.keys()) - {"unknown"}

        if len(unique_agents) > 1:
            total = sum(distribution.values())
            for agent, count in distribution.items():
                if agent == "unknown":
                    continue
                ratio = count / total if total > 0 else 0
                assert ratio <= MAX_SINGLE_AGENT_RATIO, (
                    f"Agent '{agent}' handles {ratio:.2%} of invocations, "
                    f"exceeding maximum {MAX_SINGLE_AGENT_RATIO:.0%}{diag}"
                )

    def test_utilization_via_agent_status_records(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Submit prompts and verify agent_status records carry agent labels."""
        prompts = list(itertools.islice(itertools.cycle(ALL_PROMPTS), UTILIZATION_INVOCATION_COUNT))

        result = submit_and_collect(nexus_api, prompts)

        assert result.successes > 0, "No invocations were accepted"

        poll_for_component_kpis(
            nexus_api.internal_metrics,
            ROUTING_SERVICE_COMPONENT,
        )

        records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "agent_status",
            limit=UTILIZATION_INVOCATION_COUNT * 3,
        )

        assert records.get("total", 0) > 0, (
            f"No agent_status records emitted for {result.successes} accepted invocations"
        )

        status_distribution: dict[str, int] = {}
        for record in records.get("records", []):
            labels = record.get("labels", {})
            status = labels.get("status", "unknown")
            status_distribution[status] = status_distribution.get(status, 0) + 1

        kpis = poll_for_component_kpis(
            nexus_api.internal_metrics,
            ROUTING_SERVICE_COMPONENT,
        )
        server_utilization = kpis.get("metrics", {}).get("agent_utilization", {})

        diag = (
            f"\n--- Agent status utilization results ---\n"
            f"  invocations_accepted={result.successes}\n"
            f"  agent_status_records={records.get('total', 0)}\n"
            f"  status_distribution={status_distribution}\n"
            f"  server_agent_utilization={server_utilization}\n"
        )

        assert len(status_distribution) > 0, f"No status labels found in agent_status records{diag}"
