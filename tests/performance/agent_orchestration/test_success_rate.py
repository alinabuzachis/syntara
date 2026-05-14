"""Suite 17 — Agent Orchestration: Agent Call Success Rate KPI (17.3).

Test 17.3: Execute 200 agent invocations
    KPI: Agent Call Success Rate > 95%
    MetricType: AGENT_STATUS
    Validation: /_internal/metrics/kpis/invocation_service → invocation_success_rate

Run with:
    make test-performance
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import uuid4

import pytest

from tests.performance.agent_orchestration.conftest import ALL_ORCHESTRATION_PROMPTS
from tests.performance.conftest import (
    TERMINAL_STATUSES,
    poll_for_component_kpis,
    poll_for_metric_records,
    poll_until_resources_terminal,
    submit_invocations_batch_with_ids,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

TOTAL_INVOCATIONS = 200
TARGET_SUCCESS_RATE = 0.95
MAX_WORKERS = 20
STABILIZATION_TIMEOUT = 300.0


class TestAgentCallSuccessRate:
    """17.3 — Execute 200 agent invocations.

    Submits 200 invocations using diverse prompts, waits for them to
    reach terminal states, then verifies:
        - Client-polled invocation success rate >= 95%
        - Server-side KPI status_distribution confirms success rate
        - AGENT_STATUS metric records reflect successful completions
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        llm_invocation_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_agent_call_success_rate_above_target(
        self,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
    ) -> None:
        """200 agent invocations; success rate must be > 95%."""
        session_id = f"perf-suite17-success-rate-{uuid4().hex[:8]}"
        invocation_ids, creation_failures = submit_invocations_batch_with_ids(
            nexus_api,
            TOTAL_INVOCATIONS,
            session_id,
            prompts=ALL_ORCHESTRATION_PROMPTS,
            max_workers=MAX_WORKERS,
            credential_id=llm_credential_id,
        )

        assert len(invocation_ids) > 0, (
            f"No invocations were accepted "
            f"({creation_failures} creation failures out of "
            f"{TOTAL_INVOCATIONS})\n"
            f"  Session: {session_id}"
        )

        status_counts = poll_until_resources_terminal(
            nexus_api,
            "invocation",
            invocation_ids,
            id_param="invocation_id",
            timeout=STABILIZATION_TIMEOUT,
        )

        terminal_count = sum(v for k, v in status_counts.items() if k in TERMINAL_STATUSES)
        assert terminal_count >= len(invocation_ids), (
            f"Only {terminal_count}/{len(invocation_ids)} invocations reached "
            f"terminal state within {STABILIZATION_TIMEOUT}s\n"
            f"  Status counts: {status_counts}\n"
            f"  Session: {session_id}"
        )

        # --- Primary KPI: client-polled success rate ---

        completed = status_counts.get("completed", 0)
        failed = status_counts.get("failed", 0)
        total_terminal = sum(status_counts.values())
        success_rate = completed / total_terminal if total_terminal > 0 else 0.0

        diag = (
            f"\n--- Agent call success rate results ---\n"
            f"  submitted={TOTAL_INVOCATIONS}, "
            f"accepted={len(invocation_ids)}\n"
            f"  creation_failures={creation_failures}\n"
            f"  status_counts={status_counts}\n"
            f"  completed={completed}, failed={failed}\n"
            f"  success_rate={success_rate:.2%}\n"
            f"  Session: {session_id}\n"
        )

        assert success_rate >= TARGET_SUCCESS_RATE, (
            f"Agent call success rate {success_rate:.2%} below target {TARGET_SUCCESS_RATE:.0%}{diag}"
        )

        # --- Server KPI cross-validation ---

        kpis = poll_for_component_kpis(
            nexus_api.internal_metrics,
            "invocation_service",
            timeout=STABILIZATION_TIMEOUT,
        )
        metrics = kpis.get("metrics", {})
        status_distribution = metrics.get("status_distribution", {})

        if status_distribution:
            kpi_total = sum(status_distribution.values())
            kpi_errors = status_distribution.get("error", 0)
            kpi_success_rate = (kpi_total - kpi_errors) / kpi_total if kpi_total > 0 else 0.0

            assert kpi_success_rate >= TARGET_SUCCESS_RATE, (
                f"Server-reported success rate {kpi_success_rate:.2%} below "
                f"target {TARGET_SUCCESS_RATE:.0%}\n"
                f"  status_distribution={status_distribution}"
            )

        # --- AGENT_STATUS records cross-validation ---

        agent_status_records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "agent_status",
            limit=TOTAL_INVOCATIONS * 3,
            timeout=STABILIZATION_TIMEOUT,
        )

        if agent_status_records.get("total", 0) > 0:
            record_status_counts: dict[str, int] = {}
            for record in agent_status_records.get("records", []):
                labels = record.get("labels", {})
                status = labels.get("status", "unknown")
                record_status_counts[status] = record_status_counts.get(status, 0) + 1

            total_records = sum(record_status_counts.values())
            record_errors = record_status_counts.get("error", 0) + record_status_counts.get("failed", 0)
            record_success_rate = (total_records - record_errors) / total_records if total_records > 0 else 0.0

            assert record_success_rate >= TARGET_SUCCESS_RATE, (
                f"Agent status record success rate {record_success_rate:.2%} "
                f"below target {TARGET_SUCCESS_RATE:.0%}\n"
                f"  record_status_counts={record_status_counts}"
            )
