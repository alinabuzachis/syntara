"""Suite 5 — Invocation Service: Status Distribution KPIs (5.2, 5.5).

Test 5.2: Run 200 invocations and collect terminal statuses
    KPI: Status Distribution — < 5% failed
    MetricType: AGENT_STATUS
    Validation: /_internal/metrics/kpis/invocation_service → status_distribution

Test 5.5: Cancel invocations mid-execution
    KPI: Cancellation impact on distribution — Tracked
    MetricType: AGENT_STATUS
    Validation: /_internal/metrics/kpis/invocation_service → status_distribution

Run with:
    make test-performance
"""

from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING, Any
from uuid import uuid4

import pytest
from nexus_api_client.models.invocation_cancel_request import InvocationCancelRequest

from tests.performance.conftest import (
    TERMINAL_STATUSES,
    poll_for_component_kpis,
    poll_until_resources_terminal,
)
from tests.performance.invocation_service.conftest import (
    create_invocation_with_id,
    submit_invocations_batch_with_ids,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry
    from nexus_api_client.types import Response

pytestmark = pytest.mark.performance

# 5.2 constants
TOTAL_INVOCATIONS = 200
MAX_FAILURE_RATE = 0.05
MAX_WORKERS = 20
STABILIZATION_TIMEOUT = 120.0

# 5.5 constants
CANCELLATION_INVOCATIONS = 40
# Cancel half to produce a meaningful mix of completed vs cancelled in the distribution
CANCEL_RATIO = 0.5
CANCELLATION_MAX_WORKERS = 10


class TestStatusDistribution:
    """5.2 — Run 200 invocations and collect terminal statuses.

    Creates 200 invocations, waits for them to reach terminal states,
    then reads ``status_distribution`` from the invocation_service KPI
    endpoint and verifies the failure rate is below 5%.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        llm_invocation_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_failure_rate_below_threshold(
        self,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
    ) -> None:
        """200 invocations; failed status must be < 5% of terminal statuses."""
        session_id = f"perf-suite5-status-dist-{uuid4().hex[:8]}"
        invocation_ids, failures = submit_invocations_batch_with_ids(
            nexus_api,
            TOTAL_INVOCATIONS,
            session_id,
            prompt_prefix="Status distribution test",
            max_workers=MAX_WORKERS,
            credential_id=llm_credential_id,
        )

        assert len(invocation_ids) > 0, (
            f"No invocations were accepted ({failures} creation failures out of {TOTAL_INVOCATIONS})"
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
        status_distribution: dict[str, int] = metrics.get("status_distribution", {})

        assert status_distribution, (
            f"No status_distribution data in invocation_service KPIs ({len(invocation_ids)} invocations were accepted)"
        )

        total_terminal = sum(status_distribution.values())
        # Executor records "error" for failed invocations, not "failed"
        failed_count = status_distribution.get("error", 0)

        failure_rate = failed_count / total_terminal if total_terminal > 0 else 1.0

        assert failure_rate < MAX_FAILURE_RATE, (
            f"Failure rate {failure_rate:.2%} exceeds threshold {MAX_FAILURE_RATE:.0%}\n"
            f"  Total terminal: {total_terminal}\n"
            f"  Failed (error): {failed_count}\n"
            f"  Distribution: {status_distribution}\n"
            f"  Invocations accepted: {len(invocation_ids)}/{TOTAL_INVOCATIONS}"
        )


class TestCancellationImpact:
    """5.5 — Cancel invocations mid-execution.

    Creates invocations, cancels a portion of them mid-execution, then
    reads ``status_distribution`` from the invocation_service KPI
    endpoint and verifies that ``cancelled`` appears as a tracked status.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        llm_invocation_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    @pytest.mark.xfail(reason="Executor does not record AGENT_STATUS metrics for cancelled invocations")
    def test_cancelled_status_tracked_in_distribution(
        self,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
    ) -> None:
        """Cancel half of invocations mid-execution; cancelled must appear in status_distribution."""
        session_id = f"perf-suite5-cancellation-{uuid4().hex[:8]}"
        invocation_ids: list[str] = []

        with ThreadPoolExecutor(max_workers=CANCELLATION_MAX_WORKERS) as executor:
            futures = [
                executor.submit(
                    create_invocation_with_id,
                    nexus_api,
                    session_id,
                    f"Cancellation test {i}",
                    llm_credential_id,
                )
                for i in range(CANCELLATION_INVOCATIONS)
            ]
            for future in as_completed(futures):
                inv_id, ok = future.result()
                if ok and inv_id:
                    invocation_ids.append(inv_id)

        assert len(invocation_ids) > 0, (
            f"No invocations were accepted\n  Submitted: {CANCELLATION_INVOCATIONS}\n  Session: {session_id}"
        )

        num_to_cancel = int(len(invocation_ids) * CANCEL_RATIO)
        ids_to_cancel = invocation_ids[:num_to_cancel]
        cancel_successes = 0

        with ThreadPoolExecutor(max_workers=CANCELLATION_MAX_WORKERS) as executor:
            cancel_futures: list[Future[Response[Any]]] = [
                executor.submit(
                    nexus_api.invocation.cancel,
                    invocation_id=inv_id,
                    body=InvocationCancelRequest(reason="Performance test cancellation"),
                )
                for inv_id in ids_to_cancel
            ]
            for cancel_future in as_completed(cancel_futures):
                try:
                    r: Response[Any] = cancel_future.result()
                    if r.is_success:
                        cancel_successes += 1
                except Exception:
                    pass

        assert cancel_successes > 0, (
            f"No cancellations succeeded\n"
            f"  Attempted: {num_to_cancel}\n"
            f"  Invocations created: {len(invocation_ids)}\n"
            f"  Session: {session_id}"
        )

        kpis = poll_for_component_kpis(
            nexus_api.internal_metrics,
            "invocation_service",
            timeout=STABILIZATION_TIMEOUT,
        )
        metrics = kpis.get("metrics", {})
        status_distribution: dict[str, int] = metrics.get("status_distribution", {})

        assert status_distribution, (
            f"No status_distribution data in invocation_service KPIs "
            f"({len(invocation_ids)} invocations created, {cancel_successes} cancelled)"
        )

        assert "cancelled" in status_distribution, (
            f"'cancelled' status not tracked in status_distribution\n"
            f"  Cancellations succeeded: {cancel_successes}/{num_to_cancel}\n"
            f"  Distribution: {status_distribution}"
        )

        cancelled_count = status_distribution.get("cancelled", 0)

        assert cancelled_count <= cancel_successes, (
            f"More cancellations recorded ({cancelled_count}) than attempted "
            f"({cancel_successes})\n"
            f"  Distribution: {status_distribution}"
        )
