# Observability Standards

## Overview

Nexus implements a two-system observability architecture:

1. **Metrics** - Performance monitoring via Prometheus (technical operations)
2. **Telemetry** - Product analytics via Segment.com (business intelligence)

Both systems follow the fire-and-forget principle: observability code MUST NEVER cause business logic to fail.

## Constitutional Requirement

From `.specify/memory/constitution.md`:

> Every component MUST emit structured logs, metrics, and traces. Observability is not an afterthought but a primary design concern. All critical paths must have appropriate instrumentation.

## System Architecture

### Metrics System (Prometheus)

**Purpose:** Monitor system performance, resource utilization, and operational health.

**Location:** `src/nexus/metrics/`

**Endpoint:** `/metrics` (OpenMetrics/Prometheus format)

**Components:**
- `MetricsRecorder` - Central recording API
- `MetricsStore` - In-memory retention (configurable, default 24h)
- `NexusPrometheusMetrics` - Prometheus instrument registry
- `MetricsMiddleware` - ASGI middleware for HTTP request metrics

**Metrics tracked:**
- Request latency and throughput
- HTTP error rates (classified by type: timeout, rate_limit, validation, internal)
- LLM call duration, token usage (input/output), Time-To-First-Token (TTFT)
- Workflow execution duration, completion rate
- Activity execution success rate
- Database query response time, connection pool utilization
- Tool execution duration and success rate

### Telemetry System (Segment.com)

**Purpose:** Capture product usage patterns for data-driven product improvement.

**Location:** `src/nexus/telemetry/`

**Components:**
- `TelemetryCollector` - Service class for event capture and dispatch
- `TelemetryClientRegistry` - Singleton registry managing Segment client lifecycle
- Event builders - Builder pattern for constructing typed events
- `TelemetryMiddleware` - ASGI middleware for API call telemetry

**Events collected:**
- Workflow execution (start, completion with status/duration/error)
- Activity execution (type, status, duration, error type)
- API calls (endpoint, method, status, response time, payload size)

**Configuration:**
- `APP_SEGMENT_WRITE_KEY` - Segment.com write key
- `APP_SEGMENT_ENDPOINT` - Segment.com endpoint URL
- `APP_ENTITLEMENT_ID` - Optional entitlement identifier (included in all events)

**Privacy:** No PII collected. No credentials collected.

## When to Use Which System

| Use Case | System | Rationale |
|----------|--------|-----------|
| Response latency | Metrics | Operational health, alerting |
| Error rate by endpoint | Metrics | Operational health, alerting |
| LLM token usage | Metrics | Cost tracking, performance |
| Workflow completion rate | Both | Metrics for ops, Telemetry for product |
| User behavior patterns | Telemetry | Product intelligence |
| Feature adoption | Telemetry | Product intelligence |
| Resource utilization | Metrics | Infrastructure scaling |

## Fire-and-Forget Principle

Observability code MUST follow the fire-and-forget pattern:

```python
def capture_workflow_start(self, workflow_execution_id: str) -> None:
    try:
        event = self._workflow_builder.build_start_event(
            workflow_execution_id=workflow_execution_id,
            entitlement_id=self._registry.entitlement_id,
        )
        self._registry.send_event(event)
    except Exception:
        logger.exception("Failed to capture workflow start event (fire-and-forget)")
```

**Requirements:**
- Exceptions MUST be caught and logged, NEVER propagated
- Business logic MUST NOT depend on observability success
- Failure to record metrics/telemetry MUST NOT block operations
- Log observability failures at DEBUG or WARNING level, not ERROR

## Adding Metrics

### 1. Define the Metric Type

Add to `src/nexus/metrics/types.py`:

```python
class MetricType(str, Enum):
    MY_NEW_METRIC = "my_new_metric"
```

### 2. Register Prometheus Instrument

For component-level metrics, add to `_COMPONENT_METRIC_MAP` in `src/nexus/metrics/recorder.py`:

```python
_COMPONENT_METRIC_MAP: dict[MetricType, tuple[str, str, tuple[str, ...]]] = {
    MetricType.MY_NEW_METRIC: ("my_new_metric_seconds", "histogram", ("label_name",)),
}
```

Tuple format: `(prometheus_attribute_name, action, extra_label_keys)`
- Actions: `"gauge"`, `"histogram"`, `"counter"`

For system-wide metrics, add dispatch logic to `_dispatch_prometheus` in `src/nexus/metrics/recorder.py`.

### 3. Record the Metric

```python
from nexus.metrics.recorder import MetricsRecorder
from nexus.metrics.types import MetricType

recorder = MetricsRecorder()

# Simple recording
recorder.record(
    MetricType.MY_NEW_METRIC,
    value=245.5,
    unit="ms",
    labels={"component": "tool_manager", "label_name": "value"},
)

# Context manager for timing
with recorder.time(MetricType.MY_NEW_METRIC, labels={"component": "tool_manager"}):
    result = perform_operation()
```

### 4. LLM Instrumentation

Use `record_llm_call` wrapper for invoke-style calls:

