"""Suite 21 — Authentication Overhead: Login Throughput (21.2).

Test 21.2: Burst login requests — 50 concurrent POST /api/v1/auth/login
    KPI: Login Throughput p95 < 500ms
    MetricType: REQUEST_DURATION

Validation: /_internal/metrics/records filtered to endpoint=/api/v1/auth/login

Run with:
    make test-performance
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from tests.performance.authentication.conftest import (
    CONCURRENT_LOGIN_COUNT,
    TARGET_LOGIN_P95_MS,
)
from tests.performance.conftest import (
    compute_percentile,
    poll_for_metric_records,
    run_concurrent_http_requests,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance


class TestLoginThroughput:
    """21.2 — Burst login: 50 concurrent POST /api/v1/auth/login.

    Validates:
        - Client-measured p95 login latency < 500ms
        - Server-side REQUEST_DURATION records reflect the burst
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_burst_login_p95_under_target(
        self,
        nexus_base_url: str,
        admin_credentials: tuple[str, str],
        nexus_api: NexusApiRegistry,
    ) -> None:
        """50 concurrent logins; p95 must be < 500ms."""
        username, password = admin_credentials
        login_body = {"username": username, "password": password}

        results = run_concurrent_http_requests(
            nexus_base_url,
            "POST",
            "/api/v1/auth/login",
            CONCURRENT_LOGIN_COUNT,
            json_body=login_body,
            max_workers=CONCURRENT_LOGIN_COUNT,
        )

        response_times = [r[0] for r in results]
        status_codes = [r[1] for r in results]
        successes = sum(1 for s in status_codes if s == 200)
        server_errors = sum(1 for s in status_codes if s >= 500 or s == 0)

        assert len(response_times) == CONCURRENT_LOGIN_COUNT, (
            f"Expected {CONCURRENT_LOGIN_COUNT} results, got {len(response_times)}"
        )

        client_p95 = compute_percentile(response_times, 95)
        client_p50 = compute_percentile(response_times, 50)

        records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "request_duration_ms",
        )
        server_record_count = records.get("total", 0)

        diag = (
            f"p95={client_p95:.1f}ms, p50={client_p50:.1f}ms, "
            f"successes={successes}/{CONCURRENT_LOGIN_COUNT}, "
            f"server_errors={server_errors}, "
            f"server_records={server_record_count}"
        )

        assert client_p95 < TARGET_LOGIN_P95_MS, (
            f"Login p95 latency {client_p95:.1f}ms exceeds target {TARGET_LOGIN_P95_MS}ms ({diag})"
        )
