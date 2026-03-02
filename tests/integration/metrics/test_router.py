"""Integration tests for the metrics REST API router.

Uses a lightweight FastAPI TestClient with an isolated MetricsRecorder so
these tests do not require a running database or external services.
"""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from prometheus_client import CollectorRegistry

from nexus.metrics.dependencies import get_metrics_recorder
from nexus.metrics.recorder import MetricsRecorder
from nexus.metrics.router import router
from nexus.metrics.types import MetricType


@pytest.fixture
def recorder() -> MetricsRecorder:
    """Create an isolated MetricsRecorder for each test."""
    return MetricsRecorder(
        retention_seconds=3600,
        max_records=10_000,
        prometheus_registry=CollectorRegistry(),
    )


@pytest.fixture
def client(recorder: MetricsRecorder) -> TestClient:
    """Build a TestClient with the metrics router wired to the test recorder."""
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_metrics_recorder] = lambda: recorder
    return TestClient(app)


def _seed_metrics(recorder: MetricsRecorder, count: int = 5) -> None:
    """Populate the recorder with a set of mixed metrics."""
    for i in range(count):
        recorder.record(
            MetricType.LLM_DURATION,
            value=100.0 + i,
            unit="ms",
            labels={"model": "gpt-4"},
        )
    for _i in range(count):
        recorder.record(
            MetricType.CACHE_HIT,
            value=1.0,
            labels={"cache_type": "semantic"},
        )


# =============================================================================
# GET /api/v1/metrics
# =============================================================================


