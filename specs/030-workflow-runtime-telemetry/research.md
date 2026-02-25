# Research: Workflow Runtime Telemetry Implementation

| Field | Value |
|-------|-------|
| **Date** | 2026-02-17 |
| **Feature** | 030-workflow-runtime-telemetry |
| **Phase** | 0 (Research & Decision Documentation) |

This document consolidates research findings for all technical unknowns identified in the implementation plan. Each section follows the Decision → Rationale → Alternatives → Implementation Notes format.

---

## 1. Segment Python SDK Integration Patterns

### Decision

Use **WorkerRegistry singleton pattern** for Segment Analytics Python SDK integration, following existing Nexus convention for Temporal Worker resources.

### Rationale

1. **SDK Architecture**: Segment Python SDK uses threading-based asynchronous operations (not native async/await), with background thread for event batching and transmission
2. **Performance**: Single client instance = single background thread; creating clients per-request would create thread-per-request (memory leak)
3. **Temporal Context**: Telemetry interceptors run inside Temporal Worker context, NOT FastAPI router context. FastAPI dependency injection is unavailable in this scope.
4. **Existing Pattern**: Nexus already uses singleton registry pattern for WorkerRegistry (see `src/nexus/workflows/workflow_engine/services/temporal_worker.py:202-213`)
5. **Lifecycle Management**: Registry initialization at Temporal Worker startup, graceful shutdown on worker termination
6. **Thread Safety**: SDK is thread-safe and designed for high-throughput concurrent access
7. **Testability**: Registry replacement pattern allows mocking in tests

### Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Lazy Initialization** | No startup cost | Race conditions, unpredictable init time, multiple threads possible | ❌ Rejected |
| **Request-Scoped Client** | Isolated per request | Creates thread per request, memory leak | ❌ Never use |
| **Global Singleton (non-registry)** | Simple | Not testable, tight coupling | ❌ Rejected |
| **WorkerRegistry Pattern** | Testable, follows Nexus convention, thread-safe | Slightly more complex than global singleton | ✅ Selected |
| **FastAPI DI** | Works for API routes | Doesn't work in Temporal Worker context (interceptors not in FastAPI scope) | ❌ Wrong context |
| **BuildKit Secrets (runtime)** | No key in image | More complex, not zero-config | ⏸️ Future (GA release) |

### Implementation Notes

```python
# client.py - Singleton Registry Pattern (matches WorkerRegistry pattern)
from segment.analytics import Client
from typing import Optional
import threading
import atexit

class TelemetryClientRegistry:
    """Singleton registry for Segment Analytics client (thread-safe)."""

    _instance: Optional['TelemetryClientRegistry'] = None
    _lock: threading.Lock = threading.Lock()
    _client: Optional[Client] = None

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:  # Double-check locking
                    cls._instance = super().__new__(cls)
        return cls._instance

    def initialize(self, segment_write_key: str) -> None:
        """Initialize Segment client (call once at worker startup)."""
        if self._client is not None:
            return  # Already initialized

        with self._lock:
            if self._client is None:
                self._client = Client(
                    write_key=segment_write_key,
                    gzip=True,  # Enable compression (70-80% bandwidth savings)
                    max_queue_size=20000,
                    max_retries=10,
                    timeout=30,
                    upload_interval=0.5,  # Flush every 500ms
                    upload_size=100,  # Batch size
                    on_error=self._error_handler,
                )

    def get_client(self) -> Client:
        """Get initialized client instance (called from interceptors)."""
        if self._client is None:
            raise RuntimeError("TelemetryClientRegistry not initialized")
        return self._client

    def shutdown(self) -> None:
        """Flush and shutdown client (call at worker shutdown)."""
        if self._client:
            self._client.flush()  # BLOCKING - waits for queue to empty
            self._client = None

    def _error_handler(self, error, items):
        """Handle Segment SDK errors (fire-and-forget, log only)."""
        # Log error without raising
        pass

# temporal_worker.py - Worker initialization (NOT FastAPI)
def init_worker():
    """Initialize Temporal Worker with telemetry."""
    # Initialize telemetry client registry
    registry = TelemetryClientRegistry()
    registry.initialize(settings.segment_write_key)

    # Register shutdown hook
    atexit.register(registry.shutdown)

    # Continue with worker setup...
```

