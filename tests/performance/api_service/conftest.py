"""Shared fixtures for Suite 1: API Service performance tests.

These tests run against a live Nexus deployment (typically OpenShift) and
validate the API Service KPIs from the Nexus Performance Test Plan.

The core live-deployment fixtures (nexus_base_url, auth_headers,
nexus_client, nexus_api) are defined in the root tests/conftest.py and
inherited automatically.  This file adds performance-specific helpers
and fixtures.

Prerequisites:
    - APP_BASE_URL pointing to the Nexus deployment
    - metrics.perf_test_mode enabled on the target instance
    - Valid admin credentials (APP_ADMIN_PASSWORD_PATH or .secrets/admin-password)

Run with:
    make test-performance
"""

from __future__ import annotations

import time
from typing import Any

import httpx
import pytest

# The /_internal/metrics endpoints are not part of the public OpenAPI spec
# and therefore not available in the auto-generated client.  We use raw
# httpx helpers here until OpenAPI specs are added for these endpoints.
INTERNAL_METRICS_PREFIX = "/_internal/metrics"


# ---------------------------------------------------------------------------
# Internal Metrics Helpers (raw httpx — not in generated client)
# ---------------------------------------------------------------------------


def metrics_get(
    nexus_base_url: str,
    path: str,
    auth_headers: dict[str, str],
    *,
    params: dict[str, Any] | None = None,
    timeout: int = 30,
) -> dict[str, Any]:
    """Authenticated GET against the internal metrics API."""
    r = httpx.get(
        f"{nexus_base_url}{INTERNAL_METRICS_PREFIX}{path}",
        headers=auth_headers,
        params=params,
        timeout=timeout,
        verify=False,  # noqa: S501
    )
    r.raise_for_status()
    return r.json()  # type: ignore[no-any-return]


def metrics_post(
    nexus_base_url: str,
    path: str,
    auth_headers: dict[str, str],
    *,
    timeout: int = 30,
) -> dict[str, Any]:
    """Authenticated POST against the internal metrics API."""
    r = httpx.post(
        f"{nexus_base_url}{INTERNAL_METRICS_PREFIX}{path}",
        headers=auth_headers,
        timeout=timeout,
        verify=False,  # noqa: S501
    )
    r.raise_for_status()
    return r.json()  # type: ignore[no-any-return]


def compute_percentile(values: list[float], percentile: float) -> float:
    """Compute a percentile from a sorted list of values.

    Uses linear interpolation matching the internal metrics API.
    """
    if not 0 <= percentile <= 100:
        msg = f"percentile must be between 0 and 100, got {percentile}"
        raise ValueError(msg)
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    n = len(sorted_vals)
    k = (n - 1) * (percentile / 100)
    f = int(k)
    c = f + 1
    if c >= n:
        return sorted_vals[-1]
    return sorted_vals[f] + (k - f) * (sorted_vals[c] - sorted_vals[f])


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def perf_test_mode_enabled(
    nexus_base_url: str,
    auth_headers: dict[str, str],
) -> None:
    """Verify that metrics.perf_test_mode is enabled on the target instance.

    If the internal metrics summary endpoint returns 404, perf_test_mode is
    disabled and we skip the entire module.
    """
    try:
        r = httpx.get(
            f"{nexus_base_url}{INTERNAL_METRICS_PREFIX}/summary",
            headers=auth_headers,
            timeout=10,
            verify=False,  # noqa: S501
        )
    except httpx.RequestError as exc:
        pytest.skip(f"Cannot reach metrics endpoint: {exc}")

    if r.status_code == 404:
        pytest.skip(
            "metrics.perf_test_mode is disabled on the target instance. "
            "Enable it via the settings API before running performance tests."
        )


@pytest.fixture(scope="module")
def reset_metrics_store(
    nexus_base_url: str,
    auth_headers: dict[str, str],
    perf_test_mode_enabled: None,
) -> None:
    """Reset the in-memory metrics store before the test module runs."""
    metrics_post(nexus_base_url, "/reset", auth_headers)
    time.sleep(0.5)


@pytest.fixture(scope="module")
def api_service_kpis(
    nexus_base_url: str,
    auth_headers: dict[str, str],
    perf_test_mode_enabled: None,
) -> dict[str, Any]:
    """Fetch the api_service component KPIs from the internal metrics API."""
    return metrics_get(nexus_base_url, "/kpis/api_service", auth_headers)


def fetch_api_service_kpis(
    nexus_base_url: str,
    auth_headers: dict[str, str],
) -> dict[str, Any]:
    """Callable helper to fetch api_service KPIs (for use after load generation)."""
    return metrics_get(nexus_base_url, "/kpis/api_service", auth_headers)


def fetch_metrics_records(
    nexus_base_url: str,
    auth_headers: dict[str, str],
    *,
    metric_type: str | None = None,
    labels: str | None = None,
    limit: int = 10000,
) -> dict[str, Any]:
    """Fetch raw metric records with optional filters."""
    params: dict[str, Any] = {"limit": limit}
    if metric_type:
        params["metric_type"] = metric_type
    if labels:
        params["labels"] = labels
    return metrics_get(nexus_base_url, "/records", auth_headers, params=params)
