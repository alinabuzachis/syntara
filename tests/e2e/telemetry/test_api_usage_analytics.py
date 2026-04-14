"""E2E Test 4: API usage analytics.

Validates that API requests produce analytics events with correct fields,
excluded endpoints are filtered, and no sensitive data is captured.

Requirements: AAP-66795, AAP-66796

Run with:
    make test-e2e-telemetry
"""

import httpx
import pytest
from nexus_api_client.api import NexusApiRegistry

from tests.e2e.telemetry.conftest import get_captured_events

pytestmark = pytest.mark.e2e

# Fields that must never appear in api_call event properties
SENSITIVE_FIELDS = {
    "authorization",
    "cookie",
    "request_body",
    "response_body",
    "query_string",
    "query_parameters",
    "headers",
    "token",
    "api_key",
    "password",
}


class TestAPICallEventCapture:
    """Verify api_call events are produced for non-excluded API requests."""

    def test_get_request_produces_api_call_event(
        self,
        nexus_api: NexusApiRegistry,
        segment_server_url: str,
    ) -> None:
        """A GET request to a business endpoint must produce an api_call event."""
        nexus_api.workflows.list().assert_and_get()

        events = get_captured_events(segment_server_url, event_type="api_call")
        assert len(events) >= 1, "No api_call event captured for GET /api/v1/workflows"

    def test_api_call_event_fields(
        self,
        nexus_api: NexusApiRegistry,
        segment_server_url: str,
    ) -> None:
        """api_call events must include all required analytics fields."""
        nexus_api.workflows.list().assert_and_get()

        events = get_captured_events(segment_server_url, event_type="api_call")
        assert len(events) >= 1
        props = events[0].get("properties", {})

        assert "endpoint" in props, f"Missing 'endpoint': {props}"
        assert "http_method" in props, f"Missing 'http_method': {props}"
        assert "status_code" in props, f"Missing 'status_code': {props}"
        assert "response_time_ms" in props, f"Missing 'response_time_ms': {props}"
        assert "request_payload_size" in props, f"Missing 'request_payload_size': {props}"

    def test_api_call_event_values(
        self,
        nexus_api: NexusApiRegistry,
        segment_server_url: str,
    ) -> None:
        """api_call event field values must be reasonable."""
        nexus_api.workflows.list().assert_and_get()

        events = get_captured_events(segment_server_url, event_type="api_call")
        assert len(events) >= 1
        props = events[0].get("properties", {})

        assert props["http_method"] == "GET"
        assert 200 <= props["status_code"] < 300
        assert props["response_time_ms"] >= 0
        assert props["request_payload_size"] >= 0
        assert "/workflows" in props["endpoint"]

    def test_multiple_requests_produce_multiple_events(
        self,
        nexus_api: NexusApiRegistry,
        segment_server_url: str,
    ) -> None:
        """Each API request should produce its own api_call event."""
        nexus_api.workflows.list().assert_and_get()
        nexus_api.executions.list().assert_and_get()
        nexus_api.approvals.list().assert_and_get()

        events = get_captured_events(segment_server_url, event_type="api_call")
        assert len(events) >= 3, f"Expected at least 3 api_call events, got {len(events)}"


class TestExcludedEndpoints:
    """Verify health/docs endpoints produce NO analytics events."""

    def test_health_endpoint_excluded(
        self,
        nexus_base_url: str,
        segment_server_url: str,
    ) -> None:
        """GET /health must not produce an api_call event."""
        httpx.get(f"{nexus_base_url}/health", timeout=5)

        events = get_captured_events(segment_server_url, event_type="api_call")
        health_events = [e for e in events if e.get("properties", {}).get("endpoint") == "/health"]
        assert len(health_events) == 0, f"Expected no api_call events for /health, got {len(health_events)}"

    def test_docs_endpoint_excluded(
        self,
        nexus_base_url: str,
        segment_server_url: str,
    ) -> None:
        """GET /docs must not produce an api_call event."""
        httpx.get(f"{nexus_base_url}/docs", timeout=5)

        events = get_captured_events(segment_server_url, event_type="api_call")
        docs_events = [e for e in events if e.get("properties", {}).get("endpoint") == "/docs"]
        assert len(docs_events) == 0, f"Expected no api_call events for /docs, got {len(docs_events)}"

    def test_openapi_json_excluded(
        self,
        nexus_base_url: str,
        segment_server_url: str,
    ) -> None:
        """GET /openapi.json must not produce an api_call event."""
        httpx.get(f"{nexus_base_url}/openapi.json", timeout=5)

        events = get_captured_events(segment_server_url, event_type="api_call")
        openapi_events = [e for e in events if e.get("properties", {}).get("endpoint") == "/openapi.json"]
        assert len(openapi_events) == 0, f"Expected no api_call events for /openapi.json, got {len(openapi_events)}"

    def test_redoc_endpoint_excluded(
        self,
        nexus_base_url: str,
        segment_server_url: str,
    ) -> None:
        """GET /redoc must not produce an api_call event."""
        httpx.get(f"{nexus_base_url}/redoc", timeout=5)

        events = get_captured_events(segment_server_url, event_type="api_call")
        redoc_events = [e for e in events if e.get("properties", {}).get("endpoint") == "/redoc"]
        assert len(redoc_events) == 0, f"Expected no api_call events for /redoc, got {len(redoc_events)}"


class TestNoSensitiveData:
    """Verify api_call events contain no sensitive data."""

    def test_no_sensitive_fields_in_properties(
        self,
        nexus_api: NexusApiRegistry,
        segment_server_url: str,
    ) -> None:
        """api_call event properties must not contain any sensitive fields."""
        nexus_api.workflows.list().assert_and_get()

        events = get_captured_events(segment_server_url, event_type="api_call")
        assert len(events) >= 1

        for event in events:
            props = event.get("properties", {})
            found = SENSITIVE_FIELDS & set(props.keys())
            assert not found, f"Sensitive fields found in api_call event: {found}"

    def test_only_expected_fields_present(
        self,
        nexus_api: NexusApiRegistry,
        segment_server_url: str,
    ) -> None:
        """api_call events must only contain the defined safe fields."""
        expected_fields = {
            "endpoint",
            "http_method",
            "status_code",
            "response_time_ms",
            "request_payload_size",
            "entitlement_id",
        }

        nexus_api.workflows.list().assert_and_get()

        events = get_captured_events(segment_server_url, event_type="api_call")
        assert len(events) >= 1

        for event in events:
            props = event.get("properties", {})
            unexpected = set(props.keys()) - expected_fields
            assert not unexpected, f"Unexpected fields in api_call event: {unexpected}"
