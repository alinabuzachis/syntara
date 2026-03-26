# Implementation Plan: Tool Metrics Service Layer, DB Models, and REST API

**Branch**: `040-tool-metrics-service` | **Date**: 2026-03-24 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/040-tool-metrics-service/spec.md`

## Summary

Add a DB-persisted tool metrics service layer on top of the existing `ToolExecution` and `UsageCounter` database models. The implementation includes a `ToolMetricsService` (extending `BaseService`), REST API endpoints for aggregated tool summaries and execution history, and dual-write integration with the spec 025 `MetricsRecorder`. No new database tables are needed — the models and tables already exist. One migration is required to add the `timeout_count` column to the `usage_counters` table.

## Technical Context

**Language/Version**: Python 3.11+
**Primary Dependencies**: FastAPI, SQLModel, SQLAlchemy (async), structlog, prometheus_client
**Storage**: PostgreSQL (existing `tool_executions` and `usage_counters` tables)
**Testing**: pytest (unit tests in `tests/unit/tool_manager/`, integration tests in `tests/integration/tool_manager/`)
**Target Platform**: Linux server
**Project Type**: Single Python package (`src/nexus/`)
**Performance Goals**: Summary endpoint <500ms (counter-based fast path); execution history <1s with cursor pagination
**Constraints**: One migration needed (add `timeout_count` to `usage_counters`); reuse existing models; dual-write must be best-effort (DB failure does not block MetricsRecorder)
**Scale/Scope**: 1 new service file, 1 new router file, 1 new response model file, ~300 lines production code, ~400 lines tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Modular Architecture | PASS | New service and router in `src/nexus/tool_manager/`. Clear boundaries. |
| II. Test-Driven Development | PASS | Unit tests for service methods, integration tests for REST endpoints. |
| III. Explicit Configuration | PASS | No new configuration. Uses existing DB connection and MetricsRecorder singleton. |
| IV. Observability First | PASS | This feature IS observability — adding persistent tool execution metrics. |
| V. API Stability | PASS | New endpoints added; no existing API changes. |
| Enum over Literal | PASS | Reuses existing `ExecutionStatus` and `CounterType` enums. |
| DRY Principle | PASS | Reuses `BaseService.list_resources()` for pagination. Reuses existing models. |
| SOLID - Single Responsibility | PASS | Separate `ToolMetricsService` from `ToolService`. Metrics is a distinct concern. |
| SOLID - Open/Closed | PASS | Extending with new service — no modification of existing services. |
| API Path Structure | PASS | `/api/v1/tool_manager/metrics/tools` and `/api/v1/tool_manager/metrics/executions` follow convention. |
| Pagination | PASS | Cursor-based pagination via `BaseService.list_resources()`. |
| SQLModel for Data Models | PASS | All models use SQLModel. |
| Code Quality | PASS | Must pass `make format`, `make lint`, `make typecheck`, `make test-all`. |
| Documentation Standards | PASS | Docstrings required for service class and all public methods. |

**Gate Result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/040-tool-metrics-service/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (files to create/modify)

```text
src/nexus/tool_manager/
├── models/
│   ├── tool_execution.py       # EXISTING — MODIFY ToolMetricsSummary to add per-tool fields
│   ├── usage_counter.py        # EXISTING — reuse UsageCounter, CounterType, WindowDuration
│   └── tool_metrics_response.py # NEW — ToolMetricsQuery, ToolExecutionListResponse
├── services/
│   ├── tool_service.py          # EXISTING — MODIFY to call ToolMetricsService on tool test execution
│   └── tool_metrics_service.py  # NEW — ToolMetricsService (extends BaseService)
└── metrics_router.py            # NEW — REST API endpoints for tool metrics

tests/unit/tool_manager/
└── services/
    └── test_tool_metrics_service.py  # NEW — unit tests for ToolMetricsService

