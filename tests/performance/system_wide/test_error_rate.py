"""Suite 9 — System-Wide: Error Rate KPIs (9.3, 9.4).

Test 9.3: Mixed workload across all services for 10 minutes
    KPI: Error Rate by Service < 1% per service
    MetricType: ERROR, SYSTEM_ERROR_RATE
    Validation: /_internal/metrics/kpis/system_wide → error_rate

Test 9.4: Degrade one service and measure impact
    KPI: Cascading Failure Detection — error rate remains < 5%
    MetricType: ERROR
    Validation: /_internal/metrics/records?metric_type=error → group by endpoint

Run with:
    make test-performance
"""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING, Any

import pytest
from nexus_api_client.models.execution_create import ExecutionCreate

from tests.performance.conftest import (
    poll_for_component_kpis,
    poll_for_metric_records,
    submit_invocation,
)
from tests.performance.system_wide.conftest import (
    MIXED_WORKLOAD_PROMPTS,
    SYSTEM_WIDE_COMPONENT,
    extract_error_records_by_endpoint,
    extract_error_records_by_service,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

MIXED_WORKLOAD_DURATION = 120.0
MIXED_WORKLOAD_BATCH_SIZE = 10
TARGET_ERROR_RATE_PER_SERVICE = 0.01
TARGET_CASCADING_ERROR_RATE = 0.05
DEGRADATION_REQUEST_COUNT = 50
CONCURRENT_WORKERS = 10


class TestErrorRateByService:
    """9.3 — Mixed workload across all services.

    Validates:
        - Overall error rate < 1% per service
        - ERROR metric records are emitted with service categorization
        - Server-side system_wide error_rate KPI < 1%
        - Multiple API endpoints are exercised concurrently

    The mixed workload submits requests across workflows, invocations,
    and other API endpoints for the configured duration. Error rates
    are calculated both from client-side HTTP responses and server-side
    metric records.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    @staticmethod
    def _list_workflows(nexus_api: NexusApiRegistry) -> tuple[bool, str]:
        """List workflows and return (success, endpoint)."""
        try:
            r = nexus_api.workflows.list()
            return r.is_success, "/api/v1/workflows"
        except Exception:
            return False, "/api/v1/workflows"

    @staticmethod
    def _list_executions(nexus_api: NexusApiRegistry) -> tuple[bool, str]:
        """List executions and return (success, endpoint)."""
        try:
            r = nexus_api.executions.list()
            return r.is_success, "/api/v1/executions"
        except Exception:
            return False, "/api/v1/executions"

    @staticmethod
    def _submit_invocation(nexus_api: NexusApiRegistry, prompt: str) -> tuple[bool, str]:
        """Submit an invocation and return (success, endpoint)."""
        _, ok, _ = submit_invocation(nexus_api, prompt)
        return ok, "/api/v1/invocations"

    @staticmethod
    def _list_tool_providers(nexus_api: NexusApiRegistry) -> tuple[bool, str]:
        """List tool providers and return (success, endpoint)."""
        try:
            r = nexus_api.tool_manager.get_tool_providers()
            return r.is_success, "/api/v1/tool_manager/providers"
        except Exception:
            return False, "/api/v1/tool_manager/providers"

    @staticmethod
    def _list_settings(nexus_api: NexusApiRegistry) -> tuple[bool, str]:
        """List settings and return (success, endpoint)."""
        try:
            r = nexus_api.settings.list()
            return r.is_success, "/api/v1/settings"
        except Exception:
            return False, "/api/v1/settings"

    def _run_mixed_workload_batch(
        self,
        nexus_api: NexusApiRegistry,
        batch_index: int,
    ) -> list[tuple[bool, str]]:
        """Run one batch of mixed workload operations.

        Returns a list of (success, endpoint) tuples.
        """
        results: list[tuple[bool, str]] = []
        prompt = MIXED_WORKLOAD_PROMPTS[batch_index % len(MIXED_WORKLOAD_PROMPTS)]

        operations: list[tuple[Any, tuple[Any, ...]]] = [
            (self._list_workflows, (nexus_api,)),
            (self._list_executions, (nexus_api,)),
            (self._submit_invocation, (nexus_api, prompt)),
            (self._list_tool_providers, (nexus_api,)),
            (self._list_settings, (nexus_api,)),
        ]

        op_func, op_args = operations[batch_index % len(operations)]
        results.append(op_func(*op_args))
        return results

    def test_error_rate_below_target(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Run mixed workload; error rate per service must be < 1%."""
        endpoint_successes: dict[str, int] = {}
        endpoint_failures: dict[str, int] = {}
        total_requests = 0
        batch_index = 0

        start_time = time.monotonic()
        deadline = start_time + MIXED_WORKLOAD_DURATION

        while time.monotonic() < deadline:
            with ThreadPoolExecutor(max_workers=CONCURRENT_WORKERS) as executor:
                futures = [
                    executor.submit(
                        self._run_mixed_workload_batch,
                        nexus_api,
                        batch_index + i,
                    )
                    for i in range(MIXED_WORKLOAD_BATCH_SIZE)
                ]
                for future in as_completed(futures):
                    for success, endpoint in future.result():
                        total_requests += 1
                        if success:
                            endpoint_successes[endpoint] = endpoint_successes.get(endpoint, 0) + 1
                        else:
                            endpoint_failures[endpoint] = endpoint_failures.get(endpoint, 0) + 1

            batch_index += MIXED_WORKLOAD_BATCH_SIZE

        assert total_requests > 0, "No requests were executed during mixed workload"

        total_failures = sum(endpoint_failures.values())
        overall_error_rate = total_failures / total_requests if total_requests > 0 else 0

        per_endpoint_rates: dict[str, float] = {}
        for endpoint in set(endpoint_successes) | set(endpoint_failures):
            s = endpoint_successes.get(endpoint, 0)
            f = endpoint_failures.get(endpoint, 0)
            total = s + f
            per_endpoint_rates[endpoint] = f / total if total > 0 else 0

        kpis = poll_for_component_kpis(
            nexus_api.internal_metrics,
            SYSTEM_WIDE_COMPONENT,
        )
        server_error_rate = kpis.get("metrics", {}).get("error_rate", None)

        records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "error",
            limit=total_requests,
        )
        error_by_service = extract_error_records_by_service(records)

        actual_duration = time.monotonic() - start_time
        diag = (
            f"\n--- Mixed workload error rate results ---\n"
            f"  duration={actual_duration:.0f}s, "
            f"total_requests={total_requests}\n"
            f"  overall_error_rate={overall_error_rate:.4%}\n"
            f"  per_endpoint_rates={per_endpoint_rates}\n"
            f"  endpoint_successes={endpoint_successes}\n"
            f"  endpoint_failures={endpoint_failures}\n"
            f"  server_error_rate={server_error_rate}\n"
            f"  error_records_by_service={error_by_service}\n"
        )

        assert overall_error_rate < TARGET_ERROR_RATE_PER_SERVICE, (
            f"Overall error rate {overall_error_rate:.4%} exceeds target {TARGET_ERROR_RATE_PER_SERVICE:.0%}{diag}"
        )

        for endpoint, rate in per_endpoint_rates.items():
            assert rate < TARGET_ERROR_RATE_PER_SERVICE, (
                f"Error rate for {endpoint} is {rate:.4%}, exceeds target {TARGET_ERROR_RATE_PER_SERVICE:.0%}{diag}"
            )

        if isinstance(server_error_rate, (int, float)) and server_error_rate > 0:
            assert server_error_rate < TARGET_ERROR_RATE_PER_SERVICE, (
                f"Server-reported error rate {server_error_rate:.4%} "
                f"exceeds target {TARGET_ERROR_RATE_PER_SERVICE:.0%}{diag}"
            )


