"""Metrics subsystem for recording and exposing performance metrics.

This module provides the infrastructure for recording raw performance metrics
from Nexus components (LLM, cache, workflow, agent) and exposing them via
REST API and Prometheus-compatible endpoints.

Nexus records and exposes raw metrics data. KPI calculations (p95, averages,
aggregations) are performed by external performance tests, not by Nexus.
"""

from nexus.metrics.prometheus import NexusPrometheusMetrics
from nexus.metrics.recorder import MetricsRecorder
from nexus.metrics.store import MetricsStore
from nexus.metrics.types import (
    METRIC_CATEGORIES,
    MetricRecord,
    MetricsSummary,
    MetricType,
)

__all__ = [
    "METRIC_CATEGORIES",
    "MetricRecord",
    "MetricType",
    "MetricsRecorder",
    "MetricsStore",
    "MetricsSummary",
    "NexusPrometheusMetrics",
]