class TestQueryMetrics:
    """Tests for the list metrics endpoint."""

    def test_empty_store(self, client: TestClient) -> None:
        """An empty recorder returns an empty resources array."""
        resp = client.get("/api/v1/metrics")
        assert resp.status_code == 200
        body = resp.json()
        assert body["resources"] == []
        assert body["next"] is None
        assert body["prev"] is None

    def test_returns_all_metrics(self, client: TestClient, recorder: MetricsRecorder) -> None:
        """Without filters, all metrics are returned."""
        _seed_metrics(recorder, count=3)
        resp = client.get("/api/v1/metrics")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["resources"]) == 6

    def test_filter_by_category(self, client: TestClient, recorder: MetricsRecorder) -> None:
        """Filtering by category=llm returns only LLM metrics."""
        _seed_metrics(recorder, count=3)
        resp = client.get("/api/v1/metrics", params={"category": "llm"})
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["resources"]) == 3
        assert all(r["metric_type"].startswith("llm_") for r in body["resources"])

    def test_filter_by_category_cache(self, client: TestClient, recorder: MetricsRecorder) -> None:
        """Filtering by category=cache returns only cache metrics."""
        _seed_metrics(recorder, count=2)
        resp = client.get("/api/v1/metrics", params={"category": "cache"})
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["resources"]) == 2

    def test_filter_by_time_range(self, client: TestClient, recorder: MetricsRecorder) -> None:
        """Only metrics within the time window are returned."""
        recorder.record(MetricType.LLM_DURATION, value=1.0)
        old_record = next(iter(recorder.query()))
        old_record.created_at = datetime.now(UTC) - timedelta(hours=2)

        recorder.record(MetricType.LLM_DURATION, value=2.0)

        start = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
        resp = client.get("/api/v1/metrics", params={"start_time": start})
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["resources"]) == 1
        assert body["resources"][0]["value"] == pytest.approx(2.0)

    def test_pagination_forward(self, client: TestClient, recorder: MetricsRecorder) -> None:
        """Forward pagination returns correct items on each page."""
        for i in range(5):
            recorder.record(MetricType.LLM_DURATION, value=float(i))

        # Default sort is descending by created_at, so newest first: 4,3,2,1,0
        resp1 = client.get("/api/v1/metrics", params={"limit": 2})
        assert resp1.status_code == 200
        body1 = resp1.json()
        assert len(body1["resources"]) == 2
        page1_values = [r["value"] for r in body1["resources"]]
        assert page1_values == [pytest.approx(4.0), pytest.approx(3.0)]
        assert body1["next"] is not None
        assert body1["prev"] is None

        resp2 = client.get("/api/v1/metrics", params={"limit": 2, "cursor": body1["next"]})
        assert resp2.status_code == 200
        body2 = resp2.json()
        assert len(body2["resources"]) == 2
        page2_values = [r["value"] for r in body2["resources"]]
        assert page2_values == [pytest.approx(2.0), pytest.approx(1.0)]
        assert body2["next"] is not None
        assert body2["prev"] is not None

        resp3 = client.get("/api/v1/metrics", params={"limit": 2, "cursor": body2["next"]})
        assert resp3.status_code == 200
        body3 = resp3.json()
        assert len(body3["resources"]) == 1
        assert body3["resources"][0]["value"] == pytest.approx(0.0)
        assert body3["next"] is None
        assert body3["prev"] is not None

    def test_pagination_backward(self, client: TestClient, recorder: MetricsRecorder) -> None:
        """Using the prev cursor returns the correct previous page."""
        for i in range(5):
            recorder.record(MetricType.LLM_DURATION, value=float(i))

        # Page forward twice (descending: 4,3,2,1,0)
        resp1 = client.get("/api/v1/metrics", params={"limit": 2})
        body1 = resp1.json()

        resp2 = client.get("/api/v1/metrics", params={"limit": 2, "cursor": body1["next"]})
        body2 = resp2.json()
        page2_values = [r["value"] for r in body2["resources"]]
        assert page2_values == [pytest.approx(2.0), pytest.approx(1.0)]

        # Now page backward from page 2 using prev cursor
        resp_prev = client.get("/api/v1/metrics", params={"limit": 2, "cursor": body2["prev"]})
        assert resp_prev.status_code == 200
        body_prev = resp_prev.json()
        prev_values = [r["value"] for r in body_prev["resources"]]
        assert prev_values == [pytest.approx(4.0), pytest.approx(3.0)]
        assert body_prev["prev"] is None

    def test_pagination_ascending_forward_and_backward(self, client: TestClient, recorder: MetricsRecorder) -> None:
        """Forward and backward pagination with ascending sort."""
        for i in range(5):
            recorder.record(MetricType.LLM_DURATION, value=float(i))

        # Ascending sort: 0,1,2,3,4
        resp1 = client.get("/api/v1/metrics", params={"limit": 2, "sort": "created_at"})
        assert resp1.status_code == 200
        body1 = resp1.json()
        page1_values = [r["value"] for r in body1["resources"]]
        assert page1_values == [pytest.approx(0.0), pytest.approx(1.0)]
        assert body1["next"] is not None

        resp2 = client.get("/api/v1/metrics", params={"limit": 2, "sort": "created_at", "cursor": body1["next"]})
        assert resp2.status_code == 200
        body2 = resp2.json()
        page2_values = [r["value"] for r in body2["resources"]]
        assert page2_values == [pytest.approx(2.0), pytest.approx(3.0)]
        assert body2["prev"] is not None

        # Go backward from page 2
        resp_prev = client.get(
            "/api/v1/metrics",
            params={"limit": 2, "sort": "created_at", "cursor": body2["prev"]},
        )
        assert resp_prev.status_code == 200
        body_prev = resp_prev.json()
        prev_values = [r["value"] for r in body_prev["resources"]]
        assert prev_values == [pytest.approx(0.0), pytest.approx(1.0)]

    def test_include_total(self, client: TestClient, recorder: MetricsRecorder) -> None:
        """include_total=true returns the total count."""
        _seed_metrics(recorder, count=3)
        resp = client.get("/api/v1/metrics", params={"include_total": "true", "limit": 2})
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 6

    def test_sort_ascending(self, client: TestClient, recorder: MetricsRecorder) -> None:
        """sort=created_at returns oldest first."""
        for i in range(3):
            recorder.record(MetricType.LLM_DURATION, value=float(i))

        resp = client.get("/api/v1/metrics", params={"sort": "created_at"})
        assert resp.status_code == 200
        body = resp.json()
        values = [r["value"] for r in body["resources"]]
        assert values == [pytest.approx(0.0), pytest.approx(1.0), pytest.approx(2.0)]

    def test_sort_descending(self, client: TestClient, recorder: MetricsRecorder) -> None:
        """sort=-created_at returns newest first (default)."""
        for i in range(3):
            recorder.record(MetricType.LLM_DURATION, value=float(i))

        resp = client.get("/api/v1/metrics", params={"sort": "-created_at"})
        assert resp.status_code == 200
        body = resp.json()
        values = [r["value"] for r in body["resources"]]
        assert values == [pytest.approx(2.0), pytest.approx(1.0), pytest.approx(0.0)]


