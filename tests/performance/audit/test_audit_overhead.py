"""Integration tests for audit system overhead.

Tests measure the performance impact of the audit system by creating
Tool Providers with auditing enabled vs disabled.
"""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING, Any
from uuid import uuid4

import pytest
from nexus_api_client.models.mcp_configuration import MCPConfiguration
from nexus_api_client.models.tool_provider_create import ToolProviderCreate

if TYPE_CHECKING:
    from collections.abc import Callable
    from contextlib import AbstractContextManager

    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

NUM_WORKERS = 20  # Number of concurrent workers
PROVIDERS_PER_WORKER = 10  # Number of ToolProviders to create per worker
TOTAL_PROVIDERS = NUM_WORKERS * PROVIDERS_PER_WORKER  # 200 total providers for meaningful test

# Polling configuration for audit events
AUDIT_POLL_INTERVAL = 1.0  # seconds
AUDIT_POLL_TIMEOUT = 30.0  # seconds - generous timeout for async audit processing


def _poll_for_audit_events(
    nexus_api: NexusApiRegistry,
    expected_count: int,
    event_action: str = "toolprovider_create",
    *,
    base_resource_name: str,
    timeout: float = AUDIT_POLL_TIMEOUT,
    interval: float = AUDIT_POLL_INTERVAL,
) -> list[dict[str, Any]]:
    """Poll audit events API until expected count is reached or timeout.

    Args:
        nexus_api: Authenticated API client registry
        expected_count: Expected total number of events
        event_action: Event action to filter by
        base_resource_name: Base resource name (for correlating audit events per test)
        timeout: Maximum seconds to wait
        interval: Seconds between poll attempts

    Returns:
        List of audit event dicts

    Raises:
        AssertionError: If expected count not reached within timeout

    """
    deadline = time.monotonic() + timeout
    all_events: list[dict[str, Any]] = []

    while time.monotonic() < deadline:
        # Query with include_total and server-side filtering by resource_name
        response = nexus_api.audit_events.list(
            event_action=event_action,
            include_total=True,
            limit=100,
            additional_params={"resource_name[contains]": base_resource_name},
        )

        if not response.is_success:
            time.sleep(interval)
            continue

        audit_data = response.parsed.to_dict() if response.parsed else {}
        total = audit_data.get("total", 0)
        events = audit_data.get("resources", [])

        # If we have enough total events (already filtered by server), collect all via pagination
        if total >= expected_count:
            all_events = events.copy()
            cursor = audit_data.get("next")

            # Paginate through remaining events
            while cursor:
                response = nexus_api.audit_events.list(
                    event_action=event_action,
                    limit=100,
                    cursor=cursor,
                    additional_params={"resource_name[contains]": base_resource_name},
                )
                if response.is_success and response.parsed:
                    page_data = response.parsed.to_dict()
                    all_events.extend(page_data.get("resources", []))
                    cursor = page_data.get("next")
                else:
                    break

            # Check if we have enough events (server already filtered by resource_name)
            if len(all_events) >= expected_count:
                return all_events

        time.sleep(interval)

    # Timeout - fetch final state for diagnostics
    response = nexus_api.audit_events.list(
        event_action=event_action,
        include_total=True,
        limit=100,
        additional_params={"resource_name[contains]": base_resource_name},
    )
    audit_data = response.parsed.to_dict() if response.parsed and response.is_success else {}
    actual_total = audit_data.get("total", 0)

    msg = (
        f"Timeout waiting for {expected_count} audit events. "
        f"Got {actual_total} after {timeout}s. "
        f"Event action: {event_action}"
    )
    raise AssertionError(msg)


