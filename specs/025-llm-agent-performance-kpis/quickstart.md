# Quickstart: LLM/Agent Performance Metrics Exposure

**Feature**: 025-llm-agent-performance-kpis
**Purpose**: Validate this implementation matches the specification

## Overview

This quickstart demonstrates the metrics exposure system through practical usage scenarios. It validates that the implementation correctly:

- Records metrics with <1% overhead
- Exposes raw metrics via REST API
- Provides Prometheus-compatible metrics
- Supports time-range and label filtering

## Prerequisites

```bash
# Install dependencies
uv sync

# Start the Nexus server
make run

# Or run in development mode
make dev
```

## Test Scenario 1: Basic Metrics Recording

**Acceptance Criteria**: FR-005, FR-006, FR-007 (LLM Metrics)
> System MUST record and expose LLM request duration, input token count, and output token count

```python
from nexus.metrics.recorder import MetricsRecorder
from nexus.metrics.types import MetricType

# Setup
recorder = MetricsRecorder(retention_seconds=3600)  # 1 hour retention

# Record LLM metrics
recorder.record(
    metric_type=MetricType.LLM_DURATION,
    value=245.5,
    unit="ms",
    labels={"model": "gpt-4", "status": "success"}
)

recorder.record(
    metric_type=MetricType.LLM_TOKENS_INPUT,
    value=1500,
    unit="tokens",
    labels={"model": "gpt-4"}
)

recorder.record(
    metric_type=MetricType.LLM_TOKENS_OUTPUT,
    value=350,
    unit="tokens",
    labels={"model": "gpt-4"}
)

# Verify metrics recorded
metrics = list(recorder.query(metric_type=MetricType.LLM_DURATION))
assert len(metrics) == 1
assert metrics[0].value == 245.5
assert metrics[0].labels["model"] == "gpt-4"
print("✅ LLM metrics recorded correctly")
```

**Expected Output**:
```
✅ LLM metrics recorded correctly
```

---

## Test Scenario 2: Time Context Manager for Automatic Timing

**Acceptance Criteria**: NFR-001, NFR-002 (Performance)
> Metrics collection MUST add less than 1% overhead and be recorded asynchronously

```python
import time
from nexus.metrics.recorder import MetricsRecorder
from nexus.metrics.types import MetricType

recorder = MetricsRecorder()

# Simulate LLM call with automatic timing
async def simulate_llm_call():
    with recorder.time(MetricType.LLM_DURATION, labels={"model": "gpt-4"}):
        # Simulate LLM processing
        await asyncio.sleep(0.1)  # 100ms

# Run and verify
import asyncio
asyncio.run(simulate_llm_call())

metrics = list(recorder.query(metric_type=MetricType.LLM_DURATION))
assert len(metrics) == 1
assert 95 <= metrics[0].value <= 110  # ~100ms with some variance
print(f"✅ Automatic timing recorded: {metrics[0].value:.2f}ms")
```

**Expected Output**:
```
✅ Automatic timing recorded: 100.25ms
```

---

## Test Scenario 3: Query Metrics via REST API

**Acceptance Criteria**: FR-001, FR-002, FR-003, FR-004 (Core Metrics Endpoint)
> System MUST expose a `/api/v1/metrics` endpoint with time-range and type filtering

```python
import httpx
from datetime import datetime, timedelta

# Query all LLM metrics from last hour
async def query_llm_metrics():
    async with httpx.AsyncClient() as client:
        start_time = (datetime.utcnow() - timedelta(hours=1)).isoformat()

        response = await client.get(
            "http://localhost:8000/api/v1/metrics",
            params={
                "type": "llm",
                "start_time": start_time,
                "limit": 100
            }
        )

        assert response.status_code == 200
        data = response.json()

        print(f"✅ Queried {data['count']} LLM metrics")

        for metric in data["metrics"][:3]:
            print(f"   - {metric['type']}: {metric['value']} {metric['unit']}")

        return data

import asyncio
asyncio.run(query_llm_metrics())
```

**Expected Output**:
```
✅ Queried 15 LLM metrics
   - llm_duration_ms: 245.5 ms
   - llm_tokens_input: 1500 tokens
   - llm_tokens_output: 350 tokens
```

