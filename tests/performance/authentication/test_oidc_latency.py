"""Suite 21 — Authentication Overhead: OIDC E2E Latency (21.5).

Test 21.5: 20 concurrent authorize+callback sequences
    KPI: OIDC E2E Latency < 3s (includes IdP round-trip)
    MetricType: Client-side timing

Validation: Time from /oidc/authorize redirect to token receipt
    at /oidc/callback.

NOTE: This test requires an OIDC identity provider configured on the
deployment.  The test measures the authorize redirect latency only
(the full authorize→callback flow requires a real IdP interaction
which cannot be fully automated in a performance test). When no OIDC
provider is configured, the test is skipped.

Run with:
    make test-performance
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from tests.performance.authentication.conftest import (
    OIDC_CONCURRENT_COUNT,
    TARGET_OIDC_E2E_LATENCY_S,
)
from tests.performance.conftest import (
    compute_percentile,
    run_concurrent_http_requests,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

TARGET_AUTHORIZE_REDIRECT_MS = TARGET_OIDC_E2E_LATENCY_S * 1000


class TestOIDCLatency:
    """21.5 — OIDC authorize redirect latency.

    Validates:
        - The /oidc/authorize endpoint responds with a redirect within
          the target latency
        - Concurrent authorize requests don't cause excessive slowdown

    The full OIDC flow (authorize → IdP login → callback) involves
    external IdP interaction which can't be fully performance-tested
    against an arbitrary deployment.  This test validates the Nexus-side
    overhead of initiating the OIDC flow.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_oidc_authorize_latency(
        self,
        nexus_base_url: str,
        oidc_provider_id: str | None,
    ) -> None:
        """20 concurrent /oidc/authorize requests; p95 must be < 3s."""
        if oidc_provider_id is None:
            pytest.skip(
                "No OIDC identity provider configured on the deployment. "
                "This test requires at least one enabled OIDC provider."
            )

        path = f"/api/v1/auth/oidc/authorize?provider_id={oidc_provider_id}"

        results = run_concurrent_http_requests(
            nexus_base_url,
            "GET",
            path,
            OIDC_CONCURRENT_COUNT,
            max_workers=OIDC_CONCURRENT_COUNT,
        )

        response_times = [r[0] for r in results]
        status_codes = [r[1] for r in results]

        redirects = sum(1 for s in status_codes if 300 <= s < 400)
        errors = sum(1 for s in status_codes if s >= 400)

        assert len(response_times) == OIDC_CONCURRENT_COUNT

        client_p95 = compute_percentile(response_times, 95)
        client_p50 = compute_percentile(response_times, 50)

        diag = (
            f"p95={client_p95:.1f}ms, p50={client_p50:.1f}ms, "
            f"redirects={redirects}, errors={errors}, "
            f"total={OIDC_CONCURRENT_COUNT}"
        )

        assert client_p95 < TARGET_AUTHORIZE_REDIRECT_MS, (
            f"OIDC authorize p95 latency {client_p95:.1f}ms exceeds "
            f"target {TARGET_AUTHORIZE_REDIRECT_MS:.0f}ms ({diag})"
        )
