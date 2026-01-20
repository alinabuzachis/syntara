# Research: LLM/Agent Performance Metrics Exposure

**Date**: 2025-12-17
**Feature**: 025-llm-agent-performance-kpis

## Research Questions

This document consolidates research findings for technical decisions required by the metrics exposure feature.

## Context

This feature exposes **raw metrics data** via API endpoints. Nexus does NOT calculate KPIs (p95, averages) - that's the responsibility of external performance tests and monitoring tools. Key principles:

- Metrics recording must add <1% overhead to request latency
- Metrics should be recorded asynchronously
- Both REST API and Prometheus-compatible endpoints required

## 1. Metrics Recording Library Selection

### Decision
Use `prometheus-client` library for Prometheus format metrics, combined with a custom in-memory metrics store for detailed raw metrics API.

### Rationale
- `prometheus-client` is the de facto standard for Python Prometheus metrics
- It provides efficient histogram, counter, and gauge implementations
- Supports OpenMetrics format out of the box
- Thread-safe by design
- Custom store allows detailed metrics with labels and time-range queries

### Implementation Pattern
```python
# File: src/nexus/metrics/prometheus.py
from prometheus_client import Counter, Histogram, Gauge, REGISTRY
from prometheus_client.exposition import generate_latest

# Counters
requests_total = Counter(
    'nexus_requests_total',
    'Total number of requests',
    ['status']
)

# Histograms
request_duration = Histogram(
    'nexus_request_duration_seconds',
    'Request duration in seconds',
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
)

llm_duration = Histogram(
    'nexus_llm_duration_seconds',
    'LLM API call duration in seconds',
    ['model']
)

# Gauges
active_workflows = Gauge(
    'nexus_active_workflows',
    'Number of active workflows'
)
```

### Error Handling
- Metrics recording failures should be logged but never block requests
- Use try/except wrappers around all metrics operations
- Fallback gracefully if prometheus-client unavailable

### Alternatives Considered
- **OpenTelemetry**: Rejected - heavier dependency, more complex setup, overkill for MVP
- **Custom implementation**: Rejected - reinventing the wheel, no Prometheus compatibility
- **StatsD**: Rejected - requires external aggregator, push model not ideal

## 2. Asynchronous Metrics Recording

### Decision
Use Python's `asyncio` background tasks with a bounded queue for non-blocking metrics recording. Metrics are recorded asynchronously to avoid blocking request handlers.

### Rationale
- Background tasks don't block request handling
- Bounded queue prevents memory exhaustion under load
- AsyncIO is already the core async model in Nexus

### Implementation Pattern

> **Note**: This is an early research sketch. See [data-model.md](./data-model.md) for the
> authoritative `MetricsRecorder` implementation which uses `MetricRecord` SQLModel,
> synchronous context manager, and includes `query()`, `cleanup()`, `get_summary()` methods.

```python
# Early sketch - see data-model.md for final implementation
from collections import deque
from contextlib import contextmanager
import time

class MetricsRecorder:
    """Metrics recorder with bounded queue."""

    def __init__(self, max_records: int = 1_000_000):
        self._records: deque = deque(maxlen=max_records)

    def record(self, metric_type, value: float, labels: dict[str, str] | None = None) -> None:
        """Record a metric (non-blocking)."""
        # Actual implementation uses MetricRecord SQLModel
        self._records.append(...)

    @contextmanager
    def time(self, metric_type, labels: dict[str, str] | None = None):
        """Context manager for timing operations."""
        start = time.perf_counter()
        try:
            yield
        finally:
            duration_ms = (time.perf_counter() - start) * 1000
            self.record(metric_type, duration_ms, labels=labels)
```

### Overhead Target
- Recording overhead: <0.1ms per metric
- Memory footprint: ~200 bytes per metric, ~200MB for 1M records

### Alternatives Considered
- **Synchronous recording**: Rejected - adds latency to every request
- **Thread pool**: Rejected - GIL contention, more complexity than asyncio
- **External queue (Redis)**: Rejected - adds network dependency, overkill for MVP

## 3. In-Memory Metrics Store

### Decision
Use an in-memory store with configurable retention period and optional Redis/Valkey persistence for the REST API metrics. Prometheus metrics use prometheus-client's built-in aggregation.

> **Note**: In the final design ([data-model.md](./data-model.md)), the store functionality is
> incorporated directly into `MetricsRecorder` rather than as a separate class. This simplifies
> the architecture by having a single class handle both recording and querying.