**Key Configuration**:
- `gzip=True`: Mandatory (reduces bandwidth by 70-80%)
- `sync_mode=False`: Default (async threading) - set to True if using Celery
- `upload_size=100`: Default is optimal for most workloads
- `upload_interval=0.5`: Reduce to 0.3 for lower latency, increase to 1.0 for fewer API calls

**Async Compatibility Note**: SDK is NOT async/await compatible (uses threading). Calls like `track()` are non-blocking via internal queue but not awaitable. This is acceptable for fire-and-forget telemetry.

---

## 2. Workflow Execution Interception Points

### Decision

Use **Temporalio Workflow Interceptors** at two levels:
1. **Workflow-level interceptor** for workflow start/end events
2. **Activity-level interceptor** for activity execution events

> **Future Enhancement**: Event Stream integration via ActivitySyncService for historical event telemetry (out of scope for MVP)

### Rationale

1. **Existing Pattern**: Nexus already implements `MonitoringWorkflowInterceptor` demonstrating the pattern
2. **Non-Invasive**: Interceptors hook into execution without modifying core business logic
3. **Access to Metadata**: Interceptors provide access to execution_id, workflow_id, activity details
4. **Separation of Concerns**: Telemetry isolated from workflow engine internals
5. **Multiple Hook Points**: Can capture start, end, success, failure, and intermediate events

### Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Workflow Interceptors** | Non-invasive, existing pattern | Requires Temporal worker registration | ✅ Selected |
| **Direct Code Instrumentation** | Simple | Violates separation of concerns, scattered telemetry | ❌ Rejected |
| **Temporal Queries** | Read-only, no performance impact | Cannot capture events in real-time | ⏸️ Supplementary |
| **Event Stream Only** | Centralized | Misses in-workflow context | ⏸️ Supplementary |

### Implementation Notes

**File Structure**:
```
/src/nexus/telemetry/interceptors/
  ├── __init__.py
  ├── workflow_interceptor.py   # NEW
  └── activity_interceptor.py   # NEW
```

**Workflow Interceptor Pattern**:
```python
# workflow_interceptor.py
from temporalio.worker import WorkflowInboundInterceptor, Interceptor
from temporalio import workflow

class TelemetryWorkflowInboundInterceptor(WorkflowInboundInterceptor):
    async def execute_workflow(self, input: ExecuteWorkflowInput) -> Any:
        # Extract metadata
        execution_id = input.args[1] if len(input.args) >= 2 else None
        workflow_id = workflow.info().workflow_id

        # Emit: "Workflow Execution Started"
        start_time = workflow.now()

        try:
            result = await super().execute_workflow(input)
            end_time = workflow.now()
            # Emit: "Workflow Execution Completed" (status: success)
            return result
        except Exception as e:
            end_time = workflow.now()
            # Emit: "Workflow Execution Completed" (status: failed)
            raise

class TelemetryWorkflowInterceptor(Interceptor):
    def workflow_interceptor_class(self, input):
        return TelemetryWorkflowInboundInterceptor
```

**Registration** (in `/src/nexus/workflows/workflow_engine/services/temporal_worker.py`):
```python
self.worker = Worker(
    self.client,
    task_queue=self.task_queue,
    workflows=[DynamicWorkflow],
    activities=[...],
    interceptors=[
        MonitoringWorkflowInterceptor(),
        TelemetryWorkflowInterceptor(),  # ADD THIS
    ],
)
```

**Key Interception Points**:
- **Workflow Start**: `execute_workflow()` method entry
- **Workflow End**: `execute_workflow()` method return
- **Workflow Failure**: `execute_workflow()` exception handler
- **Activity Execution**: `execute_activity()` in Activity interceptor

**Event Extraction**:
- `input.args[1]` → execution_id (from DynamicWorkflow signature)
- `workflow.info().workflow_id` → Temporal workflow ID
- `workflow.now()` → Temporal-controlled time (for determinism)

**Correlation ID Propagation Between Interceptors**:

The workflow interceptor and activity interceptor are separate classes that must share the same `correlation_id` for all events within a single workflow execution. The mechanism uses **Temporal workflow memo**:

1. **Workflow interceptor generates** `correlation_id = str(uuid.uuid4())` at workflow start
2. **Stores in memo** via `workflow.upsert_memo({"telemetry_correlation_id": correlation_id})`
3. **Activity interceptor reads** from `activity.info().workflow_memo.get("telemetry_correlation_id")`
4. **Workflow completion** reuses the same `correlation_id` from the local variable in the interceptor's `execute_workflow()` scope