---

## Test Scenario 4: Filter Metrics by Labels

**Acceptance Criteria**: FR-003 (Label Filtering)
> System MUST support filtering metrics by labels

```python
import httpx

async def query_by_model():
    async with httpx.AsyncClient() as client:
        # Query metrics for gpt-4 model only
        response = await client.get(
            "http://localhost:8000/api/v1/metrics",
            params={
                "type": "llm",
                "labels": '{"model": "gpt-4"}',
                "limit": 50
            }
        )

        assert response.status_code == 200
        data = response.json()

        # Verify all returned metrics have model=gpt-4
        for metric in data["metrics"]:
            assert metric["labels"].get("model") == "gpt-4"

        print(f"✅ Found {data['count']} metrics for gpt-4 model")

import asyncio
asyncio.run(query_by_model())
```

**Expected Output**:
```
✅ Found 12 metrics for gpt-4 model
```

---

## Test Scenario 5: Cache Metrics

**Acceptance Criteria**: FR-011, FR-012, FR-013 (Cache Metrics)
> System MUST record cache hit/miss and lookup duration

```python
from nexus.metrics.recorder import MetricsRecorder
from nexus.metrics.types import MetricType

recorder = MetricsRecorder()

# Simulate cache operations
def simulate_cache_lookup(hit: bool):
    with recorder.time(MetricType.CACHE_LOOKUP_DURATION):
        # Simulate cache lookup
        import time
        time.sleep(0.002)  # 2ms lookup

    if hit:
        recorder.record(MetricType.CACHE_HIT, value=1)
        recorder.increment("cache_hits")
    else:
        recorder.record(MetricType.CACHE_MISS, value=1)
        recorder.increment("cache_misses")

# Simulate 10 cache operations (7 hits, 3 misses)
for i in range(10):
    simulate_cache_lookup(hit=(i < 7))

# Verify metrics
summary = recorder.get_summary()
assert summary.cache_hits == 7
assert summary.cache_misses == 3
assert summary.cache_hit_rate == 0.7  # 70% hit rate

print(f"✅ Cache hit rate: {summary.cache_hit_rate * 100:.1f}%")
print(f"   Hits: {summary.cache_hits}, Misses: {summary.cache_misses}")
```

**Expected Output**:
```
✅ Cache hit rate: 70.0%
   Hits: 7, Misses: 3
```

---

## Test Scenario 6: Metrics Summary Endpoint

**Acceptance Criteria**: FR-001 (Summary Endpoint)
> System MUST provide a quick summary of metric counts

```python
import httpx

async def get_metrics_summary():
    async with httpx.AsyncClient() as client:
        response = await client.get("http://localhost:8000/api/v1/metrics/summary")

        assert response.status_code == 200
        data = response.json()

        print("✅ Metrics Summary:")
        print(f"   Total Requests: {data['total_requests']}")
        print(f"   Total Errors: {data['total_errors']}")
        print(f"   Cache Hits: {data['cache_hits']}")
        print(f"   Cache Misses: {data['cache_misses']}")
        print(f"   LLM Calls: {data['llm_calls']}")
        print(f"   Active Workflows: {data['active_workflows']}")
        print(f"   Period: {data['period_start']} to {data['period_end']}")

import asyncio
asyncio.run(get_metrics_summary())
```

**Expected Output**:
```
✅ Metrics Summary:
   Total Requests: 1523
   Total Errors: 12
   Cache Hits: 456
   Cache Misses: 234
   LLM Calls: 891
   Active Workflows: 3
   Period: 2025-12-16T12:00:00Z to 2025-12-17T12:00:00Z
```

---

## Test Scenario 7: Prometheus Metrics Endpoint

**Acceptance Criteria**: FR-026, FR-027, FR-028, FR-029 (Prometheus Support)
> System MUST expose a `/metrics` endpoint in Prometheus/OpenMetrics format