### Rationale
- In-memory provides fastest query times for raw metrics
- Configurable retention prevents unbounded growth
- Optional Redis persistence for multi-instance deployments
- Prometheus-client handles its own aggregation efficiently

### Implementation Pattern (early sketch)
```python
# Early research sketch - final design incorporates this into MetricsRecorder
from datetime import datetime, timedelta
from typing import Iterator
from collections import defaultdict

class MetricsStore:
    """In-memory metrics store with time-based retention."""

    def __init__(self, retention_seconds: int = 86400):
        self._retention = timedelta(seconds=retention_seconds)
        self._metrics: list[dict] = []

    def add(self, metric: dict) -> None:
        """Add a metric to the store."""
        self._metrics.append(metric)
        self._cleanup_if_needed()

    def query(
        self,
        metric_type: str | None = None,
        start_time: datetime | None = None,
        end_time: datetime | None = None,
        labels: dict[str, str] | None = None
    ) -> Iterator[dict]:
        """Query metrics with optional filters."""
        now = datetime.utcnow()
        start = start_time or (now - self._retention)
        end = end_time or now

        for metric in self._metrics:
            if metric['created_at'] < start or metric['created_at'] > end:
                continue
            if metric_type and metric['type'] != metric_type:
                continue
            if labels:
                if not all(metric.get('labels', {}).get(k) == v for k, v in labels.items()):
                    continue
            yield metric

    def _cleanup_if_needed(self) -> None:
        """Remove metrics older than retention period."""
        cutoff = datetime.utcnow() - self._retention
        self._metrics = [m for m in self._metrics if m['created_at'] >= cutoff]
```

### Storage Estimates
- Per metric: ~200 bytes (type, value, labels, timestamp)
- 1000 RPS = 86.4M metrics/day = ~17GB uncompressed
- With 24-hour retention: ~17GB peak memory
- Recommendation: Start with 1-hour retention for raw metrics, rely on Prometheus for historical data

### Alternatives Considered
- **PostgreSQL**: Rejected - adds query latency, doesn't scale for high-frequency writes
- **TimescaleDB**: Rejected - heavy dependency, over-engineering for MVP
- **Pure Prometheus**: Rejected - can't query detailed individual metrics with labels

## 4. REST API Design

### Decision
Implement `/api/v1/metrics` endpoint with filtering parameters. Return JSON format with pagination support.

### Rationale
- REST API allows flexible queries by performance tests
- JSON format is universally consumable
- Pagination prevents response overload
- Query parameters match common patterns (time range, type, labels)

### Implementation Pattern

> **Note**: See [data-model.md](./data-model.md) for the `MetricsQuery` model definition
> which extends `BaseListParams` for cursor-based pagination.
> Pattern follows Tool Manager: `src/nexus/tool_manager/router.py`

```python
# File: src/nexus/metrics/router.py
from typing import Annotated

from fastapi import APIRouter, Query

from nexus.metrics.types import MetricsQuery, MetricsListResponse, MetricsSummary

router = APIRouter(prefix="/api/v1/metrics", tags=["metrics"])

@router.get("")
async def query_metrics(
    params: Annotated[MetricsQuery, Query()],  # Inject query params model
) -> MetricsListResponse:
    """Query raw metrics with optional filtering.

    MetricsQuery includes: type, start_time, end_time, labels,
    plus inherited from BaseListParams: limit, cursor, sort, include_total
    """
    ...

@router.get("/summary")
async def get_summary() -> MetricsSummary:
    """Get quick summary of metric counts."""
    ...
```

### Error Handling
- Invalid time ranges: Return 400 with descriptive error
- Empty results: Return empty array (not 404)
- Rate limiting: Consider adding if metrics queries impact performance

### Alternatives Considered
- **GraphQL**: Rejected - over-engineering for simple queries
- **gRPC**: Rejected - less accessible for testing tools
- **WebSocket streaming**: Rejected - adds complexity, not needed for performance tests

## 5. Prometheus Endpoint Format

### Decision
Use `/metrics` endpoint with standard OpenMetrics format. Leverage prometheus-client's built-in exposition.

### Rationale
- `/metrics` is the standard Prometheus scrape endpoint
- OpenMetrics format is forward-compatible with Prometheus 2.x+
- prometheus-client handles format generation efficiently
- Compatible with Grafana, AlertManager, and other tooling

### Implementation Pattern

