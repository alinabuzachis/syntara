# Data Model: Extend Metrics Collection for All Nexus Components

**Feature**: 027-nexus-component-performance-kpi
**Date**: 2026-01-21

## Overview

This document defines the data model extensions for metrics collection from all Nexus components. This feature extends the existing MetricsRecorder class and MetricType enum from spec 025-llm-agent-performance-kpis to support collection from all 9 component categories.

The system uses:
1. **Extended MetricType enum** with component-specific metric types
2. **Component labels** for filtering by component category
3. **Existing MetricRecord and MetricsRecorder** from spec 025 (no changes to base models)

## Entities

### 1. MetricType (Enum Extension)

**Purpose**: Extends the MetricType enum from spec 025 with component-specific metric types for all 9 component categories.

**Base Definition**: See [spec 025 data-model.md](../025-llm-agent-performance-kpis/data-model.md) for base MetricType enum.

**Extensions**:
```python
# File: src/nexus/metrics/types.py
from enum import Enum

class MetricType(str, Enum):
    """Categories of metrics recorded by Nexus."""

    # ... existing types from spec 025 ...

    # API Service Metrics (FR-008, FR-009)
    API_RESPONSE_TIME = "api_response_time_ms"
    API_ERROR_RATE = "api_error_rate"
    API_THROUGHPUT = "api_throughput_rps"

    # Workflow Engine Metrics (FR-010, FR-011)
    WORKFLOW_CREATION_SUCCESS_RATE = "workflow_creation_success_rate"
    WORKFLOW_SERIALIZATION_DURATION = "workflow_serialization_duration_ms"
    WORKFLOW_VALIDATION_DURATION = "workflow_validation_duration_ms"

    # Temporal Worker Metrics (FR-012, FR-013)
    TEMPORAL_QUEUE_DEPTH = "temporal_queue_depth"
    ACTIVITY_EXECUTION_SUCCESS_RATE = "activity_execution_success_rate"

    # Execution Service Metrics (FR-014, FR-015)
    WORKFLOW_START_LATENCY = "workflow_start_latency_ms"
    WORKFLOW_COMPLETION_RATE = "workflow_completion_rate"
    ACTIVE_WORKFLOW_COUNT = "active_workflow_count"

    # Tool Manager Metrics (FR-016, FR-017, FR-018)
    TOOL_EXECUTION_SUCCESS_RATE = "tool_execution_success_rate"
    TOOL_EXECUTION_DURATION = "tool_execution_duration_ms"
    TOOL_PROVIDER_AVAILABILITY = "tool_provider_availability_ratio"
    TOOL_EXECUTION_COUNT = "tool_execution_count"
    TOOL_ERROR_RATE = "tool_error_rate"

    # Database Metrics (FR-019, FR-020)
    DATABASE_QUERY_RESPONSE_TIME = "database_query_response_time_ms"
    DATABASE_CONNECTION_POOL_UTILIZATION = "database_connection_pool_utilization_ratio"
    DATABASE_TRANSACTION_RATE = "database_transaction_rate_tps"

    # System-Wide Metrics (FR-021, FR-022)
    SYSTEM_UPTIME = "system_uptime_ratio"
    SYSTEM_E2E_LATENCY = "system_e2e_latency_ms"
    SYSTEM_ERROR_RATE = "system_error_rate"
```

**Extended Grouping by Category**:
```python
# For component metrics filtering by type
METRIC_CATEGORIES = {
    # ... existing categories from spec 025 ...

    "api": [
        MetricType.API_RESPONSE_TIME,
        MetricType.API_ERROR_RATE,
        MetricType.API_THROUGHPUT,
    ],
    "workflow_engine": [
        MetricType.WORKFLOW_CREATION_SUCCESS_RATE,
        MetricType.WORKFLOW_SERIALIZATION_DURATION,
        MetricType.WORKFLOW_VALIDATION_DURATION,
        MetricType.WORKFLOW_DURATION,  # from spec 025
        MetricType.WORKFLOW_STATUS,  # from spec 025
    ],
    "temporal_worker": [
        MetricType.TEMPORAL_QUEUE_DEPTH,
        MetricType.ACTIVITY_EXECUTION_SUCCESS_RATE,
        MetricType.ACTIVITY_DURATION,  # from spec 025
    ],
    "execution_service": [
        MetricType.WORKFLOW_START_LATENCY,
        MetricType.WORKFLOW_COMPLETION_RATE,
        MetricType.ACTIVE_WORKFLOW_COUNT,
    ],
    "tool_manager": [
        MetricType.TOOL_EXECUTION_SUCCESS_RATE,
        MetricType.TOOL_EXECUTION_DURATION,
        MetricType.TOOL_PROVIDER_AVAILABILITY,
        MetricType.TOOL_EXECUTION_COUNT,
        MetricType.TOOL_ERROR_RATE,
    ],
    "database": [
        MetricType.DATABASE_QUERY_RESPONSE_TIME,
        MetricType.DATABASE_CONNECTION_POOL_UTILIZATION,
        MetricType.DATABASE_TRANSACTION_RATE,
    ],
    "system_wide": [
        MetricType.SYSTEM_UPTIME,
        MetricType.SYSTEM_E2E_LATENCY,
        MetricType.SYSTEM_ERROR_RATE,
    ],
}
```