tests/integration/tool_manager/
└── test_metrics_router.py            # NEW — integration tests for metrics endpoints
```

**Structure Decision**: All new code within existing `src/nexus/tool_manager/` module. No new top-level modules needed. Follows established service + router pattern.

## Design Decisions

### D1: Reuse Existing Models

**Decision**: Reuse `ToolExecution` and `UsageCounter` models. Extend `UsageCounter` with a `timeout_count` column (requires one Alembic migration).

**Rationale**: Both models already exist with most required fields, indexes, and Alembic migrations. The `UsageCounter` table is missing `timeout_count`, which is needed to track timeouts separately from errors in the fast-path summary.

**Implications**: `input_parameters` must be set to `{}` and `output_data` to `None` when recording metrics-only execution records (per clarification: metadata only, no payloads).

### D2: Dual Query Strategy for Summary

**Decision**: Unfiltered summary queries use `UsageCounter` aggregation (fast path). Time-filtered queries use SQL aggregation over `ToolExecution` records (flexible path).

**Rationale**: `UsageCounter` provides pre-aggregated data for O(1)-like summary queries. Time-range filters require scanning execution records, which is inherently slower but more flexible. The dual approach satisfies both SC-001 (500ms target) and the time-range filtering requirement.

### D3: ToolMetricsService Extends BaseService

**Decision**: `ToolMetricsService` extends `BaseService` to inherit `list_resources()` for cursor-based pagination on execution history.

**Rationale**: `list_resources()` provides filtering, sorting, and cursor pagination infrastructure. Custom methods (`record_tool_execution()`, `get_tool_metrics_summary()`) are added alongside.

### D4: namespaced_name Resolution

**Decision**: The service accepts `namespaced_name` as input and resolves it to `tool_id`/`provider_id` via a `Tool` table lookup. The `Tool` table has a unique partial index on `namespaced_name`.

**Rationale**: Callers at the execution layer have `namespaced_name` (the canonical identifier from spec 036), not UUIDs. Resolution is O(1) via the indexed lookup.

### D5: Dual-Write Error Handling

**Decision**: In `record_tool_execution()`: attempt DB write first. Regardless of DB outcome, emit to `MetricsRecorder`. If DB fails, log the error and re-raise after MetricsRecorder emission.

**Rationale**: FR-014 requires DB failures not to block MetricsRecorder emission. Emitting first would risk inconsistency if DB then fails. Emitting after (regardless of outcome) ensures both paths are attempted.

### D6: Separate Router File

**Decision**: Create `src/nexus/tool_manager/metrics_router.py` instead of adding to existing `router.py`.

**Rationale**: The existing `router.py` is 400+ lines. Metrics is a distinct concern. Separate file follows the pattern of `component_router.py` in the metrics module.

## Implementation Approach

### Step 1: Response Models

Extend existing `ToolMetricsSummary` in `src/nexus/tool_manager/models/tool_execution.py` with additional fields (`namespaced_name`, `timeout_count`, `error_count`, `success_rate`, `last_execution_at`) for per-tool summary responses.

Create `src/nexus/tool_manager/models/tool_metrics_response.py`:
- `ToolMetricsQuery`: Query parameters for summary endpoint (namespaced_name, start_time, end_time)
- `ToolExecutionListResponse`: Typed `ResourcesResponse[ToolExecution]` for execution history

### Step 2: ToolMetricsService

Create `src/nexus/tool_manager/services/tool_metrics_service.py`:
1. `record_tool_execution(namespaced_name, duration_ms, status, error_message?, error_code?)`:
   - Resolve `namespaced_name` → `tool_id`, `provider_id` via Tool lookup
   - Create `ToolExecution` record (input_parameters={}, output_data=None)
   - Upsert `UsageCounter` (counter_type=TOOL, current hour window)
   - Emit to `MetricsRecorder` (dual-write, best-effort)
2. `get_tool_metrics_summary(namespaced_name?, start_time?, end_time?)`:
   - If no time filter: aggregate `UsageCounter` rows by tool_id
   - If time filter: aggregate `ToolExecution` records via SQL
   - Join to `Tool` table for `namespaced_name`
   - Return list of `ToolMetricsToolSummary`
3. `list_executions(limit, cursor, sort, filters)`:
   - Delegate to `BaseService.list_resources()` on `ToolExecution` model

### Step 3: REST API Router

Create `src/nexus/tool_manager/metrics_router.py`:
- `GET /tool_manager/metrics/tools` → `get_tool_metrics_summary()`
- `GET /tool_manager/metrics/executions` → `list_executions()`
- DI: `get_tool_metrics_service()` factory with `get_db()` + `get_current_user()`

### Step 4: ToolService Integration

Modify `src/nexus/tool_manager/services/tool_service.py`:
- After tool test execution completes, call `ToolMetricsService.record_tool_execution()` with the result
- The integration MUST catch `TimeoutError` and map it to `ExecutionStatus.TIMEOUT`. Note: `ExecutionStatus.TIMEOUT` exists as an enum value but is currently never set by any production code — all timeout handling in the MCP provider raises `TimeoutError` without recording an execution. This mapping must be implemented explicitly.

### Step 5: Tests

1. **Unit tests** for `ToolMetricsService`: record, summary (both paths), list, dual-write, error handling
2. **Integration tests** for metrics router: endpoint responses, filtering, pagination, empty states

## Complexity Tracking

No constitution violations to justify. All changes follow established patterns.
