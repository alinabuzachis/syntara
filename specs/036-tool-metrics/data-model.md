# Data Model: Tool-Specific Metric Types

**Feature Branch**: `036-tool-metrics`
**Date**: 2026-03-23

## Overview

This feature extends existing data structures and replaces the label sets on two existing Prometheus instruments. No new database tables, models, or Prometheus instruments are created.

## Entity Changes

### MetricType (StrEnum) — Extended

**File**: `src/nexus/metrics/types.py`

| Member | Value | Status |
|--------|-------|--------|
| `TOOL_EXECUTION_DURATION` | `"tool_execution_duration_ms"` | **Existing** — already in TOOL_MANAGER category. Added to new TOOL category. |
| `TOOL_EXECUTION_STATUS` | `"tool_execution_status"` | **New** — records tool execution outcome. |

### MetricsCategoryType (StrEnum) — Extended

**File**: `src/nexus/metrics/types.py`

| Member | Value | Status |
|--------|-------|--------|
| `TOOL` | `"tool"` | **New** — groups tool-specific metric types. |

### METRIC_CATEGORIES (dict) — Extended

**File**: `src/nexus/metrics/types.py`

New entry:

```
MetricsCategoryType.TOOL: [
    MetricType.TOOL_EXECUTION_DURATION,
    MetricType.TOOL_EXECUTION_STATUS,
]
```

Note: `TOOL_EXECUTION_DURATION` moves from `TOOL_MANAGER` to the new `TOOL` category. The existing `_COMPONENT_METRIC_MAP` entries for `TOOL_EXECUTION_DURATION` and `TOOL_EXECUTION_COUNT` are removed since the Prometheus instruments they targeted are replaced with new label sets.

### NexusPrometheusMetrics — Modified

**File**: `src/nexus/metrics/prometheus.py`

The existing tool instruments are **replaced** with new label sets (previously `[component, tool_id]`):

| Instrument | Type | Name | Labels (before) | Labels (after) | Buckets |
|-----------|------|------|-----------------|----------------|---------|
| `tool_executions_total` | Counter | `nexus_tool_executions_total` | `[component, tool_id]` | `[namespaced_name, status]` | N/A |
| `tool_execution_duration_seconds` | Histogram | `nexus_tool_execution_duration_seconds` | `[component, tool_id]` | `[namespaced_name]` | `LATENCY_BUCKETS_MEDIUM` |

### Label Schema

Tool metrics use the following label set:

| Label | Required | Default | Description |
|-------|----------|---------|-------------|
| `namespaced_name` | Yes (mandatory) | N/A | Canonical tool identifier in format `"{provider.name}::{tool.name}"` (e.g., `"github::search_code"`). Encodes both provider and tool name. Values come from the finite set of registered tools. |
| `status` | Yes (defaulted) | `"unknown"` | Execution outcome derived from exception type: `"success"` (no exception), `"timeout"` (timeout/connection exception), or `"error"` (any other exception) |

The `namespaced_name` label is mandatory and must always be provided by the caller. The `status` label defaults to `"unknown"` if not provided (per FR-008).

### Dispatch Routing

| MetricType | Handler | Prometheus Instruments |
|-----------|---------|----------------------|
| `TOOL_EXECUTION_DURATION` | `_dispatch_tool_execution` | histogram `.observe()` + counter `.inc()` |
| `TOOL_EXECUTION_STATUS` | `_dispatch_tool_execution` | counter `.inc()` |

The existing `_COMPONENT_METRIC_MAP` entries for `TOOL_EXECUTION_DURATION` and `TOOL_EXECUTION_COUNT` are **removed**. All tool metrics route through the dedicated handler — no dual-dispatch or label-based routing.

## Unchanged Entities

The following existing entities are **not modified**:

- `MetricRecord` (SQLModel) — no schema changes
- `MetricsQuery` — `category` field already typed as `MetricsCategoryType | None`, so accepting `TOOL` requires no code change
- `MetricsSummary` — no new summary fields
- `COMPONENT_LABELS` — no new components added
- All existing `_COMPONENT_METRIC_MAP` entries — unchanged **except** `TOOL_EXECUTION_DURATION` and `TOOL_EXECUTION_COUNT` which are removed
- All existing Prometheus instruments — unchanged **except** `nexus_tool_executions_total` and `nexus_tool_execution_duration_seconds` whose label sets are replaced (FR-004, FR-005)