```python
# Workflow interceptor: generates and stores correlation_id
async def execute_workflow(self, input: ExecuteWorkflowInput) -> Any:
    correlation_id = str(uuid.uuid4())
    workflow.upsert_memo({"telemetry_correlation_id": correlation_id})
    # ... emit start event with correlation_id ...
    result = await super().execute_workflow(input)
    # ... emit complete event with same correlation_id ...
    return result

# Activity interceptor: reads correlation_id from memo
async def execute_activity(self, input: ExecuteActivityInput) -> Any:
    workflow_memo = activity.info().workflow_memo
    correlation_id = workflow_memo.get("telemetry_correlation_id")
    # ... emit activity event with same correlation_id ...
    return await super().execute_activity(input)
```

This ensures all events (start, activity executions, completion) share the same `correlation_id` without coupling the interceptors directly. The TelemetryCollector receives `correlation_id` as a parameter — it does not generate it.

---

## 3. Build-Time Secret Injection for Container Images

### Decision

Use **Dockerfile ARG → ENV pattern** for embedding Segment write API key at build time, stored in private container registry only.

### Rationale

1. **Spec Requirement**: "Segment write API key will be injected at container image build time for zero-configuration deployment"
2. **Write-Only Key Security**: Segment write keys have limited blast radius (can only send data, not read/modify/delete)
3. **Industry Practice**: Common pattern for server-side telemetry SDKs (OpenTelemetry, Datadog, New Relic)
4. **Operational Simplicity**: No runtime secret management infrastructure required for MVP
5. **Container Security**: Private registry access controls limit exposure surface

### Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **ARG → ENV (Build-Time)** | Zero-config, simple | Key in image layers, requires rebuild for rotation | ✅ Selected for MVP |
| **BuildKit Secrets** | Not in history/layers | Still in final layer, marginal improvement for write-only keys | ⏸️ Minor benefit |
| **Runtime Injection (K8s Secrets)** | No key in image, easy rotation | Not zero-config, needs secret management | ⏸️ Future (GA release) |

### Implementation Notes

**Dockerfile**:
```dockerfile
# containers/nexus/Containerfile
FROM registry.access.redhat.com/ubi9/python-312:latest

# Build-time argument for Segment write key
# SECURITY NOTE: This is a WRITE-ONLY API key for telemetry.
# Key is embedded in image for zero-configuration deployment.
# Image must be stored in PRIVATE registry only.
# Rotation schedule: Every 90 days (requires image rebuild).
ARG SEGMENT_WRITE_KEY

# Make key available at runtime
ENV NEXUS_SEGMENT_WRITE_KEY=${SEGMENT_WRITE_KEY}

# ... rest of Dockerfile ...
```

**Build Command**:
```bash
# Local development
docker build \
  --build-arg SEGMENT_WRITE_KEY="${NEXUS_SEGMENT_WRITE_KEY}" \
  -t localhost/nexus:latest \
  -f containers/nexus/Containerfile .

# CI/CD (GitHub Actions)
docker build \
  --build-arg SEGMENT_WRITE_KEY="${{ secrets.SEGMENT_WRITE_KEY }}" \
  -t ghcr.io/syntara-orchestration/syntara:latest \
  -f containers/nexus/Containerfile .
```

**Security Checklist**:
- ✅ **Private Registry Only**: Never push to public registries (ghcr.io with authentication)
- ✅ **Image Scanning**: CI includes Trufflehog for secret detection
- ✅ **Access Controls**: Container registry uses GitHub team permissions (RBAC)
- ✅ **Key Rotation**: 90-day schedule documented in runbook
- ✅ **User Disclosure**: Terms of service document telemetry collection (FR-014)
- ✅ **Write-Only Key**: Clearly labeled in all documentation
- ✅ **Graceful Degradation**: Application functions normally if key invalid/missing

**Key Rotation Process**:
1. Generate new write key in Segment dashboard
2. Rebuild image with new ARG value
3. Push to private registry
4. Deploy updated image
5. Verify new key active via telemetry logs
6. Revoke old key (after 24-48hr grace period)

**Risk Mitigation**:
- Primary risk: Spoofed telemetry data (not data breach)
- Detection: Monitor for anomalous event patterns
- Response: Rotate key, investigate source

---

## 4. Workflow Telemetry Event Schema Design

### Decision

