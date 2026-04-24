"""E2E test: new_user telemetry event on first login.

Validates that a new_user Segment event is emitted when a user logs in
for the first time, with an anonymized user ID and correct trigger.

Requirement: AAP-72353

Run with:
    make test-e2e-telemetry
"""

from collections.abc import Generator
from typing import Any
from uuid import uuid4

import httpx
import pytest
from nexus_api_client import AuthenticatedClient

from tests.e2e.telemetry.conftest import get_captured_events, new_request_id

pytestmark = pytest.mark.e2e


@pytest.fixture(scope="module")
def new_user_login(
    nexus_client: AuthenticatedClient,
    nexus_base_url: str,
    segment_server_url: str,
) -> Generator[dict[str, Any], None, None]:
    """Create a fresh user, log them in, yield captured telemetry events, then delete the user.

    The login request carries an X-Request-Id so we can correlate the
    new_user event back to this specific login.
    """
    username = f"e2e-newuser-{uuid4().hex[:8]}"
    password = "TestPass1234!"  # noqa: S105
    email = f"{username}@example.com"

    # Create user via admin API client
    admin_http = nexus_client.get_httpx_client()
    create_resp = admin_http.post(
        "/users",
        json={
            "username": username,
            "email": email,
            "full_name": "E2E New User Test",
            "password": password,
        },
    )
    create_resp.raise_for_status()
    user_id = create_resp.json()["id"]

    # First login with X-Request-Id for correlation (unauthenticated endpoint)
    rid = new_request_id()
    login_resp = httpx.post(
        f"{nexus_base_url}/api/v1/auth/login",
        json={"username": username, "password": password},
        headers={"X-Request-Id": rid},
        timeout=10,
    )
    login_resp.raise_for_status()

    # Collect new_user events correlated by request_id
    events = get_captured_events(
        segment_server_url,
        event_type="new_user",
        request_id=rid,
        timeout=10.0,
    )

    yield {
        "events": events,
        "request_id": rid,
        "user_id": user_id,
        "username": username,
    }

    # Teardown: delete the test user
    admin_http.delete(f"/users/{user_id}")


class TestNewUserEvent:
    """Verify new_user telemetry event on first login."""

    def test_new_user_event_emitted(
        self,
        new_user_login: dict[str, Any],
    ) -> None:
        """A new_user event must be emitted on the user's first login."""
        assert len(new_user_login["events"]) >= 1, "No new_user event captured"

    def test_new_user_event_has_required_fields(
        self,
        new_user_login: dict[str, Any],
    ) -> None:
        """The new_user event must contain user_id_hash, amr, and idp."""
        events = new_user_login["events"]
        assert len(events) >= 1
        props = events[0].get("properties", {})

        assert "user_id_hash" in props, f"Missing user_id_hash: {props}"
        assert "amr" in props, f"Missing amr: {props}"
        assert props["amr"] == ["pwd"]
        assert "idp" in props, f"Missing idp: {props}"
        assert props["idp"] == "local"

    def test_user_id_is_anonymized(
        self,
        new_user_login: dict[str, Any],
    ) -> None:
        """The user_id_hash must be a 64-char hex digest, not the raw UUID."""
        events = new_user_login["events"]
        assert len(events) >= 1
        props = events[0].get("properties", {})

        user_id_hash = props.get("user_id_hash", "")
        assert len(user_id_hash) == 64, f"Expected 64-char hash, got {len(user_id_hash)}"
        # Must not contain the raw user UUID
        assert new_user_login["user_id"] not in user_id_hash

    def test_no_duplicate_on_second_login(
        self,
        nexus_base_url: str,
        segment_server_url: str,
        new_user_login: dict[str, Any],
    ) -> None:
        """A second login must NOT emit another new_user event."""
        username = new_user_login["username"]
        rid = new_request_id()

        login_resp = httpx.post(
            f"{nexus_base_url}/api/v1/auth/login",
            json={"username": username, "password": "TestPass1234!"},
            headers={"X-Request-Id": rid},
            timeout=10,
        )
        login_resp.raise_for_status()

        events = get_captured_events(
            segment_server_url,
            event_type="new_user",
            request_id=rid,
            timeout=5.0,
        )
        assert len(events) == 0, f"new_user event emitted on second login: {events}"

    def test_carries_request_id(
        self,
        new_user_login: dict[str, Any],
    ) -> None:
        """The new_user event must carry the originating X-Request-Id."""
        events = new_user_login["events"]
        assert len(events) >= 1
        props = events[0].get("properties", {})
        assert props.get("request_id") == new_user_login["request_id"]

    def test_carries_entitlement_id(
        self,
        new_user_login: dict[str, Any],
    ) -> None:
        """The new_user event must include an entitlement_id."""
        events = new_user_login["events"]
        assert len(events) >= 1
        props = events[0].get("properties", {})
        assert "entitlement_id" in props
