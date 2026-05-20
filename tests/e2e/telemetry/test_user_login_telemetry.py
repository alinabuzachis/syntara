"""E2E test: user_login telemetry event on every login.

Validates that a user_login Segment event is emitted on every successful
authentication, with an anonymized user ID and correct fields.

Requirement: AAP-72352

Run with:
    make test-e2e-telemetry
"""

from collections.abc import Generator
from typing import Any
from uuid import uuid4

import httpx
import pytest
from nexus_api_client import AuthenticatedClient

from tests.e2e.telemetry.conftest import (
    E2E_TELEMETRY_TEST_PASSWORD,
    get_captured_events,
    new_request_id,
)

pytestmark = pytest.mark.e2e


@pytest.fixture(scope="module")
def user_login_events(
    nexus_client: AuthenticatedClient,
    nexus_base_url: str,
    segment_server_url: str,
) -> Generator[dict[str, Any], None, None]:
    """Create a user, log them in twice, yield captured user_login events, then clean up.

    Each login carries a distinct X-Request-Id so tests can correlate
    the captured events back to the exact request that triggered them.
    """
    username = f"e2e-login-{uuid4().hex[:8]}"
    password = E2E_TELEMETRY_TEST_PASSWORD
    email = f"{username}@example.com"

    admin_http = nexus_client.get_httpx_client()
    create_resp = admin_http.post(
        "/users",
        json={
            "username": username,
            "email": email,
            "full_name": "E2E Login Test",
            "password": password,
        },
    )
    create_resp.raise_for_status()
    user_id = create_resp.json()["id"]

    # First login
    rid1 = new_request_id()
    httpx.post(
        f"{nexus_base_url}/api/v1/auth/login",
        json={"username": username, "password": password},
        headers={"X-Request-Id": rid1},
        timeout=10,
    ).raise_for_status()

    events_first = get_captured_events(
        segment_server_url,
        event_type="user_login",
        request_id=rid1,
        timeout=10.0,
    )

    # Second login
    rid2 = new_request_id()
    httpx.post(
        f"{nexus_base_url}/api/v1/auth/login",
        json={"username": username, "password": password},
        headers={"X-Request-Id": rid2},
        timeout=10,
    ).raise_for_status()

    events_second = get_captured_events(
        segment_server_url,
        event_type="user_login",
        request_id=rid2,
        timeout=10.0,
    )

    yield {
        "events_first": events_first,
        "events_second": events_second,
        "request_id_first": rid1,
        "request_id_second": rid2,
        "user_id": user_id,
        "username": username,
    }

    admin_http.delete(f"/users/{user_id}")


class TestUserLoginEvent:
    """Verify user_login telemetry event on every login."""

    def test_user_login_event_emitted_on_first_login(
        self,
        user_login_events: dict[str, Any],
    ) -> None:
        """A user_login event must be emitted on the first login."""
        events = user_login_events["events_first"]
        assert len(events) == 1, "No user_login event captured on first login"
        props = events[0].get("properties", {})
        assert props.get("request_id") == user_login_events["request_id_first"]

    def test_user_login_event_emitted_on_second_login(
        self,
        user_login_events: dict[str, Any],
    ) -> None:
        """A user_login event must also be emitted on subsequent logins."""
        events = user_login_events["events_second"]
        assert len(events) == 1, "No user_login event captured on second login"
        props = events[0].get("properties", {})
        assert props.get("request_id") == user_login_events["request_id_second"]

    def test_user_login_event_has_required_fields(
        self,
        user_login_events: dict[str, Any],
    ) -> None:
        """The user_login event must contain user_id_hash, amr, and idp."""
        events = user_login_events["events_first"]
        assert len(events) == 1
        props = events[0].get("properties", {})

        assert props.get("request_id") == user_login_events["request_id_first"]
        assert "user_id_hash" in props, f"Missing user_id_hash: {props}"
        assert props["amr"] == ["pwd"]
        assert props["idp"] == "local"

    def test_user_id_is_anonymized(
        self,
        user_login_events: dict[str, Any],
    ) -> None:
        """The user_id_hash must be a 64-char hex digest, not the raw UUID."""
        events = user_login_events["events_first"]
        assert len(events) == 1
        props = events[0].get("properties", {})

        assert props.get("request_id") == user_login_events["request_id_first"]
        user_id_hash = props.get("user_id_hash", "")
        assert len(user_id_hash) == 64, f"Expected 64-char hash, got {len(user_id_hash)}"
        assert user_login_events["user_id"] not in user_id_hash

    def test_carries_request_id(
        self,
        user_login_events: dict[str, Any],
    ) -> None:
        """The user_login event must carry the originating X-Request-Id."""
        events = user_login_events["events_first"]
        assert len(events) == 1
        props = events[0].get("properties", {})
        assert props.get("request_id") == user_login_events["request_id_first"]

    def test_carries_entitlement_id(
        self,
        user_login_events: dict[str, Any],
    ) -> None:
        """The user_login event must include an entitlement_id."""
        events = user_login_events["events_first"]
        assert len(events) == 1
        props = events[0].get("properties", {})
        assert props.get("request_id") == user_login_events["request_id_first"]
        assert "entitlement_id" in props
