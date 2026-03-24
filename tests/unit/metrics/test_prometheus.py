"""Unit tests for Prometheus metric definitions."""

import pytest
from prometheus_client import CollectorRegistry, generate_latest

from nexus.metrics.prometheus import (
    LATENCY_BUCKETS_FAST,
    LATENCY_BUCKETS_MEDIUM,
    LATENCY_BUCKETS_SLOW,
    NexusPrometheusMetrics,
)


@pytest.fixture
def prom() -> NexusPrometheusMetrics:
    """Fresh NexusPrometheusMetrics with an isolated registry."""
    return NexusPrometheusMetrics(registry=CollectorRegistry())


# =============================================================================
# Metric existence
# =============================================================================


class TestMetricDefinitions:
    """Verify all expected metrics are defined."""

    def test_counters_defined(self, prom: NexusPrometheusMetrics) -> None:
        """All required counters are present."""
        assert prom.requests_total is not None
        assert prom.errors_total is not None
        assert prom.cache_hits_total is not None
        assert prom.cache_misses_total is not None
        assert prom.llm_calls_total is not None
        assert prom.workflows_total is not None
        assert prom.tool_executions_total is not None

    def test_histograms_defined(self, prom: NexusPrometheusMetrics) -> None:
        """All required histograms are present."""
        assert prom.request_duration_seconds is not None
        assert prom.llm_duration_seconds is not None
        assert prom.ttft_seconds is not None
        assert prom.cache_lookup_duration_seconds is not None
        assert prom.workflow_duration_seconds is not None
        assert prom.api_response_time_seconds is not None
        assert prom.workflow_serialization_duration_seconds is not None
        assert prom.workflow_validation_duration_seconds is not None
        assert prom.workflow_start_latency_seconds is not None
        assert prom.tool_execution_duration_seconds is not None
        assert prom.database_query_response_time_seconds is not None
        assert prom.system_e2e_latency_seconds is not None

    def test_gauges_defined(self, prom: NexusPrometheusMetrics) -> None:
        """All required gauges are present."""
        assert prom.cache_utilization_ratio is not None
        assert prom.active_workflows is not None
        assert prom.active_llm_requests is not None
        assert prom.api_error_rate is not None
        assert prom.api_throughput_rps is not None
        assert prom.workflow_creation_success_rate is not None
        assert prom.workflow_completion_rate is not None
        assert prom.temporal_queue_depth is not None
        assert prom.activity_execution_success_rate is not None
        assert prom.tool_execution_success_rate is not None
        assert prom.tool_provider_availability is not None
        assert prom.tool_error_rate is not None
        assert prom.database_connection_pool_utilization is not None
        assert prom.database_transaction_rate_tps is not None
        assert prom.system_uptime is not None
        assert prom.system_error_rate is not None


# =============================================================================
# Metric operations
# =============================================================================


class TestMetricOperations:
    """Verify metrics can be mutated."""

    def test_counter_increment(self, prom: NexusPrometheusMetrics) -> None:
        """Counters can be incremented."""
        prom.requests_total.labels(status="success", endpoint="/api").inc()
        prom.requests_total.labels(status="success", endpoint="/api").inc()
        value = prom.requests_total.labels(status="success", endpoint="/api")._value.get()
        assert value == pytest.approx(2.0)

    def test_histogram_observe(self, prom: NexusPrometheusMetrics) -> None:
        """Histograms accept observed values."""
        prom.llm_duration_seconds.labels(model="gpt-4").observe(0.5)
        prom.llm_duration_seconds.labels(model="gpt-4").observe(1.0)
        total = prom.llm_duration_seconds.labels(model="gpt-4")._sum.get()
        assert total == pytest.approx(1.5)

    def test_gauge_set(self, prom: NexusPrometheusMetrics) -> None:
        """Gauges can be set to a value."""
        prom.active_workflows.set(5)
        assert prom.active_workflows._value.get() == pytest.approx(5.0)

    def test_gauge_inc_dec(self, prom: NexusPrometheusMetrics) -> None:
        """Gauges can be incremented and decremented."""
        prom.active_workflows.inc()
        prom.active_workflows.inc()
        prom.active_workflows.dec()
        assert prom.active_workflows._value.get() == pytest.approx(1.0)


# =============================================================================
# Output format
# =============================================================================


class TestPrometheusOutput:
    """Verify Prometheus text format generation."""

    def test_generate_metrics_output(self, prom: NexusPrometheusMetrics) -> None:
        """generate_latest produces valid Prometheus text format."""
        prom.requests_total.labels(status="success", endpoint="/api").inc(10)
        prom.cache_hits_total.inc(5)
        prom.active_workflows.set(3)

        output = generate_latest(prom.registry).decode("utf-8")

        assert "nexus_requests_total" in output
        assert "nexus_cache_hits_total" in output
        assert "nexus_active_workflows" in output
        assert "# HELP" in output
        assert "# TYPE" in output

    def test_isolated_registry(self) -> None:
        """Each NexusPrometheusMetrics instance uses its own registry."""
        prom1 = NexusPrometheusMetrics(registry=CollectorRegistry())
        prom2 = NexusPrometheusMetrics(registry=CollectorRegistry())

        prom1.cache_hits_total.inc(100)
        assert prom2.cache_hits_total._value.get() == pytest.approx(0.0)


# =============================================================================
# Bucket constants
# =============================================================================


class TestBucketConstants:
    """Verify histogram bucket boundaries are sensible."""

    def test_fast_buckets_sorted(self) -> None:
        """Fast buckets are in ascending order."""
        assert list(LATENCY_BUCKETS_FAST) == sorted(LATENCY_BUCKETS_FAST)

    def test_medium_buckets_sorted(self) -> None:
        """Medium buckets are in ascending order."""
        assert list(LATENCY_BUCKETS_MEDIUM) == sorted(LATENCY_BUCKETS_MEDIUM)

    def test_slow_buckets_sorted(self) -> None:
        """Slow buckets are in ascending order."""
        assert list(LATENCY_BUCKETS_SLOW) == sorted(LATENCY_BUCKETS_SLOW)
