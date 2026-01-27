# Quickstart: Extend Metrics Collection for All Nexus Components

**Feature**: 027-nexus-component-performance-kpi
**Purpose**: Validate this implementation matches the specification

## Overview

This quickstart demonstrates component metrics instrumentation and endpoint usage through practical scenarios. It validates that the implementation correctly:

- Records metrics directly to MetricsRecorder with component labels
- Exposes component-specific endpoints that filter the unified store
- Supports filtering by component, metric type, and time range

## Test Scenario 1: Component Metrics Instrumentation

**Acceptance Criteria**: FR-001, FR-002, FR-003
> Components MUST record metrics directly to MetricsRecorder with component labels

```python
from nexus.metrics.recorder import MetricsRecorder
from nexus.metrics.types import MetricType

# Setup
recorder = MetricsRecorder(retention_seconds=3600)

# Example: API Service recording request duration
@app.get("/api/v1/chat")
async def chat_endpoint():
    with recorder.time(
        MetricType.API_RESPONSE_TIME,
        labels={
            "component": "api_service",  # REQUIRED
            "endpoint": "/api/v1/chat",
            "method": "GET"
        }
    ):
        result = await process_chat_request()
        return result

# Example: Recording error count
if error_occurred:
    recorder.record(
        MetricType.API_ERROR_RATE,
        value=1,
        labels={
            "component": "api_service",  # REQUIRED
            "status_code": "500"
        }
    )

# Verify metrics recorded with component labels
api_metrics = list(recorder.query(
    labels={"component": "api_service"}
))
assert len(api_metrics) > 0, "No metrics recorded for api_service"
assert all("component" in m.labels for m in api_metrics), "All metrics must have component label"
print(f"✅ Recorded {len(api_metrics)} metrics from api_service")
```

**Expected Output**:
```
✅ Recorded 15 metrics from api_service
```

---

## Test Scenario 2: Component Metrics Endpoint Query

**Acceptance Criteria**: FR-004, FR-005, FR-006
> Component endpoints MUST filter the unified store by component label

```python
import httpx
from datetime import datetime, timedelta

# Query API Service metrics endpoint (GET request)
async def query_component_metrics():
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "http://localhost:8000/api/v1/api_service/metrics",
            params={
                "type": "api_response_time_ms",
                "start_time": (datetime.utcnow() - timedelta(minutes=5)).isoformat(),
                "end_time": datetime.utcnow().isoformat(),
                "limit": 20
            }
        )
        return response.json()

result = asyncio.run(query_component_metrics())

# Verify response format (same as unified endpoint)
assert "resources" in result
assert len(result["resources"]) > 0

# Verify all metrics have component label and are from api_service
for metric in result["resources"]:
    assert "component" in metric["labels"]
    assert metric["labels"]["component"] == "api_service"
    assert metric["metricType"] == "api_response_time_ms"

# Verify equivalent to unified endpoint with component filter
unified_response = await httpx.AsyncClient().get(
    "http://localhost:8000/api/v1/metrics",
    params={
        "labels": {"component": "api_service"},
        "type": "api_response_time_ms",
        "start_time": (datetime.utcnow() - timedelta(minutes=5)).isoformat(),
        "end_time": datetime.utcnow().isoformat(),
        "limit": 20
    }
)
unified_result = unified_response.json()
assert unified_result["resources"] == result["resources"], "Component endpoint should match unified endpoint with component filter"

print(f"✅ Queried {len(result['resources'])} metrics from API Service endpoint")
```

**Expected Output**:
```
✅ Queried 20 metrics from API Service endpoint
```

---

## Test Scenario 3: Metrics Query with Filtering

**Acceptance Criteria**: FR-006, FR-007
> Component metrics endpoints MUST support the same query parameters as unified endpoint (metric type, time range, limit, cursor)

```python
import httpx
from datetime import datetime, timedelta

# Query component metrics endpoint
async def query_metrics():
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "http://localhost:8000/api/v1/invocation_service/metrics",
            params={
                "type": "invocation_e2e_duration_ms",
                "start_time": (datetime.utcnow() - timedelta(minutes=10)).isoformat(),
                "end_time": datetime.utcnow().isoformat(),
                "limit": 50
            }
        )
        return response.json()

result = asyncio.run(query_metrics())

# Verify metrics include component metrics
assert "resources" in result
metrics = result["resources"]

# Verify filtering works
invocation_metrics = [m for m in metrics if m["labels"]["component"] == "invocation_service"]
assert len(invocation_metrics) > 0

print(f"✅ Metrics query returned {len(metrics)} metrics")
print(f"   - Invocation Service: {len(invocation_metrics)}")
```

**Expected Output**:
```
✅ Metrics query returned 50 metrics
   - Invocation Service: 50
```

---

## Test Scenario 4: Component Label Validation

**Acceptance Criteria**: FR-002
> All metrics MUST include component label with valid component value

