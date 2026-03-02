"""Unit tests for the MetricsRecorder high-level recording API."""

import time
from datetime import UTC, datetime, timedelta

import pytest
from prometheus_client import CollectorRegistry

from nexus.metrics.recorder import MetricsRecorder
from nexus.metrics.types import MetricType


@pytest.fixture
def recorder() -> MetricsRecorder:
    """Fresh MetricsRecorder with an isolated Prometheus registry."""
    return MetricsRecorder(
        retention_seconds=3600,
        max_records=10_000,
        prometheus_registry=CollectorRegistry(),
    )


@pytest.fixture
def disabled_recorder() -> MetricsRecorder:
    """MetricsRecorder with collection disabled."""
    return MetricsRecorder(
        prometheus_registry=CollectorRegistry(),
        enabled=False,
    )


# =============================================================================
# Basic recording
# =============================================================================


class TestRecorderRecord:
    """Tests for the record() method."""

    def test_record_stores_metric(self, recorder: MetricsRecorder) -> None:
        """A recorded metric appears in the store."""
        recorder.record(MetricType.LLM_DURATION, 245.5, unit="ms", labels={"model": "gpt-4"})
        results = list(recorder.query(metric_types={MetricType.LLM_DURATION}))
        assert len(results) == 1
        assert results[0].value == pytest.approx(245.5)
        assert results[0].labels["model"] == "gpt-4"

    def test_record_multiple(self, recorder: MetricsRecorder) -> None:
        """Multiple records are stored independently."""
        recorder.record(MetricType.LLM_DURATION, 100.0)
        recorder.record(MetricType.LLM_TOKENS_INPUT, 1500, unit="tokens")
        recorder.record(MetricType.LLM_TOKENS_OUTPUT, 350, unit="tokens")

        all_results = list(recorder.query())
        assert len(all_results) == 3

    def test_record_disabled_is_noop(self, disabled_recorder: MetricsRecorder) -> None:
        """When disabled, record() silently does nothing."""
        disabled_recorder.record(MetricType.LLM_DURATION, 100.0)
        assert disabled_recorder.store.count() == 0


# =============================================================================
# Increment counters
# =============================================================================


class TestRecorderIncrement:
    """Tests for the increment() method."""

    def test_increment_counter(self, recorder: MetricsRecorder) -> None:
        """Incrementing a counter is reflected in the summary."""
        recorder.increment("requests", 1)
        recorder.increment("requests", 1)
        summary = recorder.get_summary()
        assert summary.total_requests == 2

    def test_increment_by_custom_value(self, recorder: MetricsRecorder) -> None:
        """Counter can be incremented by values other than 1."""
        recorder.increment("errors", 5)
        summary = recorder.get_summary()
        assert summary.total_errors == 5

    def test_increment_disabled_is_noop(self, disabled_recorder: MetricsRecorder) -> None:
        """When disabled, increment() silently does nothing."""
        disabled_recorder.increment("requests", 10)
        summary = disabled_recorder.get_summary()
        assert summary.total_requests == 0


# =============================================================================
# Time context manager
# =============================================================================


class TestRecorderTime:
    """Tests for the time() context manager."""

    def test_time_records_duration(self, recorder: MetricsRecorder) -> None:
        """time() records elapsed time in milliseconds."""
        with recorder.time(MetricType.LLM_DURATION, labels={"model": "gpt-4"}):
            time.sleep(0.05)

        results = list(recorder.query(metric_types={MetricType.LLM_DURATION}))
        assert len(results) == 1
        assert results[0].value >= 40
        assert results[0].unit == "ms"

    def test_time_records_on_exception(self, recorder: MetricsRecorder) -> None:
        """Duration is still recorded when the body raises."""
        msg = "boom"
        with pytest.raises(ValueError, match=msg), recorder.time(MetricType.LLM_DURATION):
            raise ValueError(msg)

        results = list(recorder.query(metric_types={MetricType.LLM_DURATION}))
        assert len(results) == 1


# =============================================================================
# Query delegation
# =============================================================================


class TestRecorderQuery:
    """Tests for the query() passthrough."""

    def test_query_with_type_filter(self, recorder: MetricsRecorder) -> None:
        """query() delegates type filtering to the store."""
        recorder.record(MetricType.LLM_DURATION, 100.0)
        recorder.record(MetricType.CACHE_HIT, 1.0)

        results = list(recorder.query(metric_types={MetricType.CACHE_HIT}))
        assert len(results) == 1

    def test_query_with_label_filter(self, recorder: MetricsRecorder) -> None:
        """query() delegates label filtering to the store."""
        recorder.record(MetricType.LLM_DURATION, 100.0, labels={"model": "gpt-4"})
        recorder.record(MetricType.LLM_DURATION, 200.0, labels={"model": "claude"})

        results = list(recorder.query(labels={"model": "gpt-4"}))
        assert len(results) == 1
        assert results[0].value == pytest.approx(100.0)


# =============================================================================
# Summary
# =============================================================================