> **Note**: Per Router Discovery Framework, all metrics endpoints (including Prometheus)
> must be in the same router file.

```python
# File: src/nexus/metrics/router.py (same router as REST API endpoints)
from fastapi import Response
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST

# Add to existing metrics router alongside /api/v1/metrics endpoints

@router.get("/metrics")
async def prometheus_metrics():
    """Prometheus metrics endpoint."""
    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST
    )
```

### Metrics Exposed
```
# Counters
nexus_requests_total{status="success|error"}
nexus_errors_total{type="timeout|rate_limit|validation|internal"}
nexus_cache_hits_total
nexus_cache_misses_total

# Histograms
nexus_request_duration_seconds{le="0.1|0.5|1.0|..."}
nexus_llm_duration_seconds{model="gpt-4|...", le="..."}
nexus_ttft_seconds{le="..."}
nexus_cache_lookup_duration_seconds{le="..."}

# Gauges
nexus_cache_utilization_ratio
nexus_active_workflows
```

### Alternatives Considered
- **Custom format**: Rejected - not compatible with Prometheus ecosystem
- **JSON metrics endpoint**: Rejected - duplicates REST API functionality
- **StatsD push**: Rejected - pull model more reliable for monitoring

## 6. Instrumentation Strategy

### Decision
Use decorators and context managers for minimal-invasive instrumentation. Instrument at service layer boundaries, not deep in implementation.

### Rationale
- Decorators provide clean separation of metrics from business logic
- Context managers handle timing automatically
- Service layer boundaries capture meaningful durations
- Minimal code changes to existing components

### Implementation Pattern

> **Note**: This shows a **decorator** approach for timing entire functions.
> [data-model.md](./data-model.md) defines `recorder.time()` as a **context manager**
> for timing code blocks. Both patterns are complementary:
> - **Decorator**: For timing entire functions (shown below)
> - **Context manager**: For timing specific code blocks within functions

```python
# File: src/nexus/metrics/instrumentation.py
from functools import wraps
from typing import Callable, TypeVar, ParamSpec
import time

P = ParamSpec("P")
T = TypeVar("T")

def timed_metric(metric_name: str, labels_from_args: list[str] | None = None):
    """Decorator to time function execution (complements recorder.time() context manager)."""
    def decorator(func: Callable[P, T]) -> Callable[P, T]:
        @wraps(func)
        async def wrapper(*args: P.args, **kwargs: P.kwargs) -> T:
            labels = {}
            if labels_from_args:
                for label in labels_from_args:
                    if label in kwargs:
                        labels[label] = str(kwargs[label])

            start = time.perf_counter()
            try:
                result = await func(*args, **kwargs)
                labels['status'] = 'success'
                return result
            except Exception:
                labels['status'] = 'error'
                raise
            finally:
                duration = time.perf_counter() - start
                recorder.record(metric_name, duration * 1000, labels)
        return wrapper
    return decorator

# Usage:
@timed_metric("llm_duration_ms", labels_from_args=["model"])
async def call_llm(prompt: str, model: str) -> str:
    ...
```

### Instrumentation Points
1. **LLM Adaptor**: Request duration, token counts, TTFT, model, status
2. **Cache Layer**: Hit/miss, lookup duration
3. **Workflow Engine**: Workflow duration, activity duration, status
4. **Agent Orchestrator**: Routing duration, invocation duration
5. **API Layer**: Total request duration (middleware)

### Alternatives Considered
- **Manual instrumentation**: Rejected - verbose, error-prone, pollutes code
- **AOP framework**: Rejected - adds heavy dependency, Python AOP is weak
- **Monkey patching**: Rejected - fragile, hard to maintain

## Summary

All research questions resolved with concrete technical decisions:

1. ✅ **Library**: prometheus-client for Prometheus metrics, custom store for REST API
2. ✅ **Async Recording**: AsyncIO background tasks with bounded queue
3. ✅ **Storage**: In-memory store with configurable retention (default 24h)
4. ✅ **REST API**: `/api/v1/metrics` with time range and label filtering
5. ✅ **Prometheus**: `/metrics` endpoint with OpenMetrics format
6. ✅ **Instrumentation**: Decorators and context managers at service boundaries

These decisions support all functional requirements while maintaining the <1% overhead constraint.

## Next Steps

1. Create data-model.md with MetricRecord and MetricType definitions
2. Define public API surface (recorder, store, endpoints)
3. Write failing unit and integration tests
4. Create quickstart.md validation scenarios