Use **JSON Schema Draft 2020-12** with:
- **snake_case** property names (Segment standard, warehouse compatibility)
- **Additive-only schema evolution** (backward compatibility)
- **Exact durations only** (`duration_ms` for percentile calculations)
- **Parameter type extraction** (JSON Schema format, no values)

### Rationale

1. **Segment Standard**: snake_case for properties aligns with Segment warehouse schemas
2. **Modern Standard**: Draft 2020-12 is LTS, supports `unevaluatedProperties` for strict validation
3. **Backward Compatibility**: Additive-only evolution prevents breaking changes
4. **Analytics**: Exact `duration_ms` enables percentile calculations; Segment-provided timestamps handle event ordering
5. **Type Safety**: JSON Schema validation catches malformed events before transmission

### Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **snake_case properties** | Segment standard, warehouse compatibility | - | ✅ Selected |
| **camelCase properties** | JavaScript convention | Inconsistent with data warehouses | ❌ Rejected |
| **JSON Schema 2020-12** | Modern, strict validation | - | ✅ Selected |
| **JSON Schema Draft-07** | Widely supported | Less strict, older | ⏸️ Acceptable fallback |
| **Exact durations only (`duration_ms`)** | Simple, enables percentiles | - | ✅ Selected |
| **Bucketed durations only** | Privacy-friendly | Cannot calculate percentiles | ❌ Rejected |
| **Both exact + bucketed** | Best of both worlds | Unnecessary redundancy; `duration_ms` sufficient for analytics | ❌ Rejected (simplified) |

### Implementation Notes

**Event Naming Convention**:
- Event names: **Title Case with spaces** (e.g., "Workflow Execution Completed")
- Property names: **snake_case** (e.g., `correlation_id`, `duration_ms`)

**Versioning Strategy**:
- **PATCH** (1.0.0 → 1.0.1): Add optional fields
- **MINOR** (1.0.1 → 1.1.0): Add required fields with defaults
- **MAJOR** (1.1.0 → 2.0.0): Breaking changes (avoid, requires parallel schema support)

---

## 5. Async Telemetry Performance Monitoring

### Decision

Use **custom async benchmarking framework** with pytest-asyncio for:
- **Baseline vs instrumented comparison** (with/without telemetry)
- **`time.perf_counter()` for high-resolution timing**
- **Percentile metrics** (p50, p95, p99) in addition to averages
- **Multiple test scenarios** (small/large/concurrent workflows)

### Rationale

1. **pytest-benchmark Limitation**: No native async/await support as of 2026
2. **Existing Patterns**: Nexus codebase already uses `MemoryMonitor` and async performance tests
3. **Precision**: `time.perf_counter()` provides highest resolution for benchmarking
4. **Statistical Rigor**: Multiple iterations + percentiles reduce variance
5. **Realistic Scenarios**: Test across workflow sizes and execution patterns

### Alternatives Considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **Custom Async Benchmarking** | Full control, Temporal integration | Maintain custom code | ✅ Selected |
| **pytest-benchmark** | Rich features, statistical analysis | No async support | ❌ Incompatible |
| **Simple timing** | Easy | No statistical rigor | ❌ Insufficient |
| **Production monitoring only** | Real-world data | Too late to catch regressions | ⏸️ Supplementary |

### Implementation Notes

**Overhead Calculation Methodology**:
```python
# Formula
overhead_pct = ((telemetry_duration - baseline_duration) / baseline_duration) * 100

# Acceptance Criteria (SC-002)
assert overhead_pct < 5.0, f"Overhead {overhead_pct:.2f}% exceeds 5% limit"
```

**Test Scenario Design**:
1. **Small Workflows** (1-5 nodes): Validate minimal overhead for simple workflows
2. **Large Workflows** (50+ nodes): Ensure overhead doesn't scale proportionally
3. **Concurrent Executions** (10+ parallel workflows): Test under load

**Timing Instrumentation**:
```python
import time

# Baseline measurement
start = time.perf_counter()
await execute_workflow_without_telemetry()
baseline_duration = time.perf_counter() - start

# Telemetry-enabled measurement
start = time.perf_counter()
await execute_workflow_with_telemetry()
telemetry_duration = time.perf_counter() - start

# Calculate overhead
overhead_pct = ((telemetry_duration - baseline_duration) / baseline_duration) * 100
```