# =============================================================================
# GET /api/v1/metrics/summary
# =============================================================================


class TestMetricsSummary:
    """Tests for the summary endpoint."""

    def test_empty_summary(self, client: TestClient) -> None:
        """A fresh recorder returns zero-valued summary."""
        resp = client.get("/api/v1/metrics/summary")
        assert resp.status_code == 200
        body = resp.json()
        assert body["total_requests"] == 0
        assert body["total_errors"] == 0
        assert "period_start" in body
        assert "period_end" in body

    def test_summary_with_data(self, client: TestClient, recorder: MetricsRecorder) -> None:
        """Summary reflects incremented counters."""
        recorder.increment("requests", 42)
        recorder.increment("errors", 3)
        recorder.increment("cache_hits", 10)
        recorder.increment("cache_misses", 5)
        recorder.increment("llm_calls", 20)
        recorder.increment("total_workflows", 7)

        resp = client.get("/api/v1/metrics/summary")
        assert resp.status_code == 200
        body = resp.json()
        assert body["total_requests"] == 42
        assert body["total_errors"] == 3
        assert body["cache_hits"] == 10
        assert body["cache_misses"] == 5
        assert body["llm_calls"] == 20
        assert body["total_workflows"] == 7


# =============================================================================
# GET /api/v1/metrics/openmetrics
# =============================================================================


class TestOpenMetricsEndpoint:
    """Tests for the OpenMetrics scrape endpoint."""

    def test_returns_text_plain(self, client: TestClient) -> None:
        """OpenMetrics endpoint returns text/plain content type."""
        resp = client.get("/api/v1/metrics/openmetrics")
        assert resp.status_code == 200
        assert "text/plain" in resp.headers["content-type"]

    def test_contains_metric_names(self, client: TestClient, recorder: MetricsRecorder) -> None:
        """OpenMetrics output includes expected metric families."""
        recorder.record(MetricType.LLM_DURATION, 100.0, labels={"model": "gpt-4"})
        recorder.record(MetricType.CACHE_HIT, 1.0)

        resp = client.get("/api/v1/metrics/openmetrics")
        content = resp.text
        assert "nexus_llm_duration_seconds" in content
        assert "nexus_cache_hits_total" in content

    def test_counter_values_appear(self, client: TestClient, recorder: MetricsRecorder) -> None:
        """OpenMetrics output reflects recorded counter values."""
        recorder.record(MetricType.CACHE_HIT, 1.0)
        recorder.record(MetricType.CACHE_HIT, 1.0)
        recorder.record(MetricType.CACHE_HIT, 1.0)

        resp = client.get("/api/v1/metrics/openmetrics")
        content = resp.text
        assert "nexus_cache_hits_total 3.0" in content


# =============================================================================
# Router discovery compatibility
# =============================================================================


class TestRouterDiscovery:
    """Verify the router follows discovery conventions."""

    def test_router_has_prefix(self) -> None:
        """Router has the expected /metrics prefix."""
        assert router.prefix == "/metrics"

    def test_router_has_tags(self) -> None:
        """Router has the 'metrics' tag."""
        assert "metrics" in router.tags