def _create_provider(
    nexus_api: NexusApiRegistry,
    batch_id: int,
    base_resource_name: str,
    provider_index: int,
) -> tuple[float, bool]:
    """Create a single Tool Provider and return (elapsed_ms, success).

    Args:
        nexus_api: Authenticated API client registry
        batch_id: Identifier for the batch (for unique names)
        base_resource_name: Base resource name (for correlating audit events per test)
        provider_index: Index within the batch

    Returns:
        Tuple of (elapsed_ms, success)

    """
    start = time.monotonic()
    try:
        response = nexus_api.tool_manager.register_tool_provider(
            body=ToolProviderCreate(
                name=f"{base_resource_name}-{batch_id}-{uuid4()}",
                configuration=MCPConfiguration(
                    base_url=f"http://localhost:8000/mcp-{batch_id}-{provider_index}",
                    provider_type="mcp",
                ),
                description="Performance test provider",
            ),
        )
        elapsed_ms = (time.monotonic() - start) * 1000
        return elapsed_ms, response.is_success or response.status_code == 201
    except Exception:
        elapsed_ms = (time.monotonic() - start) * 1000
        return elapsed_ms, False


def _create_providers_batch(
    nexus_api: NexusApiRegistry,
    count: int,
    batch_id: int,
    *,
    base_resource_name: str,
    max_workers: int = 10,
) -> tuple[int, int, list[float]]:
    """Create multiple Tool Providers concurrently using ThreadPoolExecutor.

    Args:
        nexus_api: Authenticated API client registry
        count: Number of providers to create
        batch_id: Identifier for this batch (for unique names)
        base_resource_name: Base resource name (for correlating audit events per test)
        max_workers: Maximum concurrent threads

    Returns:
        Tuple of (successes, failures, response_times)

    """
    successes = 0
    failures = 0
    response_times: list[float] = []

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [
            executor.submit(
                _create_provider,
                nexus_api,
                batch_id,
                base_resource_name,
                i,
            )
            for i in range(count)
        ]
        for future in as_completed(futures):
            elapsed_ms, ok = future.result()
            response_times.append(elapsed_ms)
            if ok:
                successes += 1
            else:
                failures += 1

    return successes, failures, response_times


