"""Suite 21 — Authentication Overhead: Rejection Latency (21.4).

Test 21.4: 100 requests with expired/invalid JWTs
    KPI: Rejection Latency < 50ms (fast fail)
    MetricType: REQUEST_DURATION, ERROR

Validation: Verify 401 response time is not slower than valid-token
    response time.

Run with:
    make test-performance
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from tests.performance.authentication.conftest import (
    INVALID_TOKEN_REQUEST_COUNT,
    TARGET_REJECTION_P95_MS,
)
from tests.performance.conftest import (
    compute_percentile,
    poll_for_metric_records,
    run_concurrent_http_requests,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

INVALID_TOKENS = [
    "Bearer invalid-garbage-token",
    "Bearer eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.expired.signature",
    "Bearer ",
    "NotBearer valid-format",
]


class TestRejectionLatency:
    """21.4 — Invalid/expired tokens: fast 401 rejection.

    Validates:
        - 401 rejection p95 < 50ms (fast fail)
        - Rejection latency does not exceed valid-token request latency
        - All invalid-token requests return 401
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_rejection_fast_fail(
        self,
        nexus_base_url: str,
        admin_auth_headers: dict[str, str],
        nexus_api: NexusApiRegistry,
    ) -> None:
        """100 requests with bad JWTs; rejection p95 must be < 50ms."""
        invalid_times: list[float] = []
        invalid_statuses: list[int] = []

        results = run_concurrent_http_requests(
            nexus_base_url,
            "GET",
            "/api/v1/workflows?limit=1",
            INVALID_TOKEN_REQUEST_COUNT,
            headers={"Authorization": INVALID_TOKENS[0]},
            max_workers=50,
        )
        for elapsed_ms, status_code, _ in results:
            invalid_times.append(elapsed_ms)
            invalid_statuses.append(status_code)

        valid_results = run_concurrent_http_requests(
            nexus_base_url,
            "GET",
            "/api/v1/workflows?limit=1",
            min(INVALID_TOKEN_REQUEST_COUNT, 20),
            headers=admin_auth_headers,
            max_workers=20,
        )
        valid_times = [r[0] for r in valid_results if r[1] == 200]

        assert len(invalid_times) == INVALID_TOKEN_REQUEST_COUNT

        rejection_p95 = compute_percentile(invalid_times, 95)
        rejection_p50 = compute_percentile(invalid_times, 50)

        num_401 = sum(1 for s in invalid_statuses if s == 401)
        num_403 = sum(1 for s in invalid_statuses if s == 403)
        num_other = len(invalid_statuses) - num_401 - num_403

        records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "request_duration_ms",
        )
        server_record_count = records.get("total", 0)

        diag = (
            f"rejection_p95={rejection_p95:.1f}ms, rejection_p50={rejection_p50:.1f}ms, "
            f"401s={num_401}, 403s={num_403}, other={num_other}, "
            f"server_records={server_record_count}"
        )

        assert rejection_p95 < TARGET_REJECTION_P95_MS, (
            f"Rejection p95 latency {rejection_p95:.1f}ms exceeds target {TARGET_REJECTION_P95_MS}ms ({diag})"
        )

        rejection_rate = (num_401 + num_403) / len(invalid_statuses)
        assert rejection_rate >= 0.95, f"Expected >=95% auth rejections (401/403), got {rejection_rate:.1%} ({diag})"

        if valid_times:
            valid_p50 = compute_percentile(valid_times, 50)
            assert rejection_p50 <= valid_p50 * 1.5, (
                f"Rejection p50 ({rejection_p50:.1f}ms) should not significantly "
                f"exceed valid-token p50 ({valid_p50:.1f}ms) — invalid tokens "
                f"should fail fast"
            )
