# Feature Specification: Tool Metrics Service Layer, DB Models, and REST API

**Feature Branch**: `040-tool-metrics-service`
**Created**: 2026-03-24
**Status**: Draft
**Input**: [AAP-69345](AAP-69345) -- Spec definition: Tool Metrics Service Layer, DB Models, and REST API

## Clarifications

### Session 2026-03-24

- Q: Should the summary endpoint use UsageCounter (all-time only) or SQL aggregation (time-filtered)? → A: Dual strategy — UsageCounter for unfiltered requests (fast path), SQL aggregation over ToolExecution records when a time-range filter is provided (flexible path).
- Q: Who can access the tool metrics endpoints? → A: Any authenticated user (no role restriction), consistent with existing metrics endpoints.
- Q: Should execution records capture tool input/output payloads or only metadata? → A: Metadata only (namespaced name, timestamps, duration, status, error message). No input/output payloads — keeps records lean and avoids privacy/storage concerns.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Aggregated Tool Metrics Summary (Priority: P1)

As a platform administrator, I want to view aggregated metrics for all tools (total executions, success rate, average duration, last execution time) so that I can monitor tool health and identify underperforming tools at a glance.

**Why this priority**: This is the primary use case for the DB-persisted metrics layer. Without aggregated summaries, operators have no way to assess tool health over time beyond raw Prometheus counters. This delivers the core analytics value.

**Independent Test**: Record several tool executions (mix of success, error, timeout), then query the aggregated summary endpoint and verify per-tool statistics are correct.

**Acceptance Scenarios**:

1. **Given** multiple tool executions have been recorded for different tools, **When** the administrator queries the tool metrics summary endpoint, **Then** the response contains one entry per tool with total executions, success count, error count, timeout count, success rate, average duration, and last execution timestamp.
2. **Given** no tool executions have been recorded, **When** the administrator queries the tool metrics summary endpoint, **Then** the response returns an empty list (not an error).
3. **Given** tool executions exist across a wide time range, **When** the administrator queries with a time window filter, **Then** only executions within that window contribute to the aggregated metrics.
4. **Given** the administrator wants metrics for a specific tool, **When** they filter by `namespaced_name`, **Then** the response contains only the summary for that tool.

---

### User Story 2 - Browse Tool Execution History (Priority: P1)

As a platform administrator, I want to browse the history of individual tool executions with filtering and pagination so that I can investigate specific failures, audit tool usage, and debug issues.

**Why this priority**: Execution history is essential for debugging and auditing. Without it, operators cannot trace individual failures or understand execution patterns. This is co-P1 with US1 because both are needed for a useful analytics layer.

**Independent Test**: Record tool executions with various statuses and parameters, then query the execution history endpoint with filters (status, tool name, time range) and verify correct results with pagination.

**Acceptance Scenarios**:

1. **Given** tool executions have been recorded, **When** the administrator queries the execution history endpoint, **Then** the response contains individual execution records ordered by most recent first, with pagination support.
2. **Given** tool executions with mixed statuses exist, **When** the administrator filters by `status=error`, **Then** only error executions are returned.
3. **Given** tool executions from multiple tools exist, **When** the administrator filters by `namespaced_name`, **Then** only executions for that tool are returned.
4. **Given** many execution records exist, **When** the administrator uses cursor-based pagination, **Then** results are paginated correctly with next/prev cursors.

---

### User Story 3 - Automatic Metric Recording on Tool Execution (Priority: P1)

As the system, when a tool is executed (e.g., via the tool test endpoint), I want the execution result to be automatically recorded to both the database and the in-memory metrics recorder so that metrics are always up to date without manual intervention.

**Why this priority**: This is the write path that feeds US1 and US2. Without automatic recording, no data flows into the system. The dual-write pattern (DB + spec 025 MetricsRecorder) ensures both the long-term analytics layer and the real-time Prometheus layer stay synchronized.

**Independent Test**: Execute a tool via the existing tool test endpoint, then verify that both a database record was created and the spec 025 MetricsRecorder received the corresponding metric.

**Acceptance Scenarios**:

1. **Given** a tool is executed successfully, **When** the execution completes, **Then** a `ToolExecution` record is persisted to the database with status "success", duration, and the tool's namespaced name.
2. **Given** a tool execution fails with an error, **When** the execution completes, **Then** a `ToolExecution` record is persisted with status "error" and the error message is captured.
3. **Given** a tool execution times out, **When** the execution completes, **Then** a `ToolExecution` record is persisted with status "timeout".
4. **Given** a tool execution is recorded to the database, **When** the record is saved, **Then** the system also emits `TOOL_EXECUTION_DURATION` and `TOOL_EXECUTION_STATUS` metrics through the spec 025 `MetricsRecorder` (dual-write).