**Memory Monitoring** (adapted from existing pattern):
```python
import psutil
import asyncio

class MemoryMonitor:
    def __init__(self):
        self.process = psutil.Process()
        self.baseline_mb = self.process.memory_info().rss / 1024 / 1024
        self.peak_mb = self.baseline_mb

    async def start_monitoring(self):
        self.monitoring = True
        async def monitor():
            while self.monitoring:
                current_mb = self.process.memory_info().rss / 1024 / 1024
                self.peak_mb = max(self.peak_mb, current_mb)
                await asyncio.sleep(0.1)
        self.task = asyncio.create_task(monitor())

    async def stop_monitoring(self) -> float:
        self.monitoring = False
        await self.task
        return self.peak_mb - self.baseline_mb
```

**Performance Test Structure**:
```python
# /tests/performance/telemetry/test_overhead.py
@pytest.mark.asyncio
@pytest.mark.performance
async def test_workflow_telemetry_overhead(workflow_environment):
    """Validate SC-002: <5% telemetry overhead."""

    workflow_def = {...}
    iterations = 20

    # Baseline measurements (telemetry client mocked to no-op)
    baseline_durations = []
    for _ in range(iterations):
        start = time.perf_counter()
        await execute_workflow()  # with TelemetryClientRegistry mocked
        baseline_durations.append(time.perf_counter() - start)

    # Telemetry-enabled measurements (real interceptors active)
    telemetry_durations = []
    for _ in range(iterations):
        start = time.perf_counter()
        await execute_workflow()  # with real TelemetryClientRegistry
        telemetry_durations.append(time.perf_counter() - start)

    # Calculate overhead
    baseline_avg = sum(baseline_durations) / len(baseline_durations)
    telemetry_avg = sum(telemetry_durations) / len(telemetry_durations)
    overhead_pct = ((telemetry_avg - baseline_avg) / baseline_avg) * 100

    # Validate SC-002
    assert overhead_pct < 5.0
```

**Continuous Monitoring**:
1. **PR-level**: Run performance tests on telemetry code changes
2. **Weekly**: Scheduled regression detection (compare against baseline)
3. **Production**: Export telemetry metrics to Segment (dogfooding)

**Regression Detection**:
- Store baseline metrics in `baseline_metrics.json`
- Fail CI if overhead increases >10% from baseline
- Update baseline when performance improves

---

## Summary of Decisions

| Area | Decision | Key Benefit |
|------|----------|-------------|
| **SDK Integration** | Application startup singleton with DI | Single background thread, testable, thread-safe |
| **Interception Points** | Temporal workflow/activity interceptors | Non-invasive, existing pattern, access to metadata |
| **Secret Injection** | ARG → ENV at build time | Zero-config deployment, acceptable for write-only keys |
| **Event Schema** | JSON Schema 2020-12, snake_case, additive evolution | Segment standard, validation, backward compatibility |
| **Performance Testing** | Custom async benchmarking with percentiles | Async support, statistical rigor, realistic scenarios |

---

## Next Steps

1. **Proceed to Phase 1**: Generate data models, contracts, and quickstart guide
2. **Implement Decisions**: Follow patterns documented in this research
3. **Validate Assumptions**: Run Phase 1 design validation before implementation
4. **Update Agent Context**: Run `.specify/scripts/bash/update-agent-context.sh claude`

---

## References

### Segment SDK
- [Analytics for Python | Segment Documentation](https://segment.com/docs/connections/sources/catalog/libraries/server/python/)
- [GitHub - segmentio/analytics-python](https://github.com/segmentio/analytics-python)

### Temporal Interceptors
- Existing codebase: `/src/nexus/workflows/workflow_engine/interceptors/monitoring_interceptor.py`
- Temporal documentation on interceptors

### Container Security
- [SecretsUsedInArgOrEnv | Docker Docs](https://docs.docker.com/reference/build-checks/secrets-used-in-arg-or-env/)
- [Container Security Best Practices 2026](https://accuknox.com/blog/container-security)

### JSON Schema
- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12/release-notes)
- [Clean Naming Conventions for Analytics | Segment](https://segment.com/academy/collecting-data/naming-conventions-for-clean-data/)

### Performance Testing
- [Benchmark Python with time.perf_counter()](https://superfastpython.com/benchmark-time-perf_counter/)
- [Testing async, asyncio, and performance](https://www.obeythetestinggoat.com/testing-async-asyncio-and-performance.html)