```python
import httpx

async def query_prometheus_metrics():
    async with httpx.AsyncClient() as client:
        response = await client.get("http://localhost:8000/metrics")

        assert response.status_code == 200
        assert "text/plain" in response.headers["content-type"]

        content = response.text

        # Verify expected metrics are present
        assert "nexus_requests_total" in content
        assert "nexus_llm_duration_seconds" in content
        assert "nexus_cache_hits_total" in content
        assert "nexus_cache_misses_total" in content
        assert "nexus_active_workflows" in content

        print("✅ Prometheus metrics endpoint working")
        print("\nSample metrics:")
        for line in content.split("\n")[:10]:
            if line and not line.startswith("#"):
                print(f"   {line}")

import asyncio
asyncio.run(query_prometheus_metrics())
```

**Expected Output**:
```
✅ Prometheus metrics endpoint working

Sample metrics:
   nexus_requests_total{status="success"} 1511
   nexus_requests_total{status="error"} 12
   nexus_llm_duration_seconds_bucket{model="gpt-4",le="0.5"} 789
   nexus_cache_hits_total 456
   nexus_cache_misses_total 234
```

---

## Test Scenario 8: Workflow and Activity Metrics

**Acceptance Criteria**: FR-014, FR-015, FR-016, FR-017 (Workflow Metrics)
> System MUST record workflow execution timing and per-activity duration

```python
from nexus.metrics.recorder import MetricsRecorder
from nexus.metrics.types import MetricType
import asyncio

recorder = MetricsRecorder()

async def simulate_workflow():
    workflow_id = "wf-12345"
    execution_id = "exec-67890"

    labels = {
        "workflow_id": workflow_id,
        "execution_id": execution_id
    }

    with recorder.time(MetricType.WORKFLOW_DURATION, labels=labels):
        # Activity 1: Fetch Context
        with recorder.time(MetricType.ACTIVITY_DURATION,
                          labels={**labels, "activity_name": "fetch_context"}):
            await asyncio.sleep(0.05)  # 50ms

        # Activity 2: LLM Call
        with recorder.time(MetricType.ACTIVITY_DURATION,
                          labels={**labels, "activity_name": "llm_call"}):
            await asyncio.sleep(0.2)  # 200ms

        # Activity 3: Tool Execution
        with recorder.time(MetricType.ACTIVITY_DURATION,
                          labels={**labels, "activity_name": "tool_exec"}):
            await asyncio.sleep(0.03)  # 30ms

    # Record success status
    recorder.record(
        MetricType.WORKFLOW_STATUS,
        value=1,
        labels={**labels, "status": "success"}
    )

asyncio.run(simulate_workflow())

# Verify workflow metrics
workflow_metrics = list(recorder.query(metric_type=MetricType.WORKFLOW_DURATION))
assert len(workflow_metrics) == 1
assert 275 <= workflow_metrics[0].value <= 290  # ~280ms total

activity_metrics = list(recorder.query(metric_type=MetricType.ACTIVITY_DURATION))
assert len(activity_metrics) == 3

print("✅ Workflow metrics recorded:")
print(f"   Total duration: {workflow_metrics[0].value:.2f}ms")
for m in activity_metrics:
    print(f"   Activity '{m.labels['activity_name']}': {m.value:.2f}ms")
```

**Expected Output**:
```
✅ Workflow metrics recorded:
   Total duration: 282.45ms
   Activity 'fetch_context': 51.23ms
   Activity 'llm_call': 201.12ms
   Activity 'tool_exec': 30.87ms
```

---

## Test Scenario 9: Error Metrics

**Acceptance Criteria**: FR-024, FR-025 (Error Metrics)
> System MUST record error counts by type with timestamps and correlation IDs

```python
from nexus.metrics.recorder import MetricsRecorder
from nexus.metrics.types import MetricType
import uuid

recorder = MetricsRecorder()

# Simulate various error types
error_types = ["timeout", "rate_limit", "validation", "internal"]

for error_type in error_types:
    recorder.record(
        MetricType.ERROR,
        value=1,
        labels={
            "error_type": error_type,
            "correlation_id": str(uuid.uuid4()),
            "endpoint": "/api/v1/chat"
        }
    )
    recorder.increment("errors")

# Query error metrics
error_metrics = list(recorder.query(metric_type=MetricType.ERROR))
assert len(error_metrics) == 4

# Verify each error type recorded
recorded_types = {m.labels["error_type"] for m in error_metrics}
assert recorded_types == set(error_types)

print("✅ Error metrics recorded:")
for m in error_metrics:
    print(f"   [{m.created_at.isoformat()}] {m.labels['error_type']}: correlation={m.labels['correlation_id'][:8]}...")
```

