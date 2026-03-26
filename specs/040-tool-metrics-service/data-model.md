# Data Model: Tool Metrics Service Layer

**Feature Branch**: `040-tool-metrics-service`
**Date**: 2026-03-24

## Overview

This feature reuses two existing database models (`ToolExecution`, `UsageCounter`) and one existing response model (`ToolMetricsSummary`). No new database tables or migrations are needed. The implementation adds a service layer and REST API on top of existing data structures.

## Existing Entities (Reused, Not Modified)

### ToolExecution (table: `tool_executions`)

**File**: `src/nexus/tool_manager/models/tool_execution.py`
**Base**: `UserOwnedResource`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | auto | Primary key (from BaseResource) |
| `created_at` | datetime (UTC) | auto | Record creation time (from BaseResource) |
| `updated_at` | datetime (UTC) | auto | Last update time (from BaseResource) |
| `labels` | dict[str, str] | auto | JSONB metadata (from BaseResource) |
| `created_by` | UUID (FK → users.id) | yes | User who created the record (from UserOwnedResource) |
| `updated_by` | UUID (FK → users.id) | no | Last updater (from UserOwnedResource) |
| `tool_id` | UUID (FK → tools.id) | yes | Reference to the tool |
| `provider_id` | UUID (FK → tool_providers.id) | yes | Reference to the tool provider |
| `user_id` | UUID | yes | Executing user/agent identifier |
| `execution_start` | datetime (UTC) | yes | When execution began |
| `execution_end` | datetime (UTC) | no | When execution completed |
| `duration_ms` | int (≥ 0) | no | Execution duration in milliseconds |
| `status` | ExecutionStatus enum | yes | RUNNING, SUCCESS, ERROR, TIMEOUT |
| `input_parameters` | dict (JSONB) | yes | Tool input parameters (pass `{}` for metrics-only records) |
| `output_data` | dict (JSONB) | no | Tool output data (pass `None` for metrics-only records) |
| `error_message` | str (Text) | no | Error description for failed executions |
| `error_code` | str (max 50) | no | Structured error code |

**Indexes**: `tool_id`, `provider_id`, `user_id`, `execution_start`, `created_at` (all indexed)

**Usage note**: Per clarification, when recording metrics-only execution records, `input_parameters` is set to `{}` and `output_data` to `None`. The spec explicitly excludes storing payload data in metrics records.

### UsageCounter (table: `usage_counters`)

**File**: `src/nexus/tool_manager/models/usage_counter.py`
**Base**: `UserOwnedResource`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | auto | Primary key |
| `counter_type` | CounterType enum | yes | PROVIDER, TOOL, USER, PROVIDER_USER, TOOL_USER |
| `provider_id` | UUID (FK → tool_providers.id) | no | Provider reference (for PROVIDER/PROVIDER_USER types) |
| `tool_id` | UUID (FK → tools.id) | no | Tool reference (for TOOL/TOOL_USER types) |
| `user_id` | UUID | no | User reference (for USER/PROVIDER_USER/TOOL_USER types) |
| `time_window` | str (max length) | yes | Window identifier (e.g., "2025-01-01-14") |
| `window_duration` | WindowDuration enum | yes | HOUR, DAY, MONTH |
| `request_count` | int (≥ 0) | yes | Total requests in window (default 0) |
| `success_count` | int (≥ 0) | yes | Successful requests (default 0) |
| `error_count` | int (≥ 0) | yes | Failed requests (default 0) |
| `timeout_count` | int (≥ 0) | yes | Timed-out requests (default 0) — **NEW, requires migration** |
| `total_duration_ms` | int (≥ 0) | yes | Cumulative duration in window (default 0) |
| `window_start` | datetime (UTC) | yes | Window start timestamp |
| `window_end` | datetime (UTC) | yes | Window end timestamp |

**Indexes**: `counter_type`, `provider_id`, `tool_id`, `user_id`, `time_window`, `window_start`, `window_end`

**Usage note**: For this feature, `counter_type=TOOL` rows are the primary aggregation target. The all-time summary fast path sums across all time windows for a given `tool_id`.

**Schema change**: A new `timeout_count` column (int, default 0, >= 0) will be added to the `usage_counters` table via Alembic migration.

### ExecutionStatus (enum)

**File**: `src/nexus/tool_manager/models/tool_execution.py`

| Value | Description |
|-------|-------------|
| `RUNNING` | Execution in progress |
| `SUCCESS` | Execution completed successfully |
| `ERROR` | Execution failed with an error |
| `TIMEOUT` | Execution timed out |

### ToolMetricsSummary (response model, not a DB table)

**File**: `src/nexus/tool_manager/models/tool_execution.py`

| Field | Type | Description |
|-------|------|-------------|
| `total_executions` | int | Total execution count |
| `success_count` | int | Successful executions |
| `failure_count` | int | Failed executions |
| `avg_duration_ms` | int | Average duration |
| `p95_duration_ms` | int | 95th percentile duration |
| `time_window` | str | Time window description |
| `generated_at` | datetime | Timestamp of generation |

**Usage note**: Rather than creating a separate `ToolMetricsToolSummary` model, the existing `ToolMetricsSummary` will be extended with additional fields (`namespaced_name`, `timeout_count`, `error_count`, `success_rate`, `last_execution_at`) to match the spec's FR-008 requirements. Fields not needed for the per-tool summary (`p95_duration_ms`, `time_window`, `generated_at`) remain available for other use cases.

## New Entities (To Create)

### ToolMetricsToolSummary (response model)

A per-tool summary response model for the `GET /api/v1/tool_manager/metrics/tools` endpoint.

| Field | Type | Description |
|-------|------|-------------|
| `namespaced_name` | str | Tool identifier (e.g., "github::search_code") |
| `total_executions` | int | Total execution count |
| `success_count` | int | Successful executions |
| `error_count` | int | Error executions |
| `timeout_count` | int | Timeout executions |
| `success_rate` | float | Success rate (0.0 to 1.0) |
| `avg_duration_ms` | float | Average execution duration |
| `last_execution_at` | datetime | Timestamp of most recent execution |

### ToolMetricsQuery (query params model)

Query parameters for the metrics summary endpoint.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `namespaced_name` | str | None | Filter by tool name |
| `start_time` | datetime | None | Start of time range |
| `end_time` | datetime | None | End of time range |

## Query Patterns

### Fast Path (unfiltered summary)

Sum `UsageCounter` rows grouped by `tool_id` where `counter_type = 'tool'`. Join to `Tool` table to get `namespaced_name`. No scan of `ToolExecution` needed.

### Flexible Path (time-filtered summary)

Aggregate `ToolExecution` records directly with SQL GROUP BY `tool_id`, filtered by `execution_start` range. Join to `Tool` table for `namespaced_name`.

### Execution History

Standard `BaseService.list_resources()` query on `ToolExecution` with cursor-based pagination. Supports filtering by `status`, `tool_id` (resolved from `namespaced_name`), and `created_at` time range.