---

### User Story 4 - Usage Counter Tracking (Priority: P2)

As the system, I want to maintain a running usage counter per tool that tracks total executions and success/error/timeout breakdowns so that summary queries can be served efficiently without scanning all execution records.

**Why this priority**: This is a performance optimization. Without pre-aggregated counters, the summary endpoint (US1) must scan all execution records for every request. The usage counter allows O(1) lookups for tool summary data. It is P2 because the system works without it (just slower for large datasets).

**Independent Test**: Record tool executions and verify that the usage counter for each tool is incremented correctly, then query the counter directly and verify totals match the actual execution records.

**Acceptance Scenarios**:

1. **Given** a tool execution is recorded, **When** the record is persisted, **Then** the `UsageCounter` for that tool is atomically incremented (total count, and the status-specific count).
2. **Given** no counter exists for a tool, **When** the first execution is recorded, **Then** a new `UsageCounter` row is created with initial counts.
3. **Given** a counter exists for a tool, **When** a new execution is recorded, **Then** the existing counter is updated in place (upsert), not duplicated.

---

### Edge Cases

- What happens when a tool execution is recorded but the database is temporarily unavailable? The in-memory MetricsRecorder emission should still succeed (best-effort dual-write: DB failure should not block Prometheus recording).
- What happens when the same tool is executed concurrently by multiple users? Usage counter updates must be atomic to prevent lost updates.
- What happens when a tool is deleted after executions have been recorded? Execution records should be retained for historical audit purposes (soft-delete cascade does not remove metrics).
- What happens when the execution history grows very large? Time-based retention and pagination prevent unbounded growth and response sizes.

## Requirements *(mandatory)*

### Functional Requirements

**Data Models**:

- **FR-001**: System MUST persist individual tool execution records to the database, capturing only execution metadata: tool identifier (namespaced name), execution start time, execution end time, duration in milliseconds, execution status (success, error, timeout), error message (if applicable), and the user who triggered the execution. Tool input parameters and output data MUST NOT be stored in execution records.
- **FR-002**: System MUST maintain a per-tool usage counter that tracks: total execution count, success count, error count, timeout count, average duration, and last execution timestamp.
- **FR-003**: System MUST support efficient querying of execution records by: namespaced name, status, time range, and user. Database indexes MUST support these query patterns.

**Service Layer**:

- **FR-004**: System MUST provide a `record_tool_execution()` function that persists a tool execution record to the database and atomically updates the corresponding usage counter.
- **FR-005**: System MUST provide a `get_tool_metrics_summary()` function that returns aggregated metrics per tool. When no time-range filter is provided, the function MUST source data from usage counters for efficiency (fast path). When a time-range filter is provided, the function MUST aggregate directly from ToolExecution records via SQL (flexible path).
- **FR-006**: System MUST provide a `list_executions()` function that returns paginated, filtered execution history using cursor-based pagination consistent with other Nexus list endpoints.
- **FR-007**: On each tool execution recording, the system MUST also emit metrics through the spec 025 `MetricsRecorder` (dual-write pattern): `TOOL_EXECUTION_DURATION` with the duration in milliseconds, and `TOOL_EXECUTION_STATUS` with the execution outcome.

**REST API**:

- **FR-008**: System MUST expose a `GET /api/v1/tool_manager/metrics/tools` endpoint that returns aggregated per-tool metrics summary with support for filtering by namespaced name and time range. Any authenticated user MUST be able to access this endpoint.
- **FR-009**: System MUST expose a `GET /api/v1/tool_manager/metrics/executions` endpoint that returns paginated tool execution history with support for filtering by namespaced name, status, and time range. Any authenticated user MUST be able to access this endpoint.
- **FR-010**: Both endpoints MUST use cursor-based pagination consistent with the existing Nexus pagination pattern (limit, cursor, sort, include_total parameters).
- **FR-011**: Both endpoints MUST return responses following the standard Nexus `ResourcesResponse` envelope format with `resources`, `next`, `prev`, and optional `total` fields.

**Integration**:

- **FR-012**: When a tool is executed via the tool test endpoint, the system MUST automatically record the execution through the metrics service (no manual recording required by the caller).
- **FR-012a**: The recording logic MUST map `TimeoutError` exceptions to `ExecutionStatus.TIMEOUT` status. Currently no production code sets this status — 040 must implement the `TimeoutError` → `TIMEOUT` mapping explicitly.
- **FR-013**: The dual-write to the spec 025 MetricsRecorder MUST use `namespaced_name` as the tool identifier label, consistent with spec 036 conventions.
- **FR-014**: Database write failures MUST NOT prevent the in-memory MetricsRecorder emission from succeeding (best-effort persistence).

**Database Migrations**:

- **FR-015**: System MUST provide Alembic migrations for all new or modified database tables.
- **FR-016**: Migrations MUST be reversible (downgrade path defined).

### Key Entities

- **ToolExecution**: A record of a single tool invocation. Captures only execution metadata: the tool's namespaced name, execution timestamps, duration, status (success/error/timeout), error message, and the executing user. Does not store tool input parameters or output data. Indexed for efficient filtering by tool, status, and time range.
- **UsageCounter**: A pre-aggregated summary row per tool. Tracks total executions, per-status breakdowns, average duration, and last execution time. Updated atomically on each new execution via upsert. Enables efficient summary queries without scanning execution history.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Aggregated tool metrics summary is retrievable within 500ms regardless of the number of historical execution records (counter-based, not scan-based).
- **SC-002**: Execution history supports browsing up to 100,000 records with sub-second response times using cursor-based pagination.
- **SC-003**: Every tool execution is recorded to both the database and the in-memory metrics layer with no data loss under normal operating conditions.
- **SC-004**: The tool metrics summary endpoint returns correct per-tool breakdowns (total, success, error, timeout counts and success rate) that match the actual execution records.
- **SC-005**: All REST API endpoints follow the existing Nexus pagination and response envelope conventions, requiring no client-side changes for consumers already using other Nexus list endpoints.

## Scope

### In Scope

- `ToolExecution` and `UsageCounter` data model definitions (reuse existing, extend `UsageCounter` with `timeout_count`)
- Alembic migration for `UsageCounter` schema change
- Core business logic functions: `record_tool_execution()`, `get_tool_metrics_summary()`, `list_executions()`
- `MetricsService` service layer with DB session management
- Dual-write integration with spec 025 `MetricsRecorder`
- REST API endpoints for metrics summary and execution history
- Integration with `ToolService` for automatic metric recording on tool test execution
- Integration tests covering the full recording-to-query workflow

### Out of Scope

- Modifications to the in-memory metrics infrastructure (spec 025)
- Changes to Prometheus instruments or OpenMetrics endpoint (spec 036)
- Analytics event pipeline (spec 032)
- Dashboard or UI for visualizing metrics
- Metric alerting or threshold-based notifications
- Batch import of historical execution data
- Cross-service metric aggregation (multi-instance)

## Dependencies

- **Spec 025** (Metrics Infrastructure): Provides `MetricsRecorder`, `MetricType`, and the in-memory metrics recording API used by the dual-write pattern.
- **Spec 036** (Tool-Specific Metric Types): Defines `MetricType.TOOL_EXECUTION_DURATION`, `MetricType.TOOL_EXECUTION_STATUS`, and the `TOOL` metric category. Must be completed before this spec's dual-write integration can work.

## Assumptions

- The existing `ToolExecution` model in the tool manager module will be reused and extended as needed rather than creating a new execution record model.
- The `ExecutionStatus.TIMEOUT` enum value exists but is not set by any existing code. The 040 service layer is responsible for implementing the `TimeoutError` → `TIMEOUT` mapping.
- Usage counters are updated synchronously within the same database transaction as the execution record insert, ensuring consistency.
- The `namespaced_name` format (`"provider_name::tool_name"`) is stable and used as the primary tool identifier across both the DB and in-memory metrics layers.
- Time-based filtering uses the execution's `created_at` timestamp (UTC).
- The tool test endpoint is the initial integration point; other execution entry points (e.g., agent orchestrator tool calls) may be integrated in future work.
- Retention policy for execution records follows the existing database retention practices (no automatic purge specified in this spec).

## Definition of Done

- All functional requirements (FR-001 through FR-016) are implemented and tested
- Unit tests cover core functions and service layer methods
- Integration tests cover the S05 usage metrics scenario (record execution -> query summary -> query history)
- `make format && make lint && make typecheck && make test-all` passes
- Alembic migration for `UsageCounter.timeout_count` is generated and tested (upgrade and downgrade)
- Dual-write to spec 025 MetricsRecorder is verified
- REST API endpoints return correct response schemas with pagination