class TestRecorderSummary:
    """Tests for get_summary()."""

    def test_summary_defaults(self, recorder: MetricsRecorder) -> None:
        """A fresh recorder returns zero-valued summary."""
        summary = recorder.get_summary()
        assert summary.total_requests == 0
        assert summary.total_errors == 0
        assert summary.cache_hits == 0
        assert summary.cache_misses == 0
        assert summary.llm_calls == 0
        assert summary.total_workflows == 0

    def test_summary_reflects_increments(self, recorder: MetricsRecorder) -> None:
        """Summary counters reflect what was incremented."""
        recorder.increment("requests", 10)
        recorder.increment("errors", 2)
        recorder.increment("cache_hits", 7)
        recorder.increment("cache_misses", 3)
        recorder.increment("llm_calls", 8)
        recorder.increment("total_workflows", 15)
        recorder.increment("active_workflows", 2)

        summary = recorder.get_summary()
        assert summary.total_requests == 10
        assert summary.total_errors == 2
        assert summary.cache_hits == 7
        assert summary.cache_misses == 3
        assert summary.llm_calls == 8
        assert summary.total_workflows == 15
        assert summary.active_workflows == 2

    def test_summary_period(self, recorder: MetricsRecorder) -> None:
        """Summary period_start is retention seconds before period_end."""
        summary = recorder.get_summary()
        delta = summary.period_end - summary.period_start
        assert abs(delta.total_seconds() - 3600) < 2


# =============================================================================
# Cleanup
# =============================================================================


class TestRecorderCleanup:
    """Tests for cleanup() delegation."""

    def test_cleanup_removes_expired(self) -> None:
        """cleanup() evicts records outside the retention window."""
        recorder = MetricsRecorder(
            retention_seconds=60,
            prometheus_registry=CollectorRegistry(),
        )

        old = MetricType.LLM_DURATION
        recorder.record(old, 1.0)
        # Back-date the record so it's expired
        record = next(iter(recorder.query()))
        record.created_at = datetime.now(UTC) - timedelta(hours=1)

        removed = recorder.cleanup()
        assert removed == 1


# =============================================================================
# Prometheus integration
# =============================================================================


class TestRecorderPrometheus:
    """Tests that recording updates Prometheus metrics."""

    def test_llm_duration_updates_histogram(self, recorder: MetricsRecorder) -> None:
        """Recording LLM_DURATION updates the Prometheus histogram."""
        recorder.record(
            MetricType.LLM_DURATION,
            500.0,
            unit="ms",
            labels={"model": "gpt-4"},
        )
        sample_value = recorder.prometheus.llm_duration_seconds.labels(model="gpt-4")._sum.get()
        assert sample_value == pytest.approx(0.5, rel=0.01)

    def test_cache_hit_updates_counter(self, recorder: MetricsRecorder) -> None:
        """Recording CACHE_HIT increments the Prometheus counter."""
        recorder.record(MetricType.CACHE_HIT, 1.0)
        recorder.record(MetricType.CACHE_HIT, 1.0)
        sample_value = recorder.prometheus.cache_hits_total._value.get()
        assert sample_value == pytest.approx(2.0)

    def test_cache_miss_updates_counter(self, recorder: MetricsRecorder) -> None:
        """Recording CACHE_MISS increments the Prometheus counter."""
        recorder.record(MetricType.CACHE_MISS, 1.0)
        sample_value = recorder.prometheus.cache_misses_total._value.get()
        assert sample_value == pytest.approx(1.0)

    def test_error_updates_counter(self, recorder: MetricsRecorder) -> None:
        """Recording ERROR increments the Prometheus errors counter."""
        recorder.record(
            MetricType.ERROR,
            1.0,
            labels={"error_type": "timeout"},
        )
        sample_value = recorder.prometheus.errors_total.labels(error_type="timeout")._value.get()
        assert sample_value == pytest.approx(1.0)

    def test_request_duration_updates_histogram(self, recorder: MetricsRecorder) -> None:
        """Recording REQUEST_DURATION updates the Prometheus histogram."""
        recorder.record(
            MetricType.REQUEST_DURATION,
            250.0,
            unit="ms",
            labels={"endpoint": "/api/v1/chat"},
        )
        sample_value = recorder.prometheus.request_duration_seconds.labels(
            endpoint="/api/v1/chat",
        )._sum.get()
        assert sample_value == pytest.approx(0.25, rel=0.01)

    def test_workflow_duration_updates_counter(self, recorder: MetricsRecorder) -> None:
        """Recording WORKFLOW_DURATION also increments workflows_total counter."""
        recorder.record(
            MetricType.WORKFLOW_DURATION,
            5000.0,
            unit="ms",
            labels={"workflow_type": "deploy"},
        )
        recorder.record(
            MetricType.WORKFLOW_DURATION,
            3000.0,
            unit="ms",
            labels={"workflow_type": "deploy"},
        )
        sample_value = recorder.prometheus.workflows_total.labels(workflow_type="deploy")._value.get()
        assert sample_value == pytest.approx(2.0)

    def test_enabled_property(self, recorder: MetricsRecorder) -> None:
        """Enabled property reflects constructor argument."""
        assert recorder.enabled is True

    def test_disabled_property(self, disabled_recorder: MetricsRecorder) -> None:
        """Enabled property is False when recording is disabled."""
        assert disabled_recorder.enabled is False
