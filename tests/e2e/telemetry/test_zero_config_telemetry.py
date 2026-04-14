"""E2E Test 1: Zero-configuration telemetry collection and Test 2: Standalone telemetry.

Validates that the Nexus platform collects and transmits telemetry
to Segment without manual intervention and without depending on
other AAP services.

Requirements: AAP-66660, AAP-66789, ANSTRAT-1748 US#2

Run with:
    make test-e2e-telemetry
"""

import pytest
from nexus_api_client.api import NexusApiRegistry

from tests.e2e.telemetry.conftest import get_captured_events

pytestmark = pytest.mark.e2e


class TestZeroConfigTelemetry:
    """Verify telemetry starts automatically on default deployment."""

    def test_api_requests_produce_telemetry_events(
        self,
        nexus_api: NexusApiRegistry,
        segment_server_url: str,
    ) -> None:
        """Making API requests should produce api_call events without manual config."""
        nexus_api.workflows.list().assert_and_get()

        events = get_captured_events(segment_server_url, event_type="api_call")
        assert len(events) >= 1, "No api_call events captured after API request"

    def test_events_contain_anonymous_id(
        self,
        nexus_api: NexusApiRegistry,
        segment_server_url: str,
    ) -> None:
        """All events must include an anonymousId that is a SHA-256 hex digest.

        Note: The test plan references ``installation_id`` — in the implementation
        the installation_id is used internally to *derive* the anonymousId
        (SHA-256 of installation_id:db_host:db_name) but is not sent as a
        separate event field. This test validates that derived identifier.
        """
        nexus_api.workflows.list().assert_and_get()

        events = get_captured_events(segment_server_url)
        assert len(events) >= 1, "No events captured"

        for event in events:
            assert "anonymousId" in event, f"Event missing anonymousId: {event}"
            anon_id = event["anonymousId"]
            assert len(anon_id) == 64, f"anonymousId should be SHA-256 hex (64 chars), got {len(anon_id)} chars"
            assert all(c in "0123456789abcdef" for c in anon_id), f"anonymousId should be lowercase hex, got: {anon_id}"

    def test_events_contain_entitlement_id(
        self,
        nexus_api: NexusApiRegistry,
        segment_server_url: str,
    ) -> None:
        """All events must include entitlement_id in properties."""
        nexus_api.workflows.list().assert_and_get()

        events = get_captured_events(segment_server_url)
        assert len(events) >= 1, "No events captured"

        for event in events:
            props = event.get("properties", {})
            assert "entitlement_id" in props, f"Event missing entitlement_id in properties: {event}"

    def test_consistent_anonymous_id_across_events(
        self,
        nexus_api: NexusApiRegistry,
        segment_server_url: str,
    ) -> None:
        """All events from the same deployment must share the same anonymousId."""
        nexus_api.workflows.list().assert_and_get()
        nexus_api.executions.list().assert_and_get()

        events = get_captured_events(segment_server_url)
        assert len(events) >= 2, "Need at least 2 events to verify consistency"

        anon_ids = {e["anonymousId"] for e in events}
        assert len(anon_ids) == 1, f"Expected all events to share one anonymousId, got {len(anon_ids)}: {anon_ids}"


class TestStandaloneTelemetry:
    """Verify telemetry works without other AAP services (Test 2).

    The Nexus e2e environment runs without Automation Controller,
    Hub, EDA, or any other AAP service. If telemetry events arrive,
    standalone operation is confirmed.
    """

    def test_telemetry_emits_without_aap_services(
        self,
        nexus_api: NexusApiRegistry,
        segment_server_url: str,
    ) -> None:
        """Telemetry events must be emitted from a standalone Nexus deployment."""
        nexus_api.workflows.list().assert_and_get()
        nexus_api.executions.list().assert_and_get()

        events = get_captured_events(segment_server_url)
        assert len(events) >= 2, "Expected at least 2 api_call events from standalone Nexus deployment"
