# Tasks: Tool Metrics Service Layer, DB Models, and REST API

**Input**: Design documents from `specs/040-tool-metrics-service/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: Tests are included per the spec's Definition of Done (unit tests and integration tests required).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Create the new files and response models that all user stories depend on.

- [ ] T001 Create `ToolMetricsToolSummary` response model in `src/nexus/tool_manager/models/tool_metrics_response.py`: fields `namespaced_name` (str), `total_executions` (int), `success_count` (int), `error_count` (int), `timeout_count` (int), `success_rate` (float), `avg_duration_ms` (float), `last_execution_at` (datetime). Use SQLModel with `extra="forbid"`.
- [ ] T002 Create `ToolMetricsQuery` query params model in `src/nexus/tool_manager/models/tool_metrics_response.py`: fields `namespaced_name` (str | None), `start_time` (datetime | None), `end_time` (datetime | None). Extend or follow `BaseListParams` pattern.
- [ ] T003 Create `ToolExecutionListParams` query params model in `src/nexus/tool_manager/models/tool_metrics_response.py`: extend `BaseListParams` with `namespaced_name` (str | None), `status` (ExecutionStatus | None), `start_time` (datetime | None), `end_time` (datetime | None).
- [ ] T004 Export new models from `src/nexus/tool_manager/models/__init__.py`

**Checkpoint**: Response models ready. `make typecheck` passes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Service layer core that all user story endpoints and integration depend on.

**CRITICAL**: No user story validation can proceed until this phase is complete.

### Tests (write first, verify they fail)

- [ ] T005 [P] Add unit tests for `ToolMetricsService.record_tool_execution()` in `tests/unit/tool_manager/services/test_tool_metrics_service.py`: test successful recording creates `ToolExecution` with status="success", duration_ms, input_parameters={}, output_data=None; test error recording captures error_message and error_code; test timeout recording creates record with status="timeout"; test that `namespaced_name` is resolved to `tool_id` and `provider_id` via Tool lookup; test that MetricsRecorder dual-write emits `TOOL_EXECUTION_DURATION` and `TOOL_EXECUTION_STATUS`; test that DB failure does not prevent MetricsRecorder emission
- [ ] T006 [P] Add unit tests for `ToolMetricsService.get_tool_metrics_summary()` in `tests/unit/tool_manager/services/test_tool_metrics_service.py`: test unfiltered summary aggregates from UsageCounter rows; test time-filtered summary aggregates from ToolExecution records via SQL; test filtering by `namespaced_name` returns only that tool; test empty results return empty list
- [ ] T007 [P] Add unit tests for `ToolMetricsService.list_executions()` in `tests/unit/tool_manager/services/test_tool_metrics_service.py`: test returns paginated ToolExecution records; test filtering by status; test filtering by namespaced_name; test cursor-based pagination

### Implementation

- [ ] T008 Create `ToolMetricsService` class in `src/nexus/tool_manager/services/tool_metrics_service.py`: extend `BaseService`, accept `AsyncSession` and `User` in constructor, add `MetricsRecorder` as optional dependency (via `get_metrics_recorder()`)
- [ ] T009 Implement `record_tool_execution()` method in `src/nexus/tool_manager/services/tool_metrics_service.py`: accept `namespaced_name`, `duration_ms`, `status`, optional `error_message` and `error_code`; resolve `namespaced_name` to `tool_id`/`provider_id` via Tool table lookup; create `ToolExecution` record with `input_parameters={}`, `output_data=None`; upsert `UsageCounter` row with `counter_type=TOOL` for current hour window; emit `TOOL_EXECUTION_DURATION` and `TOOL_EXECUTION_STATUS` to MetricsRecorder (best-effort, wrapped in try/except)
- [ ] T010 Implement `get_tool_metrics_summary()` method in `src/nexus/tool_manager/services/tool_metrics_service.py`: if no time filter → aggregate UsageCounter rows by `tool_id` where `counter_type='tool'`, join to Tool table for `namespaced_name`; if time filter → aggregate ToolExecution records via SQL GROUP BY `tool_id` filtered by `execution_start` range; return list of `ToolMetricsToolSummary`
- [ ] T011 Implement `list_executions()` method in `src/nexus/tool_manager/services/tool_metrics_service.py`: delegate to `self.list_resources()` on `ToolExecution` model with cursor-based pagination; support filtering by `status`, `namespaced_name` (resolved to `tool_id`), and time range on `created_at`
- [ ] T012 Add `get_tool_metrics_service()` dependency factory function in `src/nexus/tool_manager/services/tool_metrics_service.py`: accept `AsyncSession` via `Depends(get_db)` and `User` via `Depends(get_current_user)`, return `ToolMetricsService` instance

**Checkpoint**: All unit tests pass. `make format && make lint && make typecheck` passes. Service layer ready.

---

## Phase 3: User Story 1 — View Aggregated Tool Metrics Summary (Priority: P1) MVP

**Goal**: Tool execution metrics summary is queryable through a REST API endpoint with per-tool breakdowns.

**Independent Test**: Record tool executions, query `GET /api/v1/tool_manager/metrics/tools`, verify per-tool aggregated response.

### Tests

- [ ] T013 [P] [US1] Add integration test in `tests/integration/tool_manager/test_metrics_router.py`: set up test app with metrics router, record multiple tool executions via service, query `GET /api/v1/tool_manager/metrics/tools`, verify response contains per-tool summary with correct counts and success rate
- [ ] T014 [P] [US1] Add integration test in `tests/integration/tool_manager/test_metrics_router.py`: query `GET /api/v1/tool_manager/metrics/tools` with no executions recorded, verify empty resources list (not error)
- [ ] T015 [P] [US1] Add integration test in `tests/integration/tool_manager/test_metrics_router.py`: query with `namespaced_name` filter, verify only matching tool returned
- [ ] T016 [P] [US1] Add integration test in `tests/integration/tool_manager/test_metrics_router.py`: query with `start_time`/`end_time` filter, verify only executions in window contribute to aggregation

### Implementation

- [ ] T017 [US1] Create `src/nexus/tool_manager/metrics_router.py` with FastAPI `APIRouter` (prefix="/tool_manager/metrics", tags=["tool_metrics"])
- [ ] T018 [US1] Implement `GET /tools` endpoint in `src/nexus/tool_manager/metrics_router.py`: accept `ToolMetricsQuery` params, call `service.get_tool_metrics_summary()`, return `ResourcesResponse[ToolMetricsToolSummary]`
- [ ] T019 [US1] Register `metrics_router` in the tool_manager module so it is discovered by the FastAPI app (check `src/nexus/tool_manager/__init__.py` or router discovery mechanism)

### Validation

- [ ] T020 [US1] Run `make test-all` and verify US1 acceptance scenarios pass: summary returns correct per-tool breakdowns, empty state returns empty list, filtering by name and time range works

**Checkpoint**: User Story 1 complete. Tool metrics summary queryable via REST API.

---

## Phase 4: User Story 2 — Browse Tool Execution History (Priority: P1)

**Goal**: Individual tool execution records are browsable through a paginated REST API endpoint with filtering.

**Independent Test**: Record executions, query `GET /api/v1/tool_manager/metrics/executions` with filters and pagination, verify correct results.

### Tests

- [ ] T021 [P] [US2] Add integration test in `tests/integration/tool_manager/test_metrics_router.py`: record executions, query `GET /api/v1/tool_manager/metrics/executions`, verify response contains individual records ordered by newest first
- [ ] T022 [P] [US2] Add integration test in `tests/integration/tool_manager/test_metrics_router.py`: filter by `status=error`, verify only error executions returned
- [ ] T023 [P] [US2] Add integration test in `tests/integration/tool_manager/test_metrics_router.py`: filter by `namespaced_name`, verify only matching tool's executions returned
- [ ] T024 [P] [US2] Add integration test in `tests/integration/tool_manager/test_metrics_router.py`: verify cursor-based pagination with `limit` and `cursor` params, check `next`/`prev` cursors in response

### Implementation

- [ ] T025 [US2] Implement `GET /executions` endpoint in `src/nexus/tool_manager/metrics_router.py`: accept `ToolExecutionListParams` params, call `service.list_executions()`, return `ResourcesResponse[ToolExecution]`

### Validation

- [ ] T026 [US2] Run `make test-all` and verify US2 acceptance scenarios pass: execution history paginated, status filtering works, name filtering works, cursor pagination works

**Checkpoint**: User Story 2 complete. Execution history browsable via REST API.

---

## Phase 5: User Story 3 — Automatic Metric Recording on Tool Execution (Priority: P1)

**Goal**: Tool executions via the tool test endpoint automatically trigger metric recording with dual-write to DB and MetricsRecorder.

**Independent Test**: Execute a tool via tool test endpoint, verify both a `ToolExecution` DB record and a MetricsRecorder emission occur.

### Tests

- [ ] T027 [P] [US3] Add integration test in `tests/integration/tool_manager/test_metrics_router.py`: execute a tool via tool test/execution path, verify `ToolExecution` record created in DB with correct status, duration, and namespaced_name
- [ ] T028 [P] [US3] Add integration test in `tests/integration/tool_manager/test_metrics_router.py`: verify dual-write — after tool execution, check that MetricsRecorder received `TOOL_EXECUTION_DURATION` and `TOOL_EXECUTION_STATUS` metrics with correct `namespaced_name` label

### Implementation

- [ ] T029 [US3] Modify `src/nexus/tool_manager/services/tool_service.py` (or the appropriate tool execution path): after tool test execution completes, call `ToolMetricsService.record_tool_execution()` with the execution result (namespaced_name, duration_ms, status, error_message if applicable)
- [ ] T030 [US3] Ensure DB write failure in `record_tool_execution()` does not prevent MetricsRecorder emission: verify the try/except pattern in `record_tool_execution()` handles DB errors gracefully and still emits to MetricsRecorder (FR-014)

### Validation

- [ ] T031 [US3] Run `make test-all` and verify US3 acceptance scenarios pass: automatic recording on tool execution, dual-write works, DB failure does not block MetricsRecorder

**Checkpoint**: User Story 3 complete. Tool executions automatically recorded with dual-write.

---

## Phase 6: User Story 4 — Usage Counter Tracking (Priority: P2)

**Goal**: Usage counters are atomically updated on each tool execution, enabling efficient summary queries.

**Independent Test**: Record tool executions, verify UsageCounter rows are created/updated with correct totals matching actual execution records.

### Tests

- [ ] T032 [P] [US4] Add unit test in `tests/unit/tool_manager/services/test_tool_metrics_service.py`: record a tool execution, verify `UsageCounter` row created with `counter_type=TOOL`, correct `request_count`, `success_count`, and `total_duration_ms`
- [ ] T033 [P] [US4] Add unit test in `tests/unit/tool_manager/services/test_tool_metrics_service.py`: record multiple executions for same tool in same hour window, verify counter is upserted (not duplicated) and counts are incremented
- [ ] T034 [P] [US4] Add unit test in `tests/unit/tool_manager/services/test_tool_metrics_service.py`: record concurrent executions, verify atomic counter updates (no lost increments)

### Validation

- [ ] T035 [US4] Run `make test-all` and verify US4 acceptance scenarios pass: counter created on first execution, upserted on subsequent executions, atomic updates under concurrency

**Checkpoint**: User Story 4 complete. Usage counters track execution metrics efficiently.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup.

- [ ] T036 Verify backward compatibility: run existing tool_manager test suites and confirm no regressions (`make test-all`)
- [ ] T037 Run `make format && make lint && make typecheck` and fix any issues
- [ ] T040 Run quickstart.md validation: verify the code examples in `specs/038-tool-metrics-service/quickstart.md` work as documented
- [ ] T040 Verify all REST API endpoints return correct `ResourcesResponse` envelope format with `resources`, `next`, `prev`, `total` fields

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **User Stories (Phases 3-6)**: All depend on Phase 2 completion
  - US1 and US2 can proceed in parallel (different endpoints, independent concerns)
  - US3 depends on US1/US2 router existing (needs the metrics_router file)
  - US4 is tested via unit tests against the service layer (Phase 2 implementation)
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Phase 2 — no dependencies on other stories
- **User Story 2 (P1)**: Can start after Phase 2 — no dependencies on other stories (shares router file with US1)
- **User Story 3 (P1)**: Depends on Phase 2 service methods existing; can proceed after T009 is complete
- **User Story 4 (P2)**: Counter logic is part of `record_tool_execution()` (T009). Tests validate the counter behavior separately.

### Within Each Phase

- Tests MUST be written first and verified to FAIL before implementation
- Models before services
- Services before endpoints
- Core implementation before integration

### Parallel Opportunities

- T001, T002, T003 can run in parallel (different models in same file, but no dependencies)
- T005, T006, T007 can all run in parallel (different test scenarios)
- T013, T014, T015, T016 can all run in parallel (different integration test scenarios)
- T021, T022, T023, T024 can all run in parallel (different integration test scenarios)
- T032, T033, T034 can all run in parallel (different unit test scenarios)
- US1 and US2 can start in parallel after Phase 2

---

## Implementation Strategy

### MVP First (Phase 1 + Phase 2 + User Story 1)

1. Complete Phase 1: Create response models (T001-T004)
2. Complete Phase 2: Service layer with all methods + unit tests (T005-T012)
3. Complete Phase 3: US1 summary endpoint + integration tests (T013-T020)
4. **STOP and VALIDATE**: `make test-all` passes, tool metrics summary queryable via REST API
5. Deploy/demo if ready

### Incremental Delivery

1. Phase 1 + 2 → Service layer ready
2. Add US1 → Summary endpoint → MVP
3. Add US2 → Execution history browsable
4. Add US3 → Automatic recording integrated
5. Add US4 → Counter tracking validated
6. Phase 7 → Polish, backward compatibility confirmed

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- All new source code within `src/nexus/tool_manager/` (services, models, router)
- All new tests within `tests/unit/tool_manager/` and `tests/integration/tool_manager/`
- Existing models (`ToolExecution`, `UsageCounter`) are reused — no new migrations needed
- `make format && make lint && make typecheck && make test-all` must pass at every checkpoint
