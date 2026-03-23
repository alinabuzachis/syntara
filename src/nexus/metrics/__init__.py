"""Metrics subsystem for recording and exposing performance metrics.

This module provides the infrastructure for recording raw performance metrics
from Nexus components (LLM, cache, workflow, agent) and exposing them via
REST API and Prometheus-compatible endpoints.

Nexus records and exposes raw metrics data. KPI calculations (p95, averages,
aggregations) are performed by external performance tests, not by Nexus.
"""

from nexus.metrics.dependencies import get_metrics_recorder
from nexus.metrics.instrumentation import (
    LLMCallMetrics,
    LLMStreamTracker,
    record_llm_call,
)
from nexus.metrics.middleware import MetricsMiddleware, classify_error_type
from nexus.metrics.prometheus import NexusPrometheusMetrics
from nexus.metrics.recorder import MetricsRecorder
from nexus.metrics.store import MetricsStore
from nexus.metrics.types import (
    COMPONENT_LABELS,
    METRIC_CATEGORIES,
    MetricRecord,
    MetricsCategoryType,
    MetricsSummary,
    MetricType,
)

__all__ = [
    "COMPONENT_LABELS",
    "METRIC_CATEGORIES",
    "LLMCallMetrics",
    "LLMStreamTracker",
    "MetricRecord",
    "MetricType",
    "MetricsCategoryType",
    "MetricsMiddleware",
    "MetricsRecorder",
    "MetricsStore",
    "MetricsSummary",
    "NexusPrometheusMetrics",
    "classify_error_type",
    "get_metrics_recorder",
    "record_llm_call",
]
