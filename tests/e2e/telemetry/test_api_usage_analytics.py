"""E2E Test 4: API usage analytics.

Validates that API requests produce analytics events with correct fields,
excluded endpoints are filtered, and no sensitive data is captured.

Requirements: AAP-66795, AAP-66796

Run with:
    make test-e2e-telemetry
"""

import httpx
import pytest

from tests.e2e.telemetry.conftest import api_get, get_captured_events, new_request_id

pytestmark = [pytest.mark.e2e]

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
        nexus_base_url: str,
        auth_headers: dict[str, str],
        segment_server_url: str,
    ) -> None:
        """A GET request to a business endpoint must produce an api_call event."""
        rid = new_request_id()
        api_get(nexus_base_url, "/api/v1/workflows", auth_headers, request_id=rid)

        events = get_captured_events(segment_server_url, event_type="api_call", request_id=rid)
        assert len(events) >= 1, "No api_call event captured for GET /api/v1/workflows"

    def test_api_call_event_fields(
        self,
        nexus_base_url: str,
        auth_headers: dict[str, str],
        segment_server_url: str,
    ) -> None:
        """api_call events must include all required analytics fields."""
        rid = new_request_id()
        api_get(nexus_base_url, "/api/v1/workflows", auth_headers, request_id=rid)

        events = get_captured_events(segment_server_url, event_type="api_call", request_id=rid)
        assert len(events) >= 1
        props = events[0].get("properties", {})

        assert "endpoint" in props, f"Missing 'endpoint': {props}"
        assert "http_method" in props, f"Missing 'http_method': {props}"
        assert "status_code" in props, f"Missing 'status_code': {props}"
        assert "response_time_ms" in props, f"Missing 'response_time_ms': {props}"
        assert "request_payload_size" in props, f"Missing 'request_payload_size': {props}"

    def test_api_call_event_values(
        self,
        nexus_base_url: str,
        auth_headers: dict[str, str],
        segment_server_url: str,
    ) -> None:
        """api_call event field values must be reasonable."""
        rid = new_request_id()
        api_get(nexus_base_url, "/api/v1/workflows", auth_headers, request_id=rid)

        events = get_captured_events(segment_server_url, event_type="api_call", request_id=rid)
        assert len(events) >= 1
        props = events[0].get("properties", {})

        assert props["http_method"] == "GET"
        assert 200 <= props["status_code"] < 300
        assert props["response_time_ms"] >= 0
        assert props["request_payload_size"] >= 0
        assert "/workflows" in props["endpoint"]
        assert props["request_id"] == rid

    def test_multiple_requests_produce_distinct_events(
        self,
        nexus_base_url: str,
        auth_headers: dict[str, str],
        segment_server_url: str,
    ) -> None:
        """Each API request with its own request_id produces a correlated event."""
        rid1 = new_request_id()
        rid2 = new_request_id()
        api_get(nexus_base_url, "/api/v1/workflows", auth_headers, request_id=rid1)
        api_get(nexus_base_url, "/api/v1/executions", auth_headers, request_id=rid2)

        events1 = get_captured_events(segment_server_url, event_type="api_call", request_id=rid1)
        events2 = get_captured_events(segment_server_url, event_type="api_call", request_id=rid2)
        assert len(events1) >= 1, f"No api_call event for request_id={rid1}"
        assert len(events2) >= 1, f"No api_call event for request_id={rid2}"
        assert events1[0]["properties"]["request_id"] != events2[0]["properties"]["request_id"]


class TestExcludedEndpoints:
    """Verify health/docs endpoints produce NO analytics events."""

    def test_health_endpoint_excluded(
        self,
        nexus_base_url: str,
        segment_server_url: str,
    ) -> None:
        """GET /health must not produce an api_call event."""
        rid = new_request_id()
        httpx.get(f"{nexus_base_url}/health", headers={"X-Request-Id": rid}, timeout=5)

        events = get_captured_events(segment_server_url, event_type="api_call", request_id=rid, wait=False)
        assert len(events) == 0, f"Expected no api_call events for /health, got {len(events)}"

    def test_docs_endpoint_excluded(
        self,
        nexus_base_url: str,
        segment_server_url: str,
    ) -> None:
        """GET /docs must not produce an api_call event."""
        rid = new_request_id()
        httpx.get(f"{nexus_base_url}/docs", headers={"X-Request-Id": rid}, timeout=5)

        events = get_captured_events(segment_server_url, event_type="api_call", request_id=rid, wait=False)
        assert len(events) == 0, f"Expected no api_call events for /docs, got {len(events)}"

    def test_openapi_json_excluded(
        self,
        nexus_base_url: str,
        segment_server_url: str,
    ) -> None:
        """GET /openapi.json must not produce an api_call event."""
        rid = new_request_id()
        httpx.get(f"{nexus_base_url}/openapi.json", headers={"X-Request-Id": rid}, timeout=5)

        events = get_captured_events(segment_server_url, event_type="api_call", request_id=rid, wait=False)
        assert len(events) == 0, f"Expected no api_call events for /openapi.json, got {len(events)}"

    def test_redoc_endpoint_excluded(
        self,
        nexus_base_url: str,
        segment_server_url: str,
    ) -> None:
        """GET /redoc must not produce an api_call event."""
        rid = new_request_id()
        httpx.get(f"{nexus_base_url}/redoc", headers={"X-Request-Id": rid}, timeout=5)

        events = get_captured_events(segment_server_url, event_type="api_call", request_id=rid, wait=False)
        assert len(events) == 0, f"Expected no api_call events for /redoc, got {len(events)}"


class TestNoSensitiveData:
    """Verify api_call events contain no sensitive data."""

    def test_no_sensitive_fields_in_properties(
        self,
        nexus_base_url: str,
        auth_headers: dict[str, str],
        segment_server_url: str,
    ) -> None:
        """api_call event properties must not contain any sensitive fields."""
        rid = new_request_id()
        api_get(nexus_base_url, "/api/v1/workflows", auth_headers, request_id=rid)

        events = get_captured_events(segment_server_url, event_type="api_call", request_id=rid)
        assert len(events) >= 1

        for event in events:
            props = event.get("properties", {})
            found = SENSITIVE_FIELDS & set(props.keys())
            assert not found, f"Sensitive fields found in api_call event: {found}"

    def test_only_expected_fields_present(
        self,
        nexus_base_url: str,
        auth_headers: dict[str, str],
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
            "request_id",
        }

        rid = new_request_id()
        api_get(nexus_base_url, "/api/v1/workflows", auth_headers, request_id=rid)

        events = get_captured_events(segment_server_url, event_type="api_call", request_id=rid)
        assert len(events) >= 1

        for event in events:
            props = event.get("properties", {})
            unexpected = set(props.keys()) - expected_fields
            assert not unexpected, f"Unexpected fields in api_call event: {unexpected}"
