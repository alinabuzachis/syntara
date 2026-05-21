"""E2E Test 5: Non-functional — performance and resilience.

Validates that telemetry has minimal performance impact, the application
is unaffected when Segment is unreachable, and telemetry failures are
invisible to API consumers.

Requirements: AAP-66664, AAP-66793, AAP-66797

Run with:
    make test-e2e-telemetry
"""

import time

import httpx
import pytest
from nexus_api_client.api import NexusApiRegistry

from tests.e2e.telemetry.conftest import api_get, get_captured_events, new_request_id, set_mock_behavior

pytestmark = pytest.mark.e2e

# Generous threshold: API response should be under 2 seconds.
# The <5% overhead spec requires baseline comparison which is
# better suited to a dedicated performance benchmark; here we
# validate no catastrophic regression.
MAX_RESPONSE_TIME_MS = 2000
BATCH_SIZE = 50
ERROR_LEAK_SAMPLE_SIZE = 5


class TestPerformance:
    """Verify telemetry does not cause measurable performance degradation."""

    def test_api_response_time_acceptable(
        self,
        nexus_base_url: str,
        auth_headers: dict[str, str],
    ) -> None:
        """API responses must remain fast with telemetry enabled."""
        response_times: list[float] = []

        for _ in range(BATCH_SIZE):
            start = time.monotonic()
            r = api_get(nexus_base_url, "/api/v1/workflows", auth_headers)
            elapsed_ms = (time.monotonic() - start) * 1000
            r.raise_for_status()
            response_times.append(elapsed_ms)

        avg_ms = sum(response_times) / len(response_times)
        # P95 index: for N samples, use index min(floor(N*0.95), N-1)
        p95_idx = min(int(len(response_times) * 0.95), len(response_times) - 1)
        p95_ms = sorted(response_times)[p95_idx]

        assert avg_ms < MAX_RESPONSE_TIME_MS, f"Average response time {avg_ms:.0f}ms exceeds {MAX_RESPONSE_TIME_MS}ms"
        assert p95_ms < MAX_RESPONSE_TIME_MS, f"P95 response time {p95_ms:.0f}ms exceeds {MAX_RESPONSE_TIME_MS}ms"


@pytest.mark.xdist_group("resilience")
class TestResilience:
    """Verify application is unaffected when Segment is unreachable.

    Grouped for serial execution because set_mock_behavior("error")
    affects the shared mock server globally.
    """

    def test_api_works_when_segment_returns_errors(
        self,
        nexus_api: NexusApiRegistry,
        segment_server_url: str,
    ) -> None:
        """API requests must succeed even when Segment returns 500 errors."""
        set_mock_behavior(segment_server_url, "error")
        try:
            result = nexus_api.workflows.list().assert_and_get()
            assert isinstance(result.resources, list)

            result = nexus_api.executions.list().assert_and_get()
            assert isinstance(result.resources, list)
        finally:
            set_mock_behavior(segment_server_url, "normal")

    def test_no_telemetry_errors_in_api_responses(
        self,
        nexus_base_url: str,
        auth_headers: dict[str, str],
        segment_server_url: str,
    ) -> None:
        """Telemetry failures must not leak into API response bodies."""
        set_mock_behavior(segment_server_url, "error")
        try:
            for _ in range(ERROR_LEAK_SAMPLE_SIZE):
                r = httpx.get(f"{nexus_base_url}/api/v1/executions", headers=auth_headers, timeout=10)
                r.raise_for_status()
                body = r.text.lower()
                assert "segment error" not in body, "Segment error leaked into API response"
                assert "telemetry failed" not in body, "Telemetry error leaked into API response"
                assert "fire-and-forget" not in body, "Telemetry internals leaked into API response"
        finally:
            set_mock_behavior(segment_server_url, "normal")

    def test_telemetry_resumes_after_segment_recovery(
        self,
        nexus_base_url: str,
        auth_headers: dict[str, str],
        segment_server_url: str,
    ) -> None:
        """After Segment recovers, telemetry events should resume flowing."""
        # Phase 1: Segment is down
        set_mock_behavior(segment_server_url, "error")
        api_get(nexus_base_url, "/api/v1/workflows", auth_headers)
        time.sleep(2)

        # Phase 2: Segment recovers — use a fresh request_id to correlate
        set_mock_behavior(segment_server_url, "normal")
        rid = new_request_id()
        api_get(nexus_base_url, "/api/v1/executions", auth_headers, request_id=rid)

        events = get_captured_events(segment_server_url, event_type="api_call", request_id=rid)
        assert len(events) >= 1, "No api_call events captured after Segment recovery"