```python
from nexus.metrics.instrumentation import record_llm_call

result = await record_llm_call(
    recorder,
    lambda: llm.ainvoke(messages),
    model="anthropic/claude-3.5-sonnet",
)
```

For streaming calls, use `LLMStreamTracker`:

```python
from nexus.metrics.instrumentation import LLMStreamTracker

tracker = LLMStreamTracker(recorder, model="gpt-4")
async for event in graph.astream_events(...):
    tracker.process_event(event)
```

## Adding Telemetry Events

### 1. Define Event Model

Create SQLModel class in `src/nexus/telemetry/events/`:

```python
from sqlmodel import Field
from nexus.telemetry.events.base import BaseTelemetryEvent

class MyFeatureEvent(BaseTelemetryEvent):
    """Telemetry event for my feature.

    Attributes:
        feature_id: Unique feature identifier.
        action: Action performed (e.g., "created", "updated").
        duration_ms: Optional duration in milliseconds.
    """

    feature_id: str = Field(description="Unique feature identifier")
    action: str = Field(description="Action performed")
    duration_ms: int | None = Field(default=None, description="Duration in milliseconds")
```

### 2. Create Event Builder

```python
class MyFeatureEventBuilder:
    """Builder for constructing my feature telemetry events."""

    def build_event(
        self,
        feature_id: str,
        action: str,
        entitlement_id: str,
        duration_ms: int | None = None,
    ) -> MyFeatureEvent:
        return MyFeatureEvent(
            feature_id=feature_id,
            action=action,
            duration_ms=duration_ms,
            entitlement_id=entitlement_id,
        )
```

### 3. Capture and Send

Add method to `TelemetryCollector` or create a dedicated collector:

```python
def capture_my_feature_event(
    self,
    feature_id: str,
    action: str,
    duration_ms: int | None = None,
) -> None:
    """Capture a feature event (fire-and-forget).

    Args:
        feature_id: Unique feature identifier.
        action: Action performed.
        duration_ms: Optional duration in milliseconds.
    """
    try:
        event = self._my_feature_builder.build_event(
            feature_id=feature_id,
            action=action,
            entitlement_id=self._registry.entitlement_id,
            duration_ms=duration_ms,
        )
        self._registry.send_event(event)
    except Exception:
        logger.exception("Failed to capture feature event (fire-and-forget)")
```

## What to Instrument

### Critical Paths (MUST instrument)

- All public API endpoints (automatically handled by `MetricsMiddleware`)
- LLM calls (use `record_llm_call` or `LLMStreamTracker`)
- Workflow execution start/completion
- Activity execution
- Tool execution
- Database queries (long-running or high-volume)

### Error Paths (MUST instrument)

- All exception handlers in critical paths
- Validation failures
- Rate limiting events
- Timeout events
- External service failures

### Performance-Sensitive Operations (SHOULD instrument)

- Cache operations (hits, misses, lookup duration)
- Serialization/deserialization (workflows, activities)
- Template resolution
- Complex graph traversals

## What NOT to Instrument

### Privacy and Security

**NEVER record:**
- Personally Identifiable Information (PII)
- Credentials (passwords, API keys, tokens)
- User-generated content verbatim (summarize or hash)
- Internal IP addresses or hostnames (use aggregated identifiers)

### Cardinality Concerns

**AVOID unbounded labels:**
- User IDs (use hashed/anonymized identifiers or omit)
- UUIDs in metric labels (use as request IDs in logs, not labels)
- Raw file paths (use normalized paths or component names)
- Arbitrary user input

**Correct cardinality:**
- Endpoint templates (`/api/v1/executions/{execution_id}`) not raw paths
- Fixed set of status codes
- Component names from `COMPONENT_LABELS`
- Model names (provider-prefixed, e.g., `anthropic/claude-3.5-sonnet`)

### Label Limits

Prometheus labels create a combinatorial explosion of time series:
- Keep label count per metric under 5
- Ensure each label has a bounded set of values (preferably < 100)
- Use structured logs for high-cardinality data (request IDs, stack traces)

## Middleware Patterns

### HTTP Metrics Middleware

`MetricsMiddleware` is applied globally in `src/nexus/api/main.py`:

```python
from nexus.metrics.middleware import MetricsMiddleware

app.add_middleware(MetricsMiddleware, recorder=metrics_recorder)
```

**Automatic metrics:**
- Request duration with endpoint template, method, status
- Error classification (timeout, rate_limit, validation, internal)
- Request ID validation and `X-Request-Id` header echo

**Excluded paths:**
- `/metrics` (avoid self-instrumentation loops)
- `/health` (high-volume, low-signal)

### Custom Middleware

For component-specific telemetry, follow the same pattern:

```python
class MyFeatureMiddleware:
    def __init__(self, app: ASGIApp, collector: TelemetryCollector) -> None:
        self.app = app
        self._collector = collector

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Extract feature-specific context
        feature_id = extract_feature_id(scope)

        try:
            await self.app(scope, receive, send)
            self._collector.capture_my_feature_event(feature_id, "completed")
        except Exception:
            self._collector.capture_my_feature_event(feature_id, "failed")
            raise
```