class TestAuditOverhead:
    """Measure performance overhead of the audit system.

    Compares execution time and audit event counts when creating Tool Providers
    with auditing enabled vs disabled.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        """Ensure performance test mode is enabled and reset metrics store."""
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_audit_overhead_with_concurrent_workers(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Measure overhead of audit system with concurrent workers (auditing enabled).

        Creates Tool Providers using multiple concurrent workers and measures:
        - Total execution time
        - Number of audit events generated
        - Success rate of provider creation
        """
        start_time = time.perf_counter()

        total_successes = 0
        total_failures = 0
        all_response_times: list[float] = []
        base_resource_name = f"perf-test-audit-enabled{uuid4()}"

        # Create providers in batches using ThreadPoolExecutor
        for batch_id in range(NUM_WORKERS):
            successes, failures, response_times = _create_providers_batch(
                nexus_api,
                PROVIDERS_PER_WORKER,
                batch_id,
                base_resource_name=base_resource_name,
                max_workers=PROVIDERS_PER_WORKER,
            )
            total_successes += successes
            total_failures += failures
            all_response_times.extend(response_times)

        elapsed_time = time.perf_counter() - start_time

        # Report failures if any occurred
        if total_failures > 0:
            pytest.fail(
                f"Provider creation had {total_failures} failures\n"
                f"Created {total_successes}/{TOTAL_PROVIDERS} providers"
            )

        assert total_successes == TOTAL_PROVIDERS, (
            f"Expected {TOTAL_PROVIDERS} providers created, got {total_successes}"
        )

        # Poll for audit events until expected count is reached
        create_events = _poll_for_audit_events(
            nexus_api,
            expected_count=TOTAL_PROVIDERS,
            event_action="toolprovider_create",
            base_resource_name=base_resource_name,
        )

        avg_response_time = sum(all_response_times) / len(all_response_times) if all_response_times else 0

        diagnostics = (
            f"\n--- Audit overhead test (ENABLED) ---\n"
            f"  workers: {NUM_WORKERS}\n"
            f"  providers_per_worker: {PROVIDERS_PER_WORKER}\n"
            f"  total_providers: {TOTAL_PROVIDERS}\n"
            f"  created: {total_successes}\n"
            f"  execution_time: {elapsed_time:.3f}s\n"
            f"  audit_events: {len(create_events)}\n"
            f"  avg_response_time: {avg_response_time:.1f}ms\n"
            f"  avg_time_per_provider: {elapsed_time / total_successes * 1000:.1f}ms\n"
        )

        # Verify audit events were created
        assert len(create_events) == TOTAL_PROVIDERS, (
            f"Expected {TOTAL_PROVIDERS} audit events, got {len(create_events)}{diagnostics}"
        )

    def test_audit_overhead_with_auditing_disabled(
        self,
        nexus_api: NexusApiRegistry,
        override_settings: Callable[..., AbstractContextManager[object]],
    ) -> None:
        """Measure overhead with auditing disabled for comparison.

        Creates Tool Providers using multiple concurrent workers with auditing
        disabled and measures:
        - Total execution time (should be faster than with auditing enabled)
        - Number of audit events generated (should be 0)
        - Success rate of provider creation
        """
        with override_settings(auditing_enabled=False):
            start_time = time.perf_counter()

            total_successes = 0
            total_failures = 0
            all_response_times: list[float] = []
            base_resource_name = f"perf-test-audit-disabled{uuid4()}"

            # Create providers in batches using ThreadPoolExecutor
            for batch_id in range(NUM_WORKERS):
                successes, failures, response_times = _create_providers_batch(
                    nexus_api,
                    PROVIDERS_PER_WORKER,
                    batch_id,
                    base_resource_name=base_resource_name,
                    max_workers=PROVIDERS_PER_WORKER,
                )
                total_successes += successes
                total_failures += failures
                all_response_times.extend(response_times)

            elapsed_time = time.perf_counter() - start_time

            # Report failures if any occurred
            if total_failures > 0:
                pytest.fail(
                    f"Provider creation had {total_failures} failures\n"
                    f"Created {total_successes}/{TOTAL_PROVIDERS} providers"
                )

            assert total_successes == TOTAL_PROVIDERS, (
                f"Expected {TOTAL_PROVIDERS} providers created, got {total_successes}"
            )

        # Poll for audit events - should find 0 since auditing was disabled
        # Use shorter timeout since we expect no events
        try:
            create_events = _poll_for_audit_events(
                nexus_api,
                expected_count=0,
                event_action="toolprovider_create",
                base_resource_name=base_resource_name,
                timeout=5.0,
            )
        except AssertionError:
            # Expected to timeout when expecting 0 events
            # Query directly to get actual count
            response = nexus_api.audit_events.list(
                event_action="toolprovider_create",
                include_total=True,
                limit=1,
                additional_params={"resource_name[contains]": base_resource_name},
            )
            audit_data = response.parsed.to_dict() if response.parsed and response.is_success else {}
            actual_count = audit_data.get("total", 0)
            create_events = []
            if actual_count > 0:
                # Fetch all events for diagnostics
                response = nexus_api.audit_events.list(
                    event_action="toolprovider_create",
                    limit=100,
                    additional_params={"resource_name[contains]": base_resource_name},
                )
                if response.is_success and response.parsed:
                    create_events = response.parsed.to_dict().get("resources", [])

        avg_response_time = sum(all_response_times) / len(all_response_times) if all_response_times else 0

        diagnostics = (
            f"\n--- Audit overhead test (DISABLED) ---\n"
            f"  workers: {NUM_WORKERS}\n"
            f"  providers_per_worker: {PROVIDERS_PER_WORKER}\n"
            f"  total_providers: {TOTAL_PROVIDERS}\n"
            f"  created: {total_successes}\n"
            f"  execution_time: {elapsed_time:.3f}s\n"
            f"  audit_events: {len(create_events)}\n"
            f"  avg_response_time: {avg_response_time:.1f}ms\n"
            f"  avg_time_per_provider: {elapsed_time / total_successes * 1000:.1f}ms\n"
        )

        # Verify NO audit events were created (auditing disabled)
        assert len(create_events) == 0, (
            f"Expected 0 audit events (auditing disabled), got {len(create_events)}{diagnostics}"
        )
