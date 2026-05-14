"""Suite 5 — Invocation Service: E2E Duration KPIs (5.3, 5.4).

Test 5.3: Run typical invocations end-to-end
    KPI: E2E Duration (p95) — < 60s
    MetricType: AGENT_INVOCATION_DURATION
    Validation: /_internal/metrics/kpis/invocation_service → e2e_duration_ms.p95

Test 5.4: Run complex multi-step invocations
    KPI: E2E Duration (long-running) — < 5min (critical)
    MetricType: AGENT_INVOCATION_DURATION
    Validation: /_internal/metrics/records?metric_type=agent_invocation_ms

Run with:
    make test-performance
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any
from uuid import uuid4

import pytest

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

# 5.3 constants
TARGET_E2E_P95_MS = 60_000
TOTAL_INVOCATIONS = 50
MAX_WORKERS = 10
STABILIZATION_TIMEOUT = 120.0

# 5.4 constants
TARGET_LONG_RUNNING_MAX_MS = 300_000
COMPLEX_INVOCATION_COUNT = 10
# 5-min target + 60s buffer for network/scheduling overhead
COMPLEX_STABILIZATION_TIMEOUT = 360.0

TYPICAL_PROMPTS = [
    "List available automation workflows",
    "Create a simple deployment pipeline",
    "Explain the current system status",
    "Generate a report of recent activity",
    "Summarize the workflow configuration",
]

COMPLEX_PROMPTS = [
    # These prompts are designed to trigger multi-step agent reasoning and longer execution times.
    # They may not produce fully functional outputs in all environments, but serve as realistic
    # synthetic workloads to measure E2E duration under complex invocation scenarios.
    "Design and create a multi-stage CI/CD pipeline with build, test, security scan, and deploy stages",
    "Analyze the current infrastructure, identify bottlenecks, and generate an optimization plan",
    "Create a comprehensive monitoring dashboard with alerting rules for all critical services",
    "Build a disaster recovery workflow that handles failover, data backup, and service restoration",
    "Generate a full security audit report covering access controls, network policies, and compliance",
]


class TestE2EDuration:
    """5.3 — Run typical invocations end-to-end.

    Creates a batch of invocations with realistic prompts, waits for them
    to complete, then reads ``e2e_duration_ms.p95`` from the
    invocation_service KPI endpoint and verifies it stays under 60s.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        llm_invocation_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_e2e_duration_p95_under_target(
        self,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
    ) -> None:
        """Typical invocations end-to-end; p95 duration must be < 60s."""
        session_id = f"perf-suite5-e2e-typical-{uuid4().hex[:8]}"
        invocation_ids, _ = submit_invocations_batch_with_ids(
            nexus_api,
            TOTAL_INVOCATIONS,
            session_id,
            prompts=TYPICAL_PROMPTS,
            max_workers=MAX_WORKERS,
            credential_id=llm_credential_id,
        )

        assert len(invocation_ids) > 0, (
            f"No invocations were accepted\n  Submitted: {TOTAL_INVOCATIONS}\n  Session: {session_id}"
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
            f"Only {terminal_count}/{len(invocation_ids)} invocations reached terminal state "
            f"within {STABILIZATION_TIMEOUT}s\n"
            f"  Status counts: {status_counts}\n"
            f"  Session: {session_id}"
        )

        kpis = poll_for_component_kpis(
            nexus_api.internal_metrics,
            "invocation_service",
            timeout=STABILIZATION_TIMEOUT,
        )
        metrics = kpis.get("metrics", {})
        duration_stats = metrics.get("e2e_duration_ms", {})
        server_count = duration_stats.get("count", 0)
        server_p95 = duration_stats.get("p95", 0)

        assert server_count > 0, (
            f"No e2e_duration_ms records found in invocation_service KPIs "
            f"({len(invocation_ids)} invocations were accepted)"
        )

        assert server_p95 < TARGET_E2E_P95_MS, (
            f"Server-reported e2e_duration p95 {server_p95:.0f}ms exceeds "
            f"target {TARGET_E2E_P95_MS}ms ({TARGET_E2E_P95_MS / 1000:.0f}s)\n"
            f"  Invocations accepted: {len(invocation_ids)}/{TOTAL_INVOCATIONS}\n"
            f"  Records counted: {server_count}\n"
            f"  Duration stats: {duration_stats}"
        )


class TestE2EDurationLongRunning:
    """5.4 — Run complex multi-step invocations.

    Creates invocations with complex, multi-step prompts that exercise
    deeper agent reasoning paths, then reads individual
    ``agent_invocation_ms`` records and verifies none exceeds 5 minutes.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        llm_invocation_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_long_running_invocations_under_critical_threshold(
        self,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
    ) -> None:
        """Complex multi-step invocations; no single invocation must exceed 5min."""
        session_id = f"perf-suite5-e2e-complex-{uuid4().hex[:8]}"
        invocation_ids, _ = submit_invocations_batch_with_ids(
            nexus_api,
            COMPLEX_INVOCATION_COUNT,
            session_id,
            prompts=COMPLEX_PROMPTS,
            max_workers=COMPLEX_INVOCATION_COUNT,
            credential_id=llm_credential_id,
        )

        assert len(invocation_ids) > 0, (
            f"No complex invocations were accepted\n  Submitted: {COMPLEX_INVOCATION_COUNT}\n  Session: {session_id}"
        )

        status_counts = poll_until_resources_terminal(
            nexus_api,
            "invocation",
            invocation_ids,
            id_param="invocation_id",
            timeout=COMPLEX_STABILIZATION_TIMEOUT,
        )

        terminal_count = sum(v for k, v in status_counts.items() if k in TERMINAL_STATUSES)
        assert terminal_count >= len(invocation_ids), (
            f"Only {terminal_count}/{len(invocation_ids)} complex invocations reached terminal state "
            f"within {COMPLEX_STABILIZATION_TIMEOUT}s\n"
            f"  Status counts: {status_counts}\n"
            f"  Session: {session_id}"
        )

        records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "agent_invocation_ms",
            limit=COMPLEX_INVOCATION_COUNT * 2,
            timeout=COMPLEX_STABILIZATION_TIMEOUT,
        )

        all_records: list[dict[str, Any]] = records.get("records", [])

        assert len(all_records) > 0, (
            f"No agent_invocation_ms records found ({len(invocation_ids)} complex invocations were accepted)"
        )

        durations = [r.get("value", 0) for r in all_records]
        max_duration = max(durations)
        breaches = [d for d in durations if d >= TARGET_LONG_RUNNING_MAX_MS]

        assert max_duration < TARGET_LONG_RUNNING_MAX_MS, (
            f"Longest invocation {max_duration:.0f}ms ({max_duration / 1000:.1f}s) exceeds "
            f"critical threshold {TARGET_LONG_RUNNING_MAX_MS}ms "
            f"({TARGET_LONG_RUNNING_MAX_MS / 60_000:.0f}min)\n"
            f"  Records: {len(all_records)}\n"
            f"  Breaches: {len(breaches)}/{len(all_records)}\n"
            f"  Max: {max_duration:.0f}ms\n"
            f"  Invocations accepted: {len(invocation_ids)}/{COMPLEX_INVOCATION_COUNT}"
        )
