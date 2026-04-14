"""Shared fixtures and helpers for telemetry e2e tests."""

import os
import time
from typing import Any

import httpx
import pytest

SEGMENT_SERVER_PORT = 9999
DEFAULT_SEGMENT_SERVER_URL = f"http://localhost:{SEGMENT_SERVER_PORT}"
DEFAULT_POLL_TIMEOUT = 5.0
POLL_INTERVAL = 0.5


@pytest.fixture(scope="session")
def segment_server_url() -> str:
    """Return the Segment server URL, verifying it is reachable.

    Currently points to a local mock server. This can be swapped to the
    real Segment API endpoint when downstream integration tests are needed.
    """
    url = os.environ.get("SEGMENT_SERVER_URL", DEFAULT_SEGMENT_SERVER_URL)
    try:
        r = httpx.get(f"{url}/health", timeout=5)
        r.raise_for_status()
    except (httpx.RequestError, httpx.HTTPStatusError) as exc:
        pytest.exit(
            f"Mock Segment server not available at {url}: {exc}\n"
            "Start it with: uv run python tests/e2e/telemetry/mock_segment_server.py",
            returncode=1,
        )
    return url


def get_captured_events(
    segment_server_url: str,
    event_type: str | None = None,
    *,
    wait: bool = True,
    timeout: float = DEFAULT_POLL_TIMEOUT,
) -> list[dict[str, Any]]:
    """Fetch captured events from the Segment server and clear them.

    Events are cleared from the server after capture so each call only
    returns events produced since the last call, ensuring test isolation.

    Args:
        segment_server_url: Base URL of the Segment server.
        event_type: Optional Segment event name filter (e.g. "api_call").
        wait: If True, poll until events appear or timeout.
        timeout: Maximum seconds to poll when ``wait`` is True.

    Returns:
        List of captured Segment event dicts.

    """
    params = {"event_type": event_type} if event_type else {}
    if wait:
        elapsed = 0.0
        while elapsed < timeout:
            time.sleep(POLL_INTERVAL)
            elapsed += POLL_INTERVAL
            r = httpx.get(f"{segment_server_url}/captured-events", params=params, timeout=5)
            r.raise_for_status()
            result: list[dict[str, Any]] = r.json()
            if result:
                httpx.delete(f"{segment_server_url}/captured-events", timeout=5)
                return result
        return []
    r = httpx.get(f"{segment_server_url}/captured-events", params=params, timeout=5)
    r.raise_for_status()
    events: list[dict[str, Any]] = r.json()
    httpx.delete(f"{segment_server_url}/captured-events", timeout=5)
    return events


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