```python
from nexus.metrics.recorder import MetricsRecorder
from nexus.metrics.types import MetricType

recorder = MetricsRecorder()

# Valid: Component label included
recorder.record(
    MetricType.API_RESPONSE_TIME,
    value=150.5,
    labels={"component": "api_service"}  # Valid component
)

# Invalid: Missing component label (should be caught by validation)
try:
    recorder.record(
        MetricType.API_RESPONSE_TIME,
        value=150.5,
        labels={}  # Missing component label
    )
    assert False, "Should have raised validation error"
except ValueError as e:
    print(f"✅ Validation caught missing component label: {e}")

# Invalid: Invalid component value (should be caught by validation)
try:
    recorder.record(
        MetricType.API_RESPONSE_TIME,
        value=150.5,
        labels={"component": "invalid_component"}  # Invalid component
    )
    assert False, "Should have raised validation error"
except ValueError as e:
    print(f"✅ Validation caught invalid component: {e}")

print("✅ Component label validation working")
```

**Expected Output**:
```
✅ Validation caught missing component label: Component label required
✅ Validation caught invalid component: Invalid component label value
✅ Component label validation working
```

---

## Test Scenario 5: Recording Overhead Validation

**Acceptance Criteria**: NFR-001, NFR-002
> Metrics recording MUST add less than 1% overhead and be asynchronous

```python
import time
from nexus.metrics.recorder import MetricsRecorder
from nexus.metrics.types import MetricType

recorder = MetricsRecorder()

# Measure baseline operation time
def baseline_operation():
    time.sleep(0.001)  # Simulate 1ms operation

# Measure operation time with metrics recording
def operation_with_recording():
    start = time.perf_counter()
    baseline_operation()
    # Record metric (should be async, non-blocking)
    recorder.record(
        MetricType.API_RESPONSE_TIME,
        value=1.0,
        labels={"component": "api_service"}
    )
    return time.perf_counter() - start

# Run measurements
baseline_time = time.perf_counter()
for _ in range(1000):
    baseline_operation()
baseline_total = time.perf_counter() - baseline_time

recording_time = time.perf_counter()
for _ in range(1000):
    operation_with_recording()
recording_total = time.perf_counter() - recording_time

# Calculate overhead
overhead_percent = ((recording_total - baseline_total) / baseline_total) * 100

assert overhead_percent < 1.0, f"Overhead {overhead_percent}% exceeds 1% threshold"
print(f"✅ Recording overhead: {overhead_percent:.2f}% (< 1% threshold)")
```

**Expected Output**:
```
✅ Recording overhead: 0.35% (< 1% threshold)
```

---

## Test Scenario 6: Time-Range Query for Performance Testing

**Acceptance Criteria**: FR-007, FR-024, FR-025
> Component metrics endpoints MUST support time-range queries (same as unified endpoint)

```python
import httpx
from datetime import datetime, timedelta

# Define performance test evaluation period
test_start = datetime.utcnow() - timedelta(minutes=5)
test_end = datetime.utcnow()

# Query component metrics for evaluation period
async def query_test_period_metrics():
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "http://localhost:8000/api/v1/api_service/metrics",
            params={
                "type": "api_response_time_ms",
                "start_time": test_start.isoformat(),
                "end_time": test_end.isoformat(),
                "limit": 1000
            }
        )
        return response.json()

result = asyncio.run(query_test_period_metrics())

# Verify all metrics are within time range
metrics = result["resources"]
for metric in metrics:
    metric_time = datetime.fromisoformat(metric["createdAt"].replace("Z", "+00:00"))
    assert test_start <= metric_time <= test_end

# Calculate percentiles for KPI evaluation
response_times = [m["value"] for m in metrics if m["metricType"] == "api_response_time_ms"]
if response_times:
    response_times.sort()
    p50 = response_times[len(response_times) // 2]
    p95 = response_times[int(len(response_times) * 0.95)]
    p99 = response_times[int(len(response_times) * 0.99)]

    print(f"✅ Performance test metrics:")
    print(f"   - Total metrics: {len(metrics)}")
    print(f"   - Response time p50: {p50:.2f}ms")
    print(f"   - Response time p95: {p95:.2f}ms")
    print(f"   - Response time p99: {p99:.2f}ms")
```

**Expected Output**:
```
✅ Performance test metrics:
   - Total metrics: 450
   - Response time p50: 145.23ms
   - Response time p95: 198.45ms
   - Response time p99: 225.67ms
```

---

## Summary

All test scenarios validate the component metrics instrumentation and endpoint system:

1. ✅ **Component Instrumentation**: Components record metrics directly to MetricsRecorder with component labels
2. ✅ **Component Endpoints**: Component endpoints provide GET access to metrics filtered by component label (components record directly using `recorder.record()` and `recorder.time()` calls)
3. ✅ **Filtering**: Filter by component, metric type, time range
4. ✅ **Label Validation**: Component labels are validated (required and must be valid component value)
5. ✅ **Performance**: Recording overhead < 1%
6. ✅ **Time-Range Queries**: Support for performance test evaluation periods

The system successfully extends spec 025 to capture metrics from all 9 component categories. Components record metrics directly to MetricsRecorder using `recorder.record()` and `recorder.time()` calls (same pattern as spec 025). Component endpoints (`/api/v1/{component}/metrics`) provide GET access to metrics filtered by component label. External tools (Locust, RAGAS, Guidellm) access metrics via GET requests but are completely independent and separate from Nexus.
