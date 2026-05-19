"""Suite 21 — Authentication Overhead: Auth Stability Under Churn (21.6).

Test 21.6: Sustained load with token rotation (tokens expire, auto-refresh)
    KPI: Auth Stability Under Churn — No 401 spikes, refresh success > 99%
    MetricType: REQUEST_DURATION, ERROR

Validation: Monitor error rate on auth endpoints during sustained test
    with periodic token refresh cycles.

Run with:
    make test-performance
"""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

import pytest

from tests.performance.authentication.conftest import (
    STABILITY_DURATION_SECONDS,
    TARGET_AUTH_STABILITY_ERROR_RATE,
    do_token_refresh,
    login_and_get_tokens,
)
from tests.performance.conftest import (
    poll_for_metric_records,
    timed_http_request,
)

if TYPE_CHECKING:
    from concurrent.futures import Future

    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

REFRESH_INTERVAL_SECONDS = 15
REQUESTS_PER_SECOND = 10
MAX_WORKERS = 30


@dataclass
class StabilityResults:
    """Aggregated results from the sustained auth stability test."""

    request_times: list[float] = field(default_factory=list)
    request_statuses: list[int] = field(default_factory=list)
    refresh_results: list[tuple[float, int]] = field(default_factory=list)
    auth_failures_per_window: list[int] = field(default_factory=list)


def _run_stability_loop(
    nexus_base_url: str,
    username: str,
    password: str,
) -> StabilityResults:
    """Execute the sustained request loop with periodic token refresh."""
    access_token, cookies = login_and_get_tokens(nexus_base_url, username, password)
    current_headers = {"Authorization": f"Bearer {access_token}"}
    results = StabilityResults()

    interval = 1.0 / REQUESTS_PER_SECOND
    end_time = time.monotonic() + STABILITY_DURATION_SECONDS
    last_refresh = time.monotonic()

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures: list[Future[tuple[float, int, dict[str, Any]]]] = []
        window_401_count = 0
        window_request_count = 0

        while time.monotonic() < end_time:
            batch_start = time.monotonic()

            if time.monotonic() - last_refresh >= REFRESH_INTERVAL_SECONDS:
                current_headers, window_401_count, window_request_count = _handle_refresh(
                    nexus_base_url,
                    cookies,
                    results,
                    current_headers,
                    window_401_count,
                    window_request_count,
                )
                last_refresh = time.monotonic()

            futures.append(
                executor.submit(
                    timed_http_request,
                    nexus_base_url,
                    "GET",
                    "/api/v1/workflows?limit=1",
                    headers=current_headers,
                )
            )

            done = [f for f in futures if f.done()]
            for f in done:
                elapsed_ms, status_code, _ = f.result()
                results.request_times.append(elapsed_ms)
                results.request_statuses.append(status_code)
                window_request_count += 1
                if status_code == 401:
                    window_401_count += 1
            futures = [f for f in futures if not f.done()]

            sleep_for = interval - (time.monotonic() - batch_start)
            if sleep_for > 0:
                time.sleep(sleep_for)

        for future in as_completed(futures, timeout=30):
            elapsed_ms, status_code, _ = future.result()
            results.request_times.append(elapsed_ms)
            results.request_statuses.append(status_code)

    return results


def _handle_refresh(
    nexus_base_url: str,
    cookies: dict[str, str],
    results: StabilityResults,
    current_headers: dict[str, str],
    window_401_count: int,
    window_request_count: int,
) -> tuple[dict[str, str], int, int]:
    """Perform a token refresh and record window stats. Returns updated state."""
    refresh_elapsed, refresh_status, refresh_body = do_token_refresh(nexus_base_url, cookies)
    results.refresh_results.append((refresh_elapsed, refresh_status))

    if refresh_status == 200:
        new_token = refresh_body.get("access_token")
        if new_token:
            current_headers = {"Authorization": f"Bearer {new_token}"}

    if window_request_count > 0:
        results.auth_failures_per_window.append(window_401_count)

    return current_headers, 0, 0


class TestAuthStabilityUnderChurn:
    """21.6 — Sustained load with periodic token refresh.

    Validates:
        - No 401 spikes during sustained authenticated requests
        - Token refresh success rate > 99%
        - Overall auth endpoint error rate stays below target
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_sustained_auth_stability(
        self,
        nexus_base_url: str,
        admin_credentials: tuple[str, str],
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Sustained load with token refresh every 15s; no 401 spikes."""
        username, password = admin_credentials
        results = _run_stability_loop(nexus_base_url, username, password)

        total_requests = len(results.request_statuses)
        assert total_requests > 0, "No requests completed during stability test"

        total_401s = sum(1 for s in results.request_statuses if s == 401)
        total_errors = sum(1 for s in results.request_statuses if s >= 400 or s == 0)
        error_rate = total_errors / total_requests

        total_refreshes = len(results.refresh_results)
        successful_refreshes = sum(1 for _, s in results.refresh_results if s == 200)
        refresh_success_rate = successful_refreshes / total_refreshes if total_refreshes > 0 else 1.0

        records = poll_for_metric_records(nexus_api.internal_metrics, "request_duration_ms")
        server_record_count = records.get("total", 0)

        diag = (
            f"total_requests={total_requests}, total_401s={total_401s}, "
            f"error_rate={error_rate:.2%}, "
            f"refreshes={total_refreshes}, refresh_success_rate={refresh_success_rate:.1%}, "
            f"server_records={server_record_count}"
        )

        assert refresh_success_rate > (1 - TARGET_AUTH_STABILITY_ERROR_RATE), (
            f"Refresh success rate {refresh_success_rate:.1%} is below "
            f"target {(1 - TARGET_AUTH_STABILITY_ERROR_RATE):.0%} ({diag})"
        )

        assert error_rate < TARGET_AUTH_STABILITY_ERROR_RATE, (
            f"Auth error rate {error_rate:.2%} exceeds target {TARGET_AUTH_STABILITY_ERROR_RATE:.0%} ({diag})"
        )

        max_401_in_window = max(results.auth_failures_per_window) if results.auth_failures_per_window else 0
        window_size = REFRESH_INTERVAL_SECONDS * REQUESTS_PER_SECOND
        max_401_rate = max_401_in_window / window_size if window_size > 0 else 0
        assert max_401_rate < 0.05, (
            f"401 spike detected: {max_401_in_window} failures in a single "
            f"refresh window ({max_401_rate:.1%} of {window_size} requests). "
            f"Token rotation should be seamless. ({diag})"
        )
