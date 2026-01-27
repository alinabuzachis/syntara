# Research: Extend Metrics Collection for All Nexus Components

**Date**: 2026-01-21
**Feature**: 027-nexus-component-performance-kpi

## Research Questions

This document consolidates research findings for technical decisions required to extend metrics collection to all Nexus components.

## Context

This feature extends the existing MetricsRecorder class from spec 025-llm-agent-performance-kpis to add metrics collection capabilities for all 9 Nexus component categories.

Key principles:
- Metrics recording must add <1% overhead to component operations
- Recording must be asynchronous and non-blocking
- Metrics available immediately after recording

## 1. External Performance Testing Tools

### Note on External Tools

**Locust, RAGAS, and Guidellm** are external performance testing tools that are completely independent and separate from MetricsRecorder metrics collection. They are not integrated into Nexus.

- **Locust**: External load testing tool.
- **RAGAS**: External quality metrics evaluation tool.
- **Guidellm**: External LLM evaluation tool.

**Note**: Component metrics endpoints (`/api/v1/{component}/metrics`) expose metrics via GET for external tools, filtering MetricsRecorder by component label. Components record metrics directly using `recorder.record()` and `recorder.time()` calls (same pattern as spec 025). External performance testing tools access metrics via GET requests but are completely separate from Nexus and do not interact directly with MetricsRecorder.

These tools are mentioned here for context but are not part of this feature's implementation scope.

## 2. Component Metrics Instrumentation Pattern

### Decision
Components record metrics directly to MetricsRecorder using `recorder.record()` and `recorder.time()` calls with component labels, following the same pattern as spec 025.

**Note**: Spec 025 implements GET endpoints (`GET /api/v1/metrics`, `GET /api/v1/metrics/summary`, `GET /metrics`) and components record metrics directly using `recorder.record()` and `recorder.time()` method calls. Spec 027 extends this by:
1. Adding component-specific GET endpoints (`GET /api/v1/{component}/metrics`) that filter by component label
2. Requiring all metrics to include component labels for filtering

### Rationale
- Components record metrics directly using `recorder.record()` and `recorder.time()` calls
- Component-specific GET endpoints provide convenient filtering for external tools
- Unified storage in MetricsRecorder simplifies querying

### Implementation Pattern

#### Direct Recording
```python
# File: src/nexus/api/v1/example.py
from nexus.metrics.recorder import MetricsRecorder
from nexus.metrics.types import MetricType

recorder = MetricsRecorder()  # Or get from dependency injection

# Example: API Service recording request duration
@app.get("/api/v1/example")
async def example_endpoint():
    with recorder.time(
        MetricType.API_RESPONSE_TIME,
        labels={
            "component": "api_service",  # REQUIRED component label
            "endpoint": "/api/v1/example",
            "method": "GET"
        }
    ):
        result = await process_request()
        return result

# Example: Recording error count
if error_occurred:
    recorder.record(
        MetricType.API_ERROR_RATE,
        value=1,
        labels={
            "component": "api_service",  # REQUIRED component label
            "status_code": "500"
        }
    )
```

#### GET: Querying Metrics (for External Tools)
```python
@router.get("/{component}/metrics")
async def get_component_metrics(
    component: str,
    metric_type: Optional[str] = None,
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    limit: int = 20,
    recorder: MetricsRecorder = Depends(get_recorder)
):
    """Get metrics for a specific component - for external tools."""
    # Filter by component label
    labels = {"component": component}
    metrics = recorder.query(
        metric_type=metric_type,
        start_time=start_time,
        end_time=end_time,
        labels=labels
    )
    return {"resources": [m.to_dict() for m in list(metrics)[:limit]]}
```

### Component Label Requirements
- All metrics recorded via `recorder.record()` and `recorder.time()` MUST include `component` label
- Component label validation ensures all metrics are properly categorized
- GET requests filter by component label when querying MetricsRecorder

### Alternatives Considered
- **Direct recording in component code**: Rejected - endpoints provide clear API boundary
- **Separate metrics stores per component**: Rejected - unified store simplifies querying
- **Push via message queue**: Rejected - HTTP endpoints sufficient and standard


## Summary

All research questions resolved with concrete technical decisions:

1. ✅ **Component Instrumentation**: Components record metrics directly to MetricsRecorder using `recorder.record()` and `recorder.time()` calls with component labels (same pattern as spec 025)
2. ✅ **Metrics Storage**: Components record directly to existing MetricsRecorder unified store (from spec 025)
3. ✅ **Component Endpoints**: NEW GET endpoints (`/api/v1/{component}/metrics`) filter MetricsRecorder by component label for external tools
4. ✅ **External Tools Access**: External tools GET metrics from component endpoints or unified endpoint for performance testing

These decisions support all functional requirements while maintaining the <1% overhead constraint and consistency with spec 025's direct recording pattern.

## Next Steps

1. Create data-model.md with MetricType extensions and component label requirements
2. Define API contracts for component metrics endpoints (POST for recording, GET for querying)
3. Write failing unit and integration tests for component instrumentation and endpoints
4. Create quickstart.md validation scenarios for component metrics recording and endpoint queries
