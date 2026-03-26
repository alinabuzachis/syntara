# Research: Tool Metrics Service Layer, DB Models, and REST API

**Feature Branch**: `040-tool-metrics-service`
**Date**: 2026-03-24

## R1: Existing Model Reuse

**Question**: Can we reuse the existing `ToolExecution` and `UsageCounter` models, or do we need new ones?

**Decision**: Reuse both existing models. They are already defined in `src/nexus/tool_manager/models/` and have Alembic migrations in the first migration (`969f97db7469`).

**Rationale**:
- `ToolExecution` already has all needed fields: `tool_id`, `provider_id`, `user_id`, `execution_start`, `execution_end`, `duration_ms`, `status`, `error_message`, `error_code`.
- `UsageCounter` already supports time-windowed aggregation with `counter_type`, `time_window`, `window_start`, `window_end`, per-status counts, and `total_duration_ms`.
- Both are registered in Alembic's `env.py` and exist in the database.

**Adjustments needed**:
- `ToolExecution` has `input_parameters` (JSONB, required) and `output_data` (JSONB, optional). Per the clarification, we do NOT store payloads. Pass empty dict `{}` for `input_parameters` and `None` for `output_data` when recording metrics.
- `ToolExecution` identifies tools via `tool_id` (UUID FK) and `provider_id` (UUID FK), not `namespaced_name`. The service layer must resolve `namespaced_name` to `tool_id`/`provider_id` when recording, and join to get `namespaced_name` when querying.

**Alternatives considered**:
- Create new metrics-specific models: Rejected — duplicates existing tables and requires new migrations for functionally identical data.
- Add `namespaced_name` column to `ToolExecution`: Rejected — denormalization adds migration complexity; the FK relationship already encodes this through the `Tool` table's `namespaced_name` field.

## R2: UsageCounter Time-Window Strategy

**Question**: The spec requires a dual strategy (fast path for unfiltered, SQL aggregation for time-filtered). How does the existing `UsageCounter` model support this?

**Decision**: The existing `UsageCounter` already supports time-windowed aggregation. For the unfiltered "fast path", aggregate all `UsageCounter` rows for a given `tool_id` with `counter_type=TOOL`. For time-filtered requests, query `ToolExecution` records directly with SQL aggregation.

**Rationale**:
- `UsageCounter` has `counter_type` (TOOL, PROVIDER, USER, etc.), `time_window` (e.g., "2025-01-01-14"), `window_duration` (hour/day/month), and per-status counts (`request_count`, `success_count`, `error_count`).
- Summing all `UsageCounter` rows for a tool across all time windows gives the all-time total (fast path via indexed query + SUM).
- For arbitrary time-range filters, direct SQL aggregation on `ToolExecution` is more accurate and flexible.

**Alternatives considered**:
- Maintain a separate all-time counter row: Rejected — `SUM()` over indexed `UsageCounter` rows is fast enough and avoids maintaining two counter types.

## R3: Service Layer Pattern

**Question**: Should `MetricsService` extend `BaseService` or be a standalone service?

**Decision**: Create a `ToolMetricsService` that extends `BaseService` for the `list_executions()` method (inheriting cursor-based pagination), and adds custom methods for `record_tool_execution()` and `get_tool_metrics_summary()`.

**Rationale**:
- `BaseService.list_resources()` provides all the pagination, filtering, and sorting infrastructure needed for `list_executions()`.
- `record_tool_execution()` and `get_tool_metrics_summary()` are custom operations that don't fit the standard CRUD pattern but benefit from the session management BaseService provides.
- This follows the same pattern as `ToolService` and `ToolProviderService`.

**Alternatives considered**:
- Standalone service without BaseService: Rejected — would duplicate pagination/filtering logic.
- Add methods to existing `ToolService`: Rejected — violates Single Responsibility. Metrics is a distinct concern.

## R4: REST API Router Structure

**Question**: Should metrics endpoints live in the existing `tool_manager/router.py` or a new router?

**Decision**: Create a new `src/nexus/tool_manager/metrics_router.py` with prefix `/tool_manager/metrics`. Include it from the main tool_manager router or via router discovery.

**Rationale**:
- Separation of concerns: metrics endpoints are distinct from tool CRUD endpoints.
- The existing `router.py` is already large (400+ lines). A separate file keeps it manageable.
- Router discovery can auto-detect the new router if placed correctly.

**Alternatives considered**:
- Add to existing `router.py`: Rejected — file is already large and metrics is a separate concern.

## R5: Dual-Write Pattern Implementation

**Question**: How should the dual-write to MetricsRecorder be implemented? Should it be in the service layer or at the recording point?

**Decision**: Implement dual-write in `ToolMetricsService.record_tool_execution()`. After persisting to DB, emit to `MetricsRecorder` in a try/except (best-effort). If DB write fails, still attempt MetricsRecorder emission before re-raising.

**Rationale**:
- Centralizes all recording logic in one method.
- FR-014 requires DB failures not to block MetricsRecorder emission.
- The MetricsRecorder is available via `get_metrics_recorder()` singleton dependency.

**Alternatives considered**:
- Emit MetricsRecorder in the router: Rejected — splits recording logic across layers.
- Use a post-commit hook: Rejected — MetricsRecorder emission should happen even if DB fails.

## R6: Tool Resolution for Recording

**Question**: The spec uses `namespaced_name` as the tool identifier, but the DB model uses `tool_id` (UUID FK). How do we bridge this?

**Decision**: `record_tool_execution()` accepts `namespaced_name` as input. It resolves to `tool_id` and `provider_id` by querying the `Tool` table. For the MetricsRecorder dual-write, `namespaced_name` is used directly as the label value.

**Rationale**:
- `namespaced_name` is the canonical identifier used by callers (spec 036 convention).
- The `Tool` table has a unique index on `namespaced_name` (partial, where `deleted_at IS NULL`), so lookup is O(1).
- This avoids requiring callers to resolve UUIDs themselves.

**Alternatives considered**:
- Accept `tool_id` directly: Rejected — callers at the execution layer have `namespaced_name`, not UUID.
- Accept both and resolve as needed: Rejected — over-engineering for this use case.
