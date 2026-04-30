"""Suite 7 — Tool Manager: Provider Availability KPIs (7.3, 7.5).

Test 7.3: Test provider health checks over 10-minute window
    KPI: Provider Availability > 99.5%
    MetricType: TOOL_PROVIDER_AVAILABILITY
    Validation: /_internal/metrics/records?metric_type=
        tool_provider_availability_ratio

Test 7.5: Validate/refresh tool providers under load
    KPI: Provider Operations — No degradation
    MetricType: TOOL_EXECUTION_DURATION
    Validation: /api/v1/tool_manager/metrics/tools and
        /api/v1/tool_manager/metrics/executions

Run with:
    make test-performance
"""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING

import pytest

from tests.performance.conftest import compute_percentile
from tests.performance.tool_manager.conftest import (
    TOOL_MANAGER_COMPONENT,
    get_available_tool_providers,
    get_available_tools,
    get_tool_execution_history,
    get_tool_metrics_summary,
    refresh_provider,
    validate_provider,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

TARGET_PROVIDER_AVAILABILITY = 0.995
HEALTH_CHECK_INTERVAL_SECONDS = 10
HEALTH_CHECK_WINDOW_SECONDS = 600
VALIDATION_ROUNDS = 5
CONCURRENT_OPS_PER_PROVIDER = 3


class TestProviderAvailability:
    """7.3 — Test provider health checks over 10-minute window.

    Validates:
        - Each registered tool provider can be validated via the
          ``POST /tool_providers/{id}/validate`` endpoint
        - Provider validation success rate > 99.5% over repeated checks
        - Validation response times are reasonable (no timeouts)

    The provider validate endpoint exercises the full MCP connection
    lifecycle (connect, list tools, disconnect) and returns a validation
    result with tool count and any errors.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_provider_health_checks(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Validate providers periodically over 10 minutes; availability must be > 99.5%."""
        providers = get_available_tool_providers(nexus_api)
        if not providers:
            pytest.skip("No tool providers registered — cannot test provider availability")

        provider_ids = [str(p["id"]) for p in providers if "id" in p]
        assert len(provider_ids) > 0, "No valid provider IDs found"

        total_checks = 0
        total_successes = 0
        validation_times: list[float] = []
        per_provider_results: dict[str, dict[str, int]] = {pid: {"success": 0, "failure": 0} for pid in provider_ids}

        deadline = time.monotonic() + HEALTH_CHECK_WINDOW_SECONDS
        check_round = 0

        while time.monotonic() < deadline:
            check_round += 1
            for provider_id in provider_ids:
                elapsed_ms, ok = validate_provider(nexus_api, provider_id)
                validation_times.append(elapsed_ms)
                total_checks += 1
                if ok:
                    total_successes += 1
                    per_provider_results[provider_id]["success"] += 1
                else:
                    per_provider_results[provider_id]["failure"] += 1

            remaining = deadline - time.monotonic()
            if remaining > HEALTH_CHECK_INTERVAL_SECONDS:
                time.sleep(HEALTH_CHECK_INTERVAL_SECONDS)
            elif remaining > 0:
                time.sleep(remaining)

        availability = total_successes / total_checks if total_checks > 0 else 0.0
        p95_time = compute_percentile(validation_times, 95) if validation_times else 0.0

        diag = (
            f"\n--- Provider availability results ---\n"
            f"  providers={len(provider_ids)}, "
            f"check_rounds={check_round}\n"
            f"  total_checks={total_checks}, "
            f"successes={total_successes}, "
            f"availability={availability:.4%}\n"
            f"  validation_time_p95={p95_time:.1f}ms\n"
            f"  per_provider={per_provider_results}\n"
        )

        assert availability >= TARGET_PROVIDER_AVAILABILITY, (
            f"Provider availability {availability:.4%} below target {TARGET_PROVIDER_AVAILABILITY:.1%}{diag}"
        )

    def test_individual_provider_availability(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Verify each provider individually maintains high availability."""
        providers = get_available_tool_providers(nexus_api)
        if not providers:
            pytest.skip("No tool providers registered")

        for provider in providers:
            provider_id = str(provider.get("id", ""))
            provider_name = provider.get("name", "unknown")
            if not provider_id:
                continue

            successes = 0
            total = 0

            for _ in range(VALIDATION_ROUNDS):
                _, ok = validate_provider(nexus_api, provider_id)
                total += 1
                if ok:
                    successes += 1

            availability = successes / total if total > 0 else 0.0
            assert availability >= TARGET_PROVIDER_AVAILABILITY, (
                f"Provider '{provider_name}' ({provider_id}) availability "
                f"{availability:.2%} below target {TARGET_PROVIDER_AVAILABILITY:.1%} "
                f"({successes}/{total} checks passed)"
            )


class TestProviderOperationsUnderLoad:
    """7.5 — Validate/refresh tool providers under load.

    Validates:
        - Concurrent validate and refresh operations complete without
          degradation
        - Tool metrics endpoints remain responsive during provider ops
        - No degradation in tool execution metrics after provider
          operations

    This test exercises the provider management lifecycle under
    concurrent load to ensure operational stability.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_concurrent_provider_operations(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Run concurrent validate + refresh on all providers; no errors allowed."""
        providers = get_available_tool_providers(nexus_api)
        if not providers:
            pytest.skip("No tool providers registered")

        provider_ids = [str(p["id"]) for p in providers if "id" in p]
        assert len(provider_ids) > 0, "No valid provider IDs found"

        validate_times: list[float] = []
        refresh_times: list[float] = []
        validate_successes = 0
        refresh_successes = 0
        total_ops = 0

        for _ in range(CONCURRENT_OPS_PER_PROVIDER):
            with ThreadPoolExecutor(max_workers=len(provider_ids) * 2) as executor:
                validate_futures = {
                    executor.submit(validate_provider, nexus_api, pid): ("validate", pid) for pid in provider_ids
                }
                refresh_futures = {
                    executor.submit(refresh_provider, nexus_api, pid): ("refresh", pid) for pid in provider_ids
                }

                all_futures = {**validate_futures, **refresh_futures}
                for future in as_completed(all_futures):
                    op_type, _ = all_futures[future]
                    elapsed_ms, ok = future.result()
                    total_ops += 1

                    if op_type == "validate":
                        validate_times.append(elapsed_ms)
                        if ok:
                            validate_successes += 1
                    else:
                        refresh_times.append(elapsed_ms)
                        if ok:
                            refresh_successes += 1

        total_validate = len(validate_times)
        total_refresh = len(refresh_times)

        validate_p95 = compute_percentile(validate_times, 95) if validate_times else 0.0
        refresh_p95 = compute_percentile(refresh_times, 95) if refresh_times else 0.0

        diag = (
            f"\n--- Concurrent provider operations results ---\n"
            f"  providers={len(provider_ids)}, "
            f"rounds={CONCURRENT_OPS_PER_PROVIDER}\n"
            f"  validate: {validate_successes}/{total_validate} "
            f"(p95={validate_p95:.1f}ms)\n"
            f"  refresh: {refresh_successes}/{total_refresh} "
            f"(p95={refresh_p95:.1f}ms)\n"
        )

        assert validate_successes == total_validate, f"Some validate operations failed{diag}"

        assert refresh_successes == total_refresh, f"Some refresh operations failed{diag}"

    def test_tool_metrics_endpoints_responsive(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Verify tool metrics endpoints respond correctly after provider operations."""
        providers = get_available_tool_providers(nexus_api)
        if not providers:
            pytest.skip("No tool providers registered")

        for provider in providers[:3]:
            provider_id = str(provider.get("id", ""))
            if provider_id:
                validate_provider(nexus_api, provider_id)
                refresh_provider(nexus_api, provider_id)

        tools_summary = get_tool_metrics_summary(nexus_api)
        tools = get_available_tools(nexus_api)
        history = get_tool_execution_history(nexus_api, limit=10)

        diag = (
            f"\n--- Tool metrics endpoint health ---\n"
            f"  tools_summary_count={len(tools_summary)}\n"
            f"  registered_tools={len(tools)}\n"
            f"  recent_executions={len(history.get('resources', []))}\n"
        )

        assert len(tools) > 0, f"No tools found after provider operations — refresh may have failed{diag}"

    def test_no_kpi_degradation_after_provider_ops(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Verify tool_manager KPIs are accessible after provider operations."""
        providers = get_available_tool_providers(nexus_api)
        if not providers:
            pytest.skip("No tool providers registered")

        for provider in providers:
            provider_id = str(provider.get("id", ""))
            if provider_id:
                validate_provider(nexus_api, provider_id)

        kpis_response = nexus_api.internal_metrics.get_component_kpis(
            component=TOOL_MANAGER_COMPONENT,
        )
        kpis_response.assert_successful()

        parsed = kpis_response.parsed.to_dict() if kpis_response.parsed is not None else {}
        assert parsed.get("component") == TOOL_MANAGER_COMPONENT, (
            f"Expected component='tool_manager', got {parsed.get('component')}"
        )

        metrics = parsed.get("metrics", {})
        expected_keys = {"execution_duration_ms", "execution_success_rate"}
        actual_keys = set(metrics.keys())

        assert expected_keys.issubset(actual_keys), (
            f"Missing expected KPI keys after provider operations: "
            f"{expected_keys - actual_keys} (present: {actual_keys})"
        )
