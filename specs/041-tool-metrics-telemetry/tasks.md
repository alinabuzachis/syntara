# Tasks: Tool Metrics Telemetry Integration

**Input**: Design documents from `/specs/041-tool-metrics-telemetry/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, quickstart.md

**Tests**: Tests are included as required by the constitution (90%+ coverage). Task ordering is implementation-first within each phase; tests follow implementation tasks.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No new project setup needed — this feature extends existing modules. This phase is intentionally empty.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared event model infrastructure needed by both user stories

- [x] T001 Add `ToolCounts` model and `tools` field to `SystemAnalyticsEvent` in `src/nexus/telemetry/events/system_analytics.py` — new SQLModel (no frozen config, matching sibling models `WorkflowCounts`/`ExecutionCounts`) with fields: `success_count`, `error_count`, `timeout_count`, `distinct_tools` (all `int`, default 0) and a `@computed_field` property `total_executions` that returns `success_count + error_count + timeout_count`. Add `tools: ToolCounts = Field(..., description="Tool usage aggregates")` to `SystemAnalyticsEvent`.
- [x] T002 [P] Create `ToolExecutionTelemetryEvent` model and `ToolExecutionTelemetryEventBuilder` in new file `src/nexus/telemetry/events/tool_execution.py` — `ToolExecutionTelemetryEvent(BaseTelemetryEvent)` with fields: `namespaced_name: str`, `status: ExecutionStatus` (from `nexus.tool_manager.models.tool_execution`), `duration_ms: int` (ge=0), `workflow_execution_id: UUID | None` (default `None`, Segment-facing field mapped from `execution_id`). Builder has `build_event()` accepting `namespaced_name`, `status`, `duration_ms`, `execution_id`, `entitlement_id` (mapped to `workflow_execution_id` in the event model). Use direct imports (existing events don't use `__init__.py` exports).
- [x] T003 [P] Write unit tests for `ToolCounts` model in `tests/unit/telemetry/test_system_analytics_event.py` — test construction with defaults (all zeros), construction with values, and serialization to dict. Verify `SystemAnalyticsEvent` accepts `tools` field.
- [x] T004 [P] Write unit tests for `ToolExecutionTelemetryEvent` in new file `tests/unit/telemetry/test_tool_execution_event.py` — test event construction, `to_segment_event()` output (verify event name is `tool_execution_telemetry`), builder `build_event()`, field validation (`duration_ms >= 0`), frozen immutability (inherited from `BaseTelemetryEvent`), verify `workflow_execution_id` (the Segment-facing field mapped from `execution_id`) is included when set and omitted/null when `None`.

**Checkpoint**: Foundation ready — event models exist and are tested. User story implementation can begin.

---

## Phase 3: User Story 1 — Tool Usage in Periodic Analytics Snapshots (Priority: P1) 🎯 MVP

**Goal**: The periodic `system_analytics` event includes all-time cumulative tool usage counts.

**Independent Test**: Run `PeriodicCollector` and verify the `system_analytics` Segment event payload contains a `tools` section with accurate counts.

### Implementation for User Story 1

- [x] T005 [US1] Add `query_tool_counts()` async function in `src/nexus/telemetry/queries.py` — query `usage_counters` table: `SELECT COALESCE(SUM(request_count), 0), COALESCE(SUM(success_count), 0), COALESCE(SUM(error_count), 0), COALESCE(SUM(timeout_count), 0), COUNT(DISTINCT tool_id) FROM usage_counters WHERE counter_type = 'tool'`. Return a `ToolCounts` instance. Follow existing `query_workflow_counts()`/`query_execution_counts()` pattern. Add import for `ToolCounts` from `system_analytics`.
- [x] T006 [US1] Integrate `query_tool_counts()` into `_collect_and_send()` in `src/nexus/telemetry/periodic_collector.py` — import `query_tool_counts` from `queries.py`, call `query_tool_counts(session)` inside the `async with session_factory()` block alongside existing queries, pass result as `tools=` parameter to `SystemAnalyticsEvent` constructor.
- [x] T007 [P] [US1] Write unit test for `query_tool_counts()` in `tests/unit/telemetry/test_queries.py` — test with empty DB (returns all zeros), test with `usage_counter` rows (returns correct sums), test `distinct_tools` count.
- [x] T008 [US1] Write integration test for tool counts in periodic snapshot in `tests/integration/telemetry/test_periodic_analytics.py` — verify that `_collect_and_send()` produces a `SystemAnalyticsEvent` with `tools` field populated from DB, including zero-count case.

**Checkpoint**: User Story 1 complete — periodic `system_analytics` event includes tool counts. Can be validated independently.

---

## Phase 4: User Story 2 — Tool Execution Events in Segment (Priority: P2)

**Goal**: Each tool execution reaching a terminal state emits a `tool_execution_telemetry` event to Segment with `namespaced_name`, `status`, `duration_ms`, optional `execution_id` (mapped to `workflow_execution_id` in the Segment payload), and `entitlement_id`.

**Independent Test**: Execute a tool via an agentic workflow and verify a `tool_execution_telemetry` event appears in Segment with all expected fields including `workflow_execution_id` (the Segment-facing name for `execution_id`).

### Implementation for User Story 2

- [x] T009 [US2] Add optional `execution_id: UUID | None` field to `AgentState` in `src/nexus/agent_orchestrator/models/agent_state.py` — add field with `NotRequired[UUID | None]` to `AgentState` TypedDict and as optional parameter to `AgentStateFactory.create_initial_state()`.
- [x] T010 [US2] Populate `execution_id` in `InvocationExecutor` in `src/nexus/agent_orchestrator/executor/invocation_executor.py` — before calling `orchestration_service.execute()`, look up or derive the workflow execution ID and pass it through to `create_initial_state()`. Add `execution_id` parameter to `orchestration_service.execute()`.
- [x] T011 [US2] Add `capture_tool_executed()` method to `TelemetryCollector` in `src/nexus/telemetry/collector.py` — accept `namespaced_name: str`, `status: ExecutionStatus`, `duration_ms: int`, `execution_id: UUID | None`. Use `ToolExecutionTelemetryEventBuilder` to build event with `entitlement_id` from registry, send via `registry.send_event()`. Follow existing `capture_node_executed()` fire-and-forget pattern with try/except. Add import for builder at top of file.
- [x] T012 [US2] Modify `create_tool_awrapper()` and `create_tool_wrapper()` in `src/nexus/agent_orchestrator/tool_manager/execution_failure_handler.py` — both functions accept new `execution_id: UUID | None` parameter. Thread it into the `tool_awrapper`/`tool_wrapper` closures so it is available in their `finally` blocks. Modify `_persist_tool_execution_to_db()` to accept `execution_id: UUID | None` parameter. After successful DB persist, obtain registry via `get_telemetry_registry()`, check `registry.is_initialized()`, then call `TelemetryCollector(registry=registry).capture_tool_executed(namespaced_name, status, int(duration_ms), execution_id)`. Wrap telemetry emission in try/except — failures must not affect DB persist or tool execution. Update both `finally` blocks to pass `execution_id` to `_persist_tool_execution_to_db()`.
- [x] T013 [US2] Modify `_create_tool_node()` in `src/nexus/agent_orchestrator/services/orchestration_service.py` — pass the execution ID from `AgentState` to both wrappers: `create_tool_awrapper(execution_id=state.get("execution_id"))` and `create_tool_wrapper(loop, execution_id=state.get("execution_id"))`. Update `_create_tool_node` signature to accept `execution_id: UUID | None` parameter, and update the call site in `_setup_graph` to pass `execution_id=state.get("execution_id")`.
- [x] T014 [P] [US2] Write unit test for `capture_tool_executed()` in `tests/unit/telemetry/test_collector.py` — test that method builds correct event with `execution_id` and calls `registry.send_event()`, test with `execution_id=None` (event still emitted with null field), test fire-and-forget (exception in `send_event` does not propagate), test with telemetry disabled (no error).
- [x] T015 [P] [US2] Write unit test for telemetry emission in execution_failure_handler in `tests/unit/agent_orchestrator/tool_manager/test_execution_failure_handler.py` — verify `_persist_tool_execution_to_db()` calls `capture_tool_executed()` after DB persist with correct args including `execution_id`, verify telemetry failure does not propagate, verify telemetry is skipped when registry is not initialized.
- [x] T016 [P] [US2] Write unit test for `AgentState.execution_id` in `tests/unit/agent_orchestrator/` — verify `AgentStateFactory.create_initial_state()` accepts optional `execution_id`, defaults to `None`, and is accessible in state dict.

**Checkpoint**: User Story 2 complete — tool executions emit per-event telemetry with optional workflow execution correlation to Segment. Can be validated independently.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: E2E validation and final verification across both user stories

- [x] T017 Add telemetry event assertions to e2e test in `tests/e2e/test_agentic_workflow_tool_metrics.py` — verify that running an agentic workflow with tool calls produces both a `tool_execution_telemetry` event (with `namespaced_name`, `status`, `duration_ms`, `entitlement_id`, and `workflow_execution_id` in the Segment payload when `execution_id` is available) and a `system_analytics` event with non-zero `tools` counts.
- [x] T018 Update quickstart.md per-execution event example in `specs/041-tool-metrics-telemetry/quickstart.md` to include `workflow_execution_id` field in the sample JSON payload (the Segment-facing name for `execution_id`).
- [x] T019 Run `make format && make lint && make typecheck && make test-all` to verify all checks pass.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No dependencies — can start immediately. T001 modifies `system_analytics.py`. T002 creates new file. T003, T004 test them.
- **User Story 1 (Phase 3)**: Depends on T001 (`ToolCounts` model and `SystemAnalyticsEvent` field)
- **User Story 2 (Phase 4)**: Depends on T002 (`ToolExecutionTelemetryEvent` model + builder). Independent of US1.
- **Polish (Phase 5)**: Depends on US1 + US2 being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Foundational (T001). No dependency on US2.
- **User Story 2 (P2)**: Depends on Foundational (T002). No dependency on US1. Can run in parallel with US1.

### Within Each User Story

- Models before query functions
- Query functions before integration
- US1 implementation order: query (T005) → integration (T006) → tests (T007, T008)
- US2 implementation order: AgentState field (T009) → InvocationExecutor (T010) → collector method (T011) → wrapper+persist+emit (T012) → orchestration service (T013) → tests (T014, T015, T016)

### Parallel Opportunities

- T002 can run in parallel with T001 (different files)
- T003, T004 can run in parallel (different test files)
- US1 (Phase 3) and US2 (Phase 4) can run in parallel after Foundational completes
- T007 can run in parallel with T006 (different files)
- T014, T015, T016 can run in parallel within US2 (different test files)

---

## Parallel Example: Foundational Phase

```
# Launch model tasks in parallel (different files):
Task T001: "Add ToolCounts + tools field in src/nexus/telemetry/events/system_analytics.py"
Task T002: "Create ToolExecutionTelemetryEvent in src/nexus/telemetry/events/tool_execution.py"

