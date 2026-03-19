"""High-level metrics recording API for Nexus components.

:class:`MetricsRecorder` is the primary entry-point that application code
uses to record metrics.  It delegates storage to :class:`MetricsStore` and
keeps Prometheus counters / histograms in sync via
:class:`NexusPrometheusMetrics`.

Usage::

    recorder = MetricsRecorder()
    recorder.record(MetricType.LLM_DURATION, 245.5, unit="ms",
                    labels={"model": "gpt-4"})

    with recorder.time(MetricType.LLM_DURATION, labels={"model": "gpt-4"}):
        result = await call_llm(...)
"""

from __future__ import annotations

import logging
import threading
import time
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from nexus.metrics.prometheus import NexusPrometheusMetrics
from nexus.metrics.store import MetricsStore
from nexus.metrics.types import MetricRecord, MetricsSummary, MetricType

if TYPE_CHECKING:
    from collections.abc import Iterator

    from prometheus_client import CollectorRegistry

logger = logging.getLogger(__name__)


class MetricsRecorder:
    """Central metrics recording service.

    Thread-safe, non-blocking metrics recording with configurable retention.

    In distributed deployments each service instance owns its own recorder.
    Prometheus handles cross-instance aggregation at scrape time.

    Args:
        retention_seconds: How long to keep raw metrics (default 24 h).
        max_records: Upper bound on stored records.
        prometheus_registry: Optional Prometheus ``CollectorRegistry``.
            Pass *None* to create an isolated private registry (recommended
            for tests).
        enabled: When *False* all recording is silently skipped.

    """

    def __init__(
        self,
        retention_seconds: int = 86400,
        max_records: int = 1_000_000,
        prometheus_registry: CollectorRegistry | None = None,
        *,
        enabled: bool = True,
    ) -> None:
        """Initialise the recorder, its backing store, and Prometheus metrics."""
        self._enabled = enabled
        self._store = MetricsStore(
            retention_seconds=retention_seconds,
            max_records=max_records,
        )
        self._prometheus = NexusPrometheusMetrics(registry=prometheus_registry)
        self._counters: dict[str, int] = {}
        self._counters_lock = threading.Lock()

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def store(self) -> MetricsStore:
        """Underlying metrics store (useful for direct queries)."""
        return self._store

    @property
    def prometheus(self) -> NexusPrometheusMetrics:
        """Prometheus metric objects."""
        return self._prometheus

    @property
    def enabled(self) -> bool:
        """Whether recording is active."""
        return self._enabled

    # ------------------------------------------------------------------
    # Recording
    # ------------------------------------------------------------------

    def record(
        self,
        metric_type: MetricType,
        value: float,
        unit: str = "",
        labels: dict[str, str] | None = None,
    ) -> None:
        """Record a single metric (non-blocking).

        The record is appended to the in-memory store *and* the matching
        Prometheus metric is updated.
        """
        if not self._enabled:
            return

        record = MetricRecord(
            metric_type=metric_type,
            value=value,
            unit=unit,
            labels=labels or {},
        )
        self._store.add(record)
        self._update_prometheus(metric_type, value, labels or {})

    def increment(self, counter_name: str, value: int = 1) -> None:
        """Increment an internal named counter."""
        if not self._enabled:
            return
        with self._counters_lock:
            self._counters[counter_name] = self._counters.get(counter_name, 0) + value

    @contextmanager
    def time(
        self,
        metric_type: MetricType,
        labels: dict[str, str] | None = None,
    ) -> Iterator[None]:
        """Context manager that records the elapsed wall-clock time as a metric.

        Example::

            with recorder.time(MetricType.LLM_DURATION, labels={"model": "gpt-4"}):
                response = await llm.invoke(prompt)

        """
        start = time.perf_counter()
        try:
            yield
        finally:
            duration_ms = (time.perf_counter() - start) * 1000
            self.record(metric_type, duration_ms, unit="ms", labels=labels)

    # ------------------------------------------------------------------
    # Querying
    # ------------------------------------------------------------------

    def query(
        self,
        metric_types: set[MetricType] | None = None,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
        labels: dict[str, str] | None = None,
    ) -> Iterator[MetricRecord]:
        """Query metrics with optional filters.

        Delegates to :meth:`MetricsStore.query`.
        """
        return self._store.query(
            metric_types=metric_types,
            start_time=start_time,
            end_time=end_time,
            labels=labels,
        )

    def get_summary(self) -> MetricsSummary:
        """Build a point-in-time summary of internal counters."""
        now = datetime.now(UTC)
        with self._counters_lock:
            counters_snapshot = dict(self._counters)
        return MetricsSummary(
            total_requests=counters_snapshot.get("requests", 0),
            total_errors=counters_snapshot.get("errors", 0),
            cache_hits=counters_snapshot.get("cache_hits", 0),
            cache_misses=counters_snapshot.get("cache_misses", 0),
            llm_calls=counters_snapshot.get("llm_calls", 0),
            total_workflows=counters_snapshot.get("total_workflows", 0),
            active_workflows=counters_snapshot.get("active_workflows", 0),
            period_start=now - self._store.retention,
            period_end=now,
        )

    # ------------------------------------------------------------------
    # Maintenance
    # ------------------------------------------------------------------

    def cleanup(self) -> int:
        """Evict expired records from the store.

        Returns:
            Number of records removed.

        """
        return self._store.cleanup()

    # ------------------------------------------------------------------
    # Prometheus bridge
    # ------------------------------------------------------------------

    def _update_prometheus(
        self,
        metric_type: MetricType,
        value: float,
        labels: dict[str, str],
    ) -> None:
        """Map a MetricType recording to its Prometheus counterpart."""
        try:
            self._dispatch_prometheus(metric_type, value, labels)
        except Exception:  # noqa: BLE001
            logger.debug("Failed to update Prometheus metric for %s", metric_type, exc_info=True)

    def _dispatch_prometheus(
        self,
        metric_type: MetricType,
        value: float,
        labels: dict[str, str],
    ) -> None:
        """Dispatch metric to the appropriate Prometheus instrument."""
        p = self._prometheus

        if metric_type in {
            MetricType.REQUEST_DURATION,
            MetricType.LLM_DURATION,
            MetricType.LLM_TTFT,
        }:
            MetricsRecorder._dispatch_latency(metric_type, value, labels, p)

        elif metric_type in {
            MetricType.LLM_STATUS,
            MetricType.LLM_TOKENS_INPUT,
            MetricType.LLM_TOKENS_OUTPUT,
        }:
            MetricsRecorder._dispatch_llm_event(metric_type, value, labels, p)

        elif metric_type == MetricType.CACHE_HIT:
            p.cache_hits_total.inc()

        elif metric_type == MetricType.CACHE_MISS:
            p.cache_misses_total.inc()

        elif metric_type == MetricType.CACHE_LOOKUP_DURATION:
            p.cache_lookup_duration_seconds.observe(value / 1000)

        elif metric_type == MetricType.CACHE_UTILIZATION:
            p.cache_utilization_ratio.set(value)

        elif metric_type == MetricType.WORKFLOW_DURATION:
            p.workflow_duration_seconds.observe(value / 1000)
            p.workflows_total.labels(
                workflow_type=labels.get("workflow_type", "unknown"),
            ).inc()

        elif metric_type == MetricType.ACTIVITY_DURATION:
            p.activity_duration_seconds.observe(value / 1000)

        elif metric_type == MetricType.ERROR:
            p.errors_total.labels(
                error_type=labels.get("error_type", "unknown"),
            ).inc()

    @staticmethod
    def _dispatch_latency(
        metric_type: MetricType,
        value: float,
        labels: dict[str, str],
        p: NexusPrometheusMetrics,
    ) -> None:
        """Handle request, LLM, and TTFT latency metrics."""
        if metric_type == MetricType.REQUEST_DURATION:
            endpoint = labels.get("endpoint", "unknown")
            status_label = labels.get("status", "unknown")
            p.request_duration_seconds.labels(endpoint=endpoint).observe(value / 1000)
            p.requests_total.labels(status=status_label, endpoint=endpoint).inc()

        elif metric_type == MetricType.LLM_DURATION:
            p.llm_duration_seconds.labels(
                model=labels.get("model", "unknown"),
            ).observe(value / 1000)

        elif metric_type == MetricType.LLM_TTFT:
            p.ttft_seconds.labels(
                model=labels.get("model", "unknown"),
            ).observe(value / 1000)

    @staticmethod
    def _dispatch_llm_event(
        metric_type: MetricType,
        value: float,
        labels: dict[str, str],
        p: NexusPrometheusMetrics,
    ) -> None:
        """Handle LLM status and token metrics."""
        model = labels.get("model", "unknown")

        if metric_type == MetricType.LLM_STATUS:
            p.llm_calls_total.labels(model=model, status=labels.get("status", "unknown")).inc()
        elif metric_type == MetricType.LLM_TOKENS_INPUT:
            p.llm_tokens_input_total.labels(model=model).inc(value)
        elif metric_type == MetricType.LLM_TOKENS_OUTPUT:
            p.llm_tokens_output_total.labels(model=model).inc(value)
