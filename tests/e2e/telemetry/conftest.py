"""Shared fixtures and helpers for telemetry e2e tests."""

import os
import time
from typing import Any
from uuid import uuid4

import httpx
import pytest

SEGMENT_SERVER_PORT = 9999
DEFAULT_SEGMENT_SERVER_URL = f"http://localhost:{SEGMENT_SERVER_PORT}"
DEFAULT_POLL_TIMEOUT = 10.0
POLL_INTERVAL = 0.5


@pytest.fixture(scope="session")
def segment_server_url() -> str:
    """Return the Segment server URL, verifying it is reachable.

    Behaviour depends on whether APP_BASE_URL is set (externally-managed
    environment) or not (locally-managed environment):

    - APP_BASE_URL set, server unreachable  -> skip with a warning (the
      external environment has no mock Segment server wired up).
    - APP_BASE_URL not set, server reachable -> proceed normally.
    - APP_BASE_URL not set, server unreachable -> fail the test
    """
    url = os.environ.get("SEGMENT_SERVER_URL", DEFAULT_SEGMENT_SERVER_URL)
    try:
        r = httpx.get(f"{url}/health", timeout=5)
        r.raise_for_status()
    except (httpx.RequestError, httpx.HTTPStatusError) as exc:
        if os.environ.get("APP_BASE_URL"):
            pytest.skip(
                f"Mock Segment server not available at {url} — skipping telemetry "
                f"tests because APP_BASE_URL is set and the external environment does "
                f"not have a mock Segment server configured. ({exc})"
            )
        else:
            pytest.fail(
                f"Mock Segment server not available at {url}: {exc}\n"
                "Start it with: uv run python tests/e2e/telemetry/mock_segment_server.py",
            )
    return url


def new_request_id() -> str:
    """Generate a new UUID request_id for X-Request-Id correlation."""
    return str(uuid4())


def get_captured_events(
    segment_server_url: str,
    event_type: str | None = None,
    request_id: str | None = None,
    *,
    wait: bool = True,
    timeout: float = DEFAULT_POLL_TIMEOUT,
) -> list[dict[str, Any]]:
    """Fetch captured events from the Segment server.

    Args:
        segment_server_url: Base URL of the Segment server.
        event_type: Optional Segment event name filter (e.g. "api_call").
        request_id: Optional X-Request-Id filter for correlation.
        wait: If True, poll until events appear or timeout.
        timeout: Maximum seconds to poll when ``wait`` is True.

    Returns:
        List of captured Segment event dicts.

    """
    params: dict[str, str] = {}
    if event_type:
        params["event_type"] = event_type
    if request_id:
        params["request_id"] = request_id
    if wait:
        elapsed = 0.0
        while elapsed < timeout:
            time.sleep(POLL_INTERVAL)
            elapsed += POLL_INTERVAL
            r = httpx.get(f"{segment_server_url}/captured-events", params=params, timeout=5)
            r.raise_for_status()
            result: list[dict[str, Any]] = r.json()
            if result:
                return result
        return []
    r = httpx.get(f"{segment_server_url}/captured-events", params=params, timeout=5)
    r.raise_for_status()
    return r.json()  # type: ignore[no-any-return]


def api_get(
    nexus_base_url: str,
    path: str,
    auth_headers: dict[str, str],
    request_id: str | None = None,
    *,
    timeout: int = 10,
) -> httpx.Response:
    """Make an authenticated GET request, optionally with X-Request-Id."""
    headers = {**auth_headers}
    if request_id:
        headers["X-Request-Id"] = request_id
    return httpx.get(f"{nexus_base_url}{path}", headers=headers, timeout=timeout)


def set_mock_behavior(segment_server_url: str, mode: str) -> None:
    """Switch the mock Segment server behavior.

    Args:
        segment_server_url: Base URL of the mock Segment server.
        mode: "normal" (accept events) or "error" (return 500).

    """
    httpx.post(
        f"{segment_server_url}/test/set-behavior",
        json={"mode": mode},
        timeout=5,
    )
