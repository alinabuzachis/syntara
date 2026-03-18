"""Prometheus metric definitions for the Nexus metrics subsystem.

All Prometheus counters, histograms, and gauges required by FR-026 through
FR-029 are encapsulated in :class:`NexusPrometheusMetrics` so that each test
(or service instance) can operate on an isolated registry.
"""

from __future__ import annotations

from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram

# Histogram bucket boundaries tuned to different latency profiles.
LATENCY_BUCKETS_FAST: tuple[float, ...] = (
    0.005,
    0.01,
    0.025,
    0.05,
    0.075,
    0.1,
    0.25,
    0.5,
    0.75,
    1.0,
)
LATENCY_BUCKETS_MEDIUM: tuple[float, ...] = (
    0.1,
    0.25,
    0.5,
    1.0,
    2.5,
    5.0,
    7.5,
    10.0,
)
LATENCY_BUCKETS_SLOW: tuple[float, ...] = (
    1.0,
    5.0,
    10.0,
    30.0,
    60.0,
    120.0,
    300.0,
)


class NexusPrometheusMetrics:
    """Container for all Nexus Prometheus metrics bound to a single registry.

    Using an explicit registry (rather than the global default) makes tests
    deterministic and avoids metric-name collisions across test runs.

    Args:
        registry: A ``CollectorRegistry`` to register metrics against.
            When *None*, a fresh private registry is created.

    """

    def __init__(self, registry: CollectorRegistry | None = None) -> None:
        """Initialise metrics and bind them to *registry*."""
        self.registry = registry or CollectorRegistry()

        # ---- Counters (FR-027) ----
        self.requests_total = Counter(
            "nexus_requests_total",
            "Total number of requests processed",
            ["status", "endpoint"],
            registry=self.registry,
        )

        self.errors_total = Counter(
            "nexus_errors_total",
            "Total number of errors by type",
            ["error_type"],
            registry=self.registry,
        )

        self.cache_hits_total = Counter(
            "nexus_cache_hits_total",
            "Total cache hits",
            registry=self.registry,
        )

        self.cache_misses_total = Counter(
            "nexus_cache_misses_total",
            "Total cache misses",
            registry=self.registry,
        )

        self.llm_calls_total = Counter(
            "nexus_llm_calls_total",
            "Total LLM API calls",
            ["model", "status"],
            registry=self.registry,
        )

        self.workflows_total = Counter(
            "nexus_workflows_total",
            "Total workflow executions started",
            ["workflow_type"],
            registry=self.registry,
        )

        # ---- Histograms (FR-028) ----
        self.request_duration_seconds = Histogram(
            "nexus_request_duration_seconds",
            "Request duration in seconds",
            ["endpoint"],
            buckets=LATENCY_BUCKETS_MEDIUM,
            registry=self.registry,
        )

        self.llm_duration_seconds = Histogram(
            "nexus_llm_duration_seconds",
            "LLM API call duration in seconds",
            ["model"],
            buckets=LATENCY_BUCKETS_MEDIUM,
            registry=self.registry,
        )

        self.ttft_seconds = Histogram(
            "nexus_ttft_seconds",
            "Time To First Token in seconds",
            ["model"],
            buckets=LATENCY_BUCKETS_FAST,
            registry=self.registry,
        )

        self.cache_lookup_duration_seconds = Histogram(
            "nexus_cache_lookup_duration_seconds",
            "Cache lookup duration in seconds",
            buckets=LATENCY_BUCKETS_FAST,
            registry=self.registry,
        )

        self.workflow_duration_seconds = Histogram(
            "nexus_workflow_duration_seconds",
            "Workflow execution duration in seconds",
            buckets=LATENCY_BUCKETS_SLOW,
            registry=self.registry,
        )

        self.activity_duration_seconds = Histogram(
            "nexus_activity_duration_seconds",
            "Activity execution duration in seconds",
            buckets=LATENCY_BUCKETS_MEDIUM,
            registry=self.registry,
        )

        # ---- Gauges (FR-029) ----
        self.cache_utilization_ratio = Gauge(
            "nexus_cache_utilization_ratio",
            "Current cache utilization (0.0 to 1.0)",
            registry=self.registry,
        )

        self.active_workflows = Gauge(
            "nexus_active_workflows",
            "Number of currently active workflows",
            registry=self.registry,
        )

        self.active_llm_requests = Gauge(
            "nexus_active_llm_requests",
            "Number of in-flight LLM requests",
            registry=self.registry,
        )