**Expected Output**:
```
✅ Error metrics recorded:
   [2025-12-17T10:30:45.123456] timeout: correlation=a1b2c3d4...
   [2025-12-17T10:30:45.125678] rate_limit: correlation=e5f6g7h8...
   [2025-12-17T10:30:45.127890] validation: correlation=i9j0k1l2...
   [2025-12-17T10:30:45.130012] internal: correlation=m3n4o5p6...
```

---

## Test Scenario 10: Performance Overhead Validation

**Acceptance Criteria**: NFR-001 (Performance)
> Metrics collection MUST add less than 1% overhead to request latency

```python
import time
from nexus.metrics.recorder import MetricsRecorder
from nexus.metrics.types import MetricType

recorder = MetricsRecorder()

# Baseline: Simulate request without metrics
def simulate_request_no_metrics():
    time.sleep(0.01)  # 10ms request

# With metrics: Simulate request with metrics recording
def simulate_request_with_metrics():
    with recorder.time(MetricType.REQUEST_DURATION, labels={"endpoint": "/test"}):
        time.sleep(0.01)  # 10ms request

# Benchmark both
iterations = 1000

# Baseline timing
start = time.perf_counter()
for _ in range(iterations):
    simulate_request_no_metrics()
baseline_total = time.perf_counter() - start

# With metrics timing
start = time.perf_counter()
for _ in range(iterations):
    simulate_request_with_metrics()
metrics_total = time.perf_counter() - start

# Calculate overhead
overhead_ms = (metrics_total - baseline_total) / iterations * 1000
overhead_percent = (metrics_total - baseline_total) / baseline_total * 100

print(f"✅ Performance overhead validation:")
print(f"   Baseline avg: {baseline_total/iterations*1000:.3f}ms")
print(f"   With metrics avg: {metrics_total/iterations*1000:.3f}ms")
print(f"   Overhead per request: {overhead_ms:.3f}ms")
print(f"   Overhead percentage: {overhead_percent:.2f}%")

assert overhead_percent < 1.0, f"Overhead {overhead_percent:.2f}% exceeds 1% target!"
print("\n✅ PASS: Overhead is less than 1%")
```

**Expected Output**:
```
✅ Performance overhead validation:
   Baseline avg: 10.123ms
   With metrics avg: 10.145ms
   Overhead per request: 0.022ms
   Overhead percentage: 0.22%

✅ PASS: Overhead is less than 1%
```

---

## Validation Checklist

After running all scenarios:

- [ ] Metrics recording works for all types (LLM, cache, workflow, agent, error)
- [ ] Time context manager records accurate durations
- [ ] REST API `/api/v1/metrics` returns filtered results
- [ ] REST API supports time-range filtering
- [ ] REST API supports label filtering
- [ ] Summary endpoint `/api/v1/metrics/summary` returns counts
- [ ] Prometheus endpoint `/metrics` returns OpenMetrics format
- [ ] Workflow and activity metrics track execution timing
- [ ] Error metrics include correlation IDs
- [ ] Performance overhead is less than 1%

---

## Running the Full Test Suite

```bash
# Run all tests
make test-all

# Run only metrics tests
pytest tests/unit/metrics/ -v
pytest tests/integration/metrics/ -v

# Run performance tests
pytest tests/performance/metrics/ -v

# Run with coverage
pytest tests/ --cov=src/nexus/metrics --cov-report=html
```

---

## Troubleshooting

**Issue**: Metrics not appearing in query results
- **Solution**: Check time range - default queries last 24 hours only

**Issue**: Prometheus endpoint returns empty metrics
- **Solution**: Ensure `prometheus-client` is installed and metrics are being recorded

**Issue**: High memory usage
- **Solution**: Reduce retention period via `NEXUS_METRICS_RETENTION_SECONDS`

**Issue**: Query performance degrades
- **Solution**: Increase specificity with label filters, reduce time range

---

## Next Steps

After validating the quickstart:
1. Run full integration test suite
2. Validate Prometheus scraping with Grafana
3. Run load tests for overhead validation
4. Ready for production deployment