---

### 2. Component Label Requirements

**Purpose**: All metrics MUST include a `component` label identifying the component category for filtering.

**Component Label Values** (FR-002):
```python
# Standard component label values
COMPONENT_LABELS = {
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

**Component Label Requirement**:
- All metrics recorded via `recorder.record()` or `recorder.time()` MUST include `"component"` label
- Component label value must be one of the 9 valid component categories (see COMPONENT_LABELS above)
- Component label enables filtering by component category in queries and endpoints

**Note**: Components use `recorder.record()` and `recorder.time()` from MetricsRecorder (from spec 025). `MetricsRecorder.record()` internally creates a `MetricRecord` object. Components never instantiate `MetricRecord` directly. See quickstart.md for usage examples.

**Filtering by Component**:
```python
# Query metrics for specific component
query = MetricsQuery(
    labels={"component": "api_service"},
    start_time=start_time,
    end_time=end_time
)
```

---

### 3. Component Metrics Endpoint Response

**Purpose**: Define the response format for component metrics endpoints (`/api/v1/{component}/metrics`).

**Response Structure** (FR-005):
```python
# File: src/nexus/schemas/metrics/component_metrics.yaml
# OpenAPI schema for component metrics endpoint

ComponentMetricsResponse:
  type: object
  required:
    - resources
  properties:
    resources:
      type: array
      items:
        $ref: '#/components/schemas/MetricRecord'
    next:
      type: string
      nullable: true
      description: Cursor for next page
    prev:
      type: string
      nullable: true
      description: Cursor for previous page
    total:
      type: integer
      nullable: true
      description: Total count (if include_total=true)
```

**Query Parameters** (FR-007):
```python
# Component metrics endpoint query parameters
ComponentMetricsQuery:
  type: object
  properties:
    type:
      type: string
      description: Filter by metric type
    start_time:
      type: string
      format: date-time
      description: Start of time range (ISO 8601)
    end_time:
      type: string
      format: date-time
      description: End of time range (ISO 8601)
    limit:
      type: integer
      default: 20
      maximum: 100
    cursor:
      type: string
      description: Pagination cursor
```

---

### 4. Component Endpoint Implementation

**Purpose**: Component endpoints (`/api/v1/{component}/metrics`) query metrics filtered by component label. Components record metrics directly using `recorder.record()` and `recorder.time()` calls (same pattern as spec 025).

**Relationship to Unified Endpoint**:
- The unified endpoint `/api/v1/metrics` (from spec 025) already supports filtering by labels
- Component endpoints are thin wrappers that automatically add `labels={"component": "{component}"}`
- Equivalent queries:
  - `/api/v1/api_service/metrics` = `/api/v1/metrics?labels={"component": "api_service"}`
  - `/api/v1/workflow_engine/metrics` = `/api/v1/metrics?labels={"component": "workflow_engine"}`

**Implementation Pattern**:
```python
# File: src/nexus/metrics/router.py
# Component endpoints reuse the same query logic as unified endpoint
# They just automatically add component label filter

@router.get("/{component}/metrics")
async def get_component_metrics(
    component: str,
    # ... same query params as unified endpoint ...
):
    """Get metrics for a specific component - filters MetricsRecorder by component label."""
    # Automatically add component label filter
    # Then use same query logic as unified /api/v1/metrics endpoint
    pass
```

**Note**: Component endpoints use the same `recorder.query()` method as the unified endpoint for GET requests, just with an automatic component label filter. Components record metrics directly using `recorder.record()` and `recorder.time()` calls (same pattern as spec 025).

---

## Data Model Validation Rules

### Component Label Validation

- **FR-002**: All metrics MUST include `component` label with one of the 9 valid component values
- Component label must be included when calling `recorder.record()` or `recorder.time()`
- Component endpoints filter by component label when querying the unified store

### Metric Type Validation

- All metric types must be valid MetricType enum values
- Component operational metrics use component-specific MetricType values

---

## Summary

This data model extends spec 025 with:

1. ✅ **Extended MetricType enum** with component-specific metric types
2. ✅ **Component label requirements** for all metrics (9 component categories)
3. ✅ **Component metrics endpoint response format** (OpenAPI schema)
4. ✅ **Component endpoint implementation** that filters unified store by component label

All component metrics are stored in the existing MetricsRecorder metrics store and accessible via component-specific endpoints (`/api/v1/{component}/metrics`) with filtering support.