## Testing Observability Code

### Unit Testing Metrics

Use isolated Prometheus registry:

```python
import pytest
from prometheus_client import CollectorRegistry
from nexus.metrics.recorder import MetricsRecorder

@pytest.fixture
def recorder() -> MetricsRecorder:
    """Fresh MetricsRecorder with isolated Prometheus registry."""
    return MetricsRecorder(
        retention_seconds=3600,
        max_records=10_000,
        prometheus_registry=CollectorRegistry(),
    )

def test_my_metric_recording(recorder):
    recorder.record(MetricType.MY_METRIC, 42.0, labels={"component": "test"})

    # Query recorded metrics
    records = list(recorder.query(metric_types={MetricType.MY_METRIC}))
    assert len(records) == 1
    assert records[0].value == 42.0
```

### Unit Testing Telemetry

Mock the registry:

```python
from unittest.mock import MagicMock
from nexus.telemetry.collector import TelemetryCollector

def test_my_telemetry_event():
    mock_registry = MagicMock()
    mock_registry.entitlement_id = "test-entitlement"
    collector = TelemetryCollector(registry=mock_registry)

    collector.capture_my_feature_event(feature_id="test-123", action="created")

    mock_registry.send_event.assert_called_once()
    sent_event = mock_registry.send_event.call_args[0][0]
    assert sent_event.feature_id == "test-123"
    assert sent_event.action == "created"
```

### Integration Testing

Enable observability in test fixtures, verify no exceptions:

```python
@pytest.mark.integration
async def test_workflow_execution_telemetry(test_client, db_session):
    """Verify workflow execution emits telemetry without errors."""
    response = await test_client.post(
        "/api/v1/workflows/execute",
        json={"workflow_id": "test-workflow"},
    )
    assert response.status_code == 200

    # Telemetry should not cause failures
    # Verify via log inspection or test registry if needed
```

### Disabling Observability in Tests

To reduce noise in unrelated tests:

```python
@pytest.fixture
def recorder() -> MetricsRecorder:
    return MetricsRecorder(enabled=False)
```

## Component Label Registry

Valid component labels are defined in `src/nexus/metrics/types.py`:

```python
COMPONENT_LABELS: dict[str, str] = {
    "api_service": "api_service",
    "workflow_engine": "workflow_engine",
    "temporal_worker": "temporal_worker",
    "execution_service": "execution_service",
    "invocation_service": "invocation_service",
    "routing_service": "routing_service",
    "tool_manager": "tool_manager",
    "database": "database",
    "system_wide": "system_wide",
}
```

When adding a new component:
1. Add to `COMPONENT_LABELS`
2. Update metrics map if needed
3. Use consistently across all metrics for that component

## Request IDs

**Tracing:** Clients can pass an `X-Request-Id` header (UUID) on any HTTP request. The value is validated, stored in a ContextVar, echoed back in the response, and automatically included in every telemetry event emitted during that request. Use `request_id` for end-to-end request tracing.

## Best Practices Summary

1. **Fire-and-forget:** Observability failures MUST NOT propagate.
2. **Label cardinality:** Use bounded sets of label values (< 100 per label).
3. **Privacy first:** No PII, no credentials, ever.
4. **Template endpoints:** Use route templates (`/api/v1/users/{id}`) not raw paths.
5. **Test isolation:** Use isolated registries for unit tests.
6. **Consistent naming:** Follow existing patterns (snake_case, descriptive).
7. **Documentation:** Add docstrings to new metrics and events.
8. **Constitutional compliance:** Instrument all critical paths and error paths.

## Tooling vs Convention

**Enforced by tooling:**

- `MetricsMiddleware` automatically instruments all HTTP endpoints (except `/metrics`, `/health`)
- `TelemetryMiddleware` automatically captures API call telemetry
- Prometheus client validates metric names and label combinations at registration time
- Pydantic validates telemetry event models

**Convention only:**

- Fire-and-forget pattern (catch-and-log in observability code)
- Label cardinality limits (< 100 values per label, < 5 labels per metric)
- `COMPONENT_LABELS` registry maintenance
- Privacy rules (no PII, no credentials)
- Request ID propagation via structured logging
- Choosing metrics vs telemetry for a given use case

## Reference

| File | Purpose |
|---|---|
| `src/nexus/metrics/recorder.py` | `MetricsRecorder` central recording API |
| `src/nexus/metrics/types.py` | `MetricType` enum, `COMPONENT_LABELS` |
| `src/nexus/metrics/middleware.py` | `MetricsMiddleware` ASGI middleware |
| `src/nexus/metrics/instrumentation.py` | `record_llm_call`, `LLMStreamTracker` |
| `src/nexus/telemetry/collector.py` | `TelemetryCollector` service class |
| `src/nexus/telemetry/events/` | Telemetry event models |
| `tests/unit/metrics/` | Metrics test suite |
| `tests/unit/telemetry/` | Telemetry test suite |

**External:**

- [Constitution](../../.specify/memory/constitution.md) — Section IV: Observability First

Generated By: Claude Code (Claude Opus 4.6)
