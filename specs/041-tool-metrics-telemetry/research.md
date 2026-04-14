# Research: Tool Metrics Telemetry Integration

**Feature**: 041-tool-metrics-telemetry
**Date**: 2026-04-07

## R1: How to Add Tool Counts to SystemAnalyticsEvent

**Decision**: Add a `ToolCounts` SQLModel to `telemetry/events/system_analytics.py` and a new `tools` field to `SystemAnalyticsEvent`. Add `query_tool_counts()` to `telemetry/queries.py` (alongside existing query functions) to query all-time cumulative totals from the `UsageCounter` table.

**Rationale**: This follows the exact pattern used for `WorkflowCounts`, `ExecutionCounts`, and `CredentialCounts`. The `UsageCounter` table already stores per-tool cumulative counts (request_count, success_count, error_count, timeout_count). A simple SQL aggregation (`SUM` grouped by nothing, `COUNT(DISTINCT tool_id)`) gives us all-time totals efficiently.

**Alternatives considered**:
- Query `ToolExecution` table directly: Rejected — slower for large datasets, UsageCounter is the pre-aggregated fast path.
- Use `ToolMetricsService.get_tool_metrics_summary()`: Rejected — it requires a `User` dependency and returns per-tool breakdowns, which is more than needed for the aggregate snapshot.

## R2: How to Emit Per-Execution ToolExecutionEvent

**Decision**: Create a `ToolExecutionTelemetryEvent` extending `BaseTelemetryEvent` in `telemetry/events/tool_execution.py` with a `ToolExecutionTelemetryEventBuilder`. Emit it from `_persist_tool_execution_to_db()` in `execution_failure_handler.py` after the DB write succeeds.

**Rationale**: The execution_failure_handler already has all the data (namespaced_name, duration_ms, status) and runs in a fire-and-forget context. Emitting the telemetry event alongside the DB persist keeps the code co-located. The `TelemetryCollector.capture_tool_executed()` method provides the abstraction layer.

**Alternatives considered**:
- Emit from `_emit_tool_metrics()` (Prometheus path): Rejected — that function handles in-memory metrics only; mixing Segment events there would violate single responsibility.
- Emit from `ToolMetricsService.record_tool_execution()`: Rejected — the service layer shouldn't depend on the telemetry subsystem. The orchestrator layer is the right place.

## R3: Running State Exclusion

**Decision**: Only terminal states (success, error, timeout) produce telemetry events and are counted in periodic summaries. Executions in "running" state are excluded from both per-execution events and periodic tool counts.

**Rationale**: The "running" state is transient — it will eventually transition to a terminal state. Counting running executions would create inconsistencies between periodic snapshots (which would include in-progress work) and per-execution events (which fire on completion). The UsageCounter table already only records terminal states, so this aligns naturally.

**Alternatives considered**:
- Include running in total_executions but not in status buckets: Rejected — creates a sum mismatch (total != success + error + timeout).
- Emit a "running" event and then a terminal event: Rejected — doubles event volume with minimal analytics value.

## R4: Telemetry Event Payload Design

**Decision**: `ToolExecutionTelemetryEvent` fields:
- `namespaced_name: str` — tool identifier in plaintext (e.g., "mcp::get_greeting")
- `status: str` — execution status ("success", "error", "timeout")
- `duration_ms: int` — execution duration in milliseconds
- `execution_id: UUID | None` — optional parent workflow execution identifier (named `workflow_execution_id` only in the final Segment telemetry event payload)
- `entitlement_id: str` — inherited from BaseTelemetryEvent

**Rationale**: Tool names are not PII (confirmed in clarifications). Status and duration are the minimum useful fields for analytics. The entitlement_id enables per-installation aggregation in Segment. The `execution_id` enables correlation with workflow executions — sourced from `AgentState.execution_id` (using `NotRequired[UUID | None]`), populated by `InvocationExecutor`. The name `execution_id` is used consistently throughout the codebase to match the rest of Nexus. It is only mapped to `workflow_execution_id` in the final Segment telemetry event model fields, matching existing telemetry event conventions.

**Alternatives considered**:
- Include `provider_id` or `tool_id`: Rejected — internal UUIDs are not useful in Segment analytics without the name.

## R5: Query Strategy for All-Time Tool Counts

**Decision**: Use a single SQL query in `telemetry/queries.py` (called from `periodic_collector.py`):
```sql
SELECT
  COALESCE(SUM(request_count), 0) AS total_executions,
  COALESCE(SUM(success_count), 0) AS success_count,
  COALESCE(SUM(error_count), 0) AS error_count,
  COALESCE(SUM(timeout_count), 0) AS timeout_count,
  COUNT(DISTINCT tool_id) AS distinct_tools
FROM usage_counters
WHERE counter_type = 'tool'
```

**Rationale**: The `UsageCounter` table with `counter_type = 'tool'` has one row per tool per hour window. Summing across all windows gives all-time totals. `COUNT(DISTINCT tool_id)` gives distinct tools. This is efficient with existing indexes. Note: `UsageCounter` does not have a `deleted_at` column (it inherits from `UserOwnedResource` which does not include `SoftDeletable`), so no soft-delete filter is needed.

**Alternatives considered**:
- Query `ToolExecution` table: Rejected — no pre-aggregation, full table scan for large datasets.
- Cache the counts in memory: Rejected — unnecessary complexity; the query runs every 5 minutes and is lightweight.

## R6: Telemetry Disabled Behavior

**Decision**: Check `registry.is_initialized()` before emitting. If not initialized (no Segment write key), skip silently. This is already the behavior of `TelemetryClientRegistry.send_event()` which raises `TelemetryNotInitializedError`, caught by the collector.

**Rationale**: Consistent with existing pattern — all telemetry emission is wrapped in try/except in the collector layer. No special handling needed.