# After models complete, launch tests in parallel:
Task T003: "Write unit tests for ToolCounts"
Task T004: "Write unit tests for ToolExecutionTelemetryEvent"
```

## Parallel Example: User Stories

```
# After Foundational completes, launch both stories in parallel:
# Track A: User Story 1
T005 → T006 → T007+T008 (parallel)

# Track B: User Story 2
T009 → T010 → T011 → T012 → T013 → T014+T015+T016 (parallel)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: Foundational (T001–T004)
2. Complete Phase 3: User Story 1 (T005–T008)
3. **STOP and VALIDATE**: Verify periodic `system_analytics` event includes tool counts
4. Deploy/demo if ready

### Incremental Delivery

1. Foundational → Event models ready
2. Add User Story 1 → Periodic snapshots include tool counts → Validate (MVP!)
3. Add User Story 2 → Per-execution telemetry events with optional workflow execution correlation → Validate
4. Polish → Quality checks, e2e validation, quickstart update

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 and US2 are independently testable and can be delivered separately
- Tool names sent in plaintext (not PII, per clarification)
- All-time cumulative counts (no windowing, per clarification)
- Fire-and-forget: telemetry failures must never affect tool execution
- `execution_id` is used consistently throughout the codebase (`AgentState.execution_id`, function parameters, tool wrappers, collector methods). It is only mapped to `workflow_execution_id` in the final Segment telemetry event model fields. When `None`, the telemetry event includes `workflow_execution_id: null`. Threaded from `InvocationExecutor` → `orchestration_service.execute()` → `AgentState.execution_id` → `_create_tool_node()` → `create_tool_awrapper()`/`create_tool_wrapper()` → `_persist_tool_execution_to_db()` → `capture_tool_executed()`
- Both async (`create_tool_awrapper`) and sync (`create_tool_wrapper`) tool wrappers must be updated to thread `execution_id`
- Telemetry emission in `execution_failure_handler.py` follows the `workflow_emitters.py` pattern: get registry, check `is_initialized()`, then create collector
- No database migrations needed — reads from existing `usage_counters` and `tool_executions` tables (PR #504)