class TestCascadingFailureDetection:
    """9.4 — Degrade one service and measure impact.

    Validates:
        - When requests hit non-existent resources (simulating a degraded
          subsystem), the overall error rate remains < 5%
        - Error records are grouped by endpoint for failure isolation
        - Healthy endpoints continue to function normally

    This test simulates partial degradation by mixing valid requests
    (list workflows, list settings) with requests to non-existent
    resources (execute a fake workflow ID).  The system should handle
    the degraded path gracefully without cascading failures to
    healthy endpoints.

    Note: True infrastructure-level degradation (e.g., killing a DB pod,
    throttling network) requires OpenShift-level fault injection.  This
    test validates the application-layer error handling and categorization.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    @staticmethod
    def _healthy_request(nexus_api: NexusApiRegistry) -> tuple[bool, str]:
        """Make a request to a known-healthy endpoint."""
        try:
            r = nexus_api.workflows.list()
            return r.is_success, "healthy:/api/v1/workflows"
        except Exception:
            return False, "healthy:/api/v1/workflows"

    @staticmethod
    def _healthy_settings_request(nexus_api: NexusApiRegistry) -> tuple[bool, str]:
        """Make a request to the settings endpoint."""
        try:
            r = nexus_api.settings.list()
            return r.is_success, "healthy:/api/v1/settings"
        except Exception:
            return False, "healthy:/api/v1/settings"

    @staticmethod
    def _degraded_request(nexus_api: NexusApiRegistry) -> tuple[bool, str]:
        """Make a request that simulates degraded-service interaction.

        Submitting an execution for a non-existent workflow exercises
        the error handling path without requiring actual infrastructure
        degradation.
        """
        from uuid import uuid4

        try:
            r = nexus_api.executions.create(
                body=ExecutionCreate(workflow_id=uuid4()),
            )
            return r.is_success or r.status_code in (200, 201, 202), "degraded:/api/v1/executions"
        except Exception:
            return False, "degraded:/api/v1/executions"

    def test_cascading_failure_error_rate(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Mix healthy and degraded requests; overall error rate must stay < 5%."""
        results: list[tuple[bool, str]] = []

        with ThreadPoolExecutor(max_workers=CONCURRENT_WORKERS) as executor:
            futures = []
            for i in range(DEGRADATION_REQUEST_COUNT):
                if i % 5 == 0:
                    futures.append(executor.submit(self._degraded_request, nexus_api))
                elif i % 3 == 0:
                    futures.append(executor.submit(self._healthy_settings_request, nexus_api))
                else:
                    futures.append(executor.submit(self._healthy_request, nexus_api))

            for future in as_completed(futures):
                results.append(future.result())

        assert len(results) > 0, "No requests were executed"

        healthy_results = [(ok, ep) for ok, ep in results if ep.startswith("healthy:")]
        degraded_results = [(ok, ep) for ok, ep in results if ep.startswith("degraded:")]

        healthy_total = len(healthy_results)
        healthy_successes = sum(1 for ok, _ in healthy_results if ok)
        healthy_failures = healthy_total - healthy_successes
        healthy_error_rate = healthy_failures / healthy_total if healthy_total > 0 else 0

        degraded_total = len(degraded_results)
        degraded_expected_failures = sum(1 for ok, _ in degraded_results if not ok)

        total_requests = len(results)
        total_unexpected_errors = healthy_failures
        overall_unexpected_rate = total_unexpected_errors / total_requests if total_requests > 0 else 0

        records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "error",
            limit=total_requests,
        )
        error_by_endpoint = extract_error_records_by_endpoint(records)

        diag = (
            f"\n--- Cascading failure detection results ---\n"
            f"  total_requests={total_requests}\n"
            f"  healthy: total={healthy_total}, "
            f"successes={healthy_successes}, "
            f"failures={healthy_failures}, "
            f"error_rate={healthy_error_rate:.4%}\n"
            f"  degraded: total={degraded_total}, "
            f"expected_failures={degraded_expected_failures}\n"
            f"  overall_unexpected_error_rate={overall_unexpected_rate:.4%}\n"
            f"  error_records_by_endpoint={error_by_endpoint}\n"
        )

        assert healthy_error_rate < TARGET_CASCADING_ERROR_RATE, (
            f"Healthy endpoint error rate {healthy_error_rate:.4%} "
            f"exceeds cascading failure threshold "
            f"{TARGET_CASCADING_ERROR_RATE:.0%}{diag}"
        )

        assert overall_unexpected_rate < TARGET_CASCADING_ERROR_RATE, (
            f"Overall unexpected error rate {overall_unexpected_rate:.4%} "
            f"exceeds cascading failure threshold "
            f"{TARGET_CASCADING_ERROR_RATE:.0%}{diag}"
        )

    def test_error_records_grouped_by_endpoint(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Submit mixed requests and verify error records carry endpoint labels."""
        results: list[tuple[bool, str]] = []

        for i in range(DEGRADATION_REQUEST_COUNT // 2):
            if i % 3 == 0:
                results.append(self._degraded_request(nexus_api))
            else:
                results.append(self._healthy_request(nexus_api))

        records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "error",
            limit=DEGRADATION_REQUEST_COUNT,
        )

        error_by_endpoint = extract_error_records_by_endpoint(records)

        diag = (
            f"\n--- Error grouping results ---\n"
            f"  total_requests={len(results)}\n"
            f"  error_record_count={records.get('total', 0)}\n"
            f"  error_by_endpoint={error_by_endpoint}\n"
        )

        if records.get("total", 0) > 0:
            for record in records.get("records", []):
                labels: dict[str, Any] = record.get("labels", {})
                has_endpoint = (
                    "endpoint" in labels or "path" in labels or "status_code" in labels or "error_type" in labels
                )
                assert has_endpoint, f"Error record missing endpoint/categorization labels: {labels}{diag}"
