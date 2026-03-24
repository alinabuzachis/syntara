# Tasks: Tool-Specific Metric Types

**Input**: Design documents from `specs/036-tool-metrics/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: Tests are included per the spec's Definition of Done (unit tests required).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No new project setup needed — this feature extends existing files. This phase covers the foundational type-system changes that all user stories depend on.

- [ ] T001 Add `TOOL_EXECUTION_STATUS = "tool_execution_status"` to `MetricType` enum in `src/nexus/metrics/types.py`
- [ ] T002 Add `TOOL = "tool"` to `MetricsCategoryType` enum in `src/nexus/metrics/types.py`
- [ ] T003 Add `MetricsCategoryType.TOOL` entry to `METRIC_CATEGORIES` dict in `src/nexus/metrics/types.py` with `[MetricType.TOOL_EXECUTION_DURATION, MetricType.TOOL_EXECUTION_STATUS]`

**Checkpoint**: New metric types and category registered. `make typecheck` passes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Prometheus instruments and recorder dispatch logic that MUST be complete before user story testing.

**⚠️ CRITICAL**: No user story validation can proceed until this phase is complete.

### Tests (write first, verify they fail)

- [ ] T004 [P] Add unit tests for `TOOL_EXECUTION_STATUS` member existence and `MetricsCategoryType.TOOL` in `tests/unit/metrics/test_types.py`: verify `MetricType.TOOL_EXECUTION_STATUS` exists with value `"tool_execution_status"`, verify `MetricsCategoryType.TOOL` exists with value `"tool"`, verify `METRIC_CATEGORIES[MetricsCategoryType.TOOL]` contains both `TOOL_EXECUTION_DURATION` and `TOOL_EXECUTION_STATUS`
- [ ] T005 [P] Add unit tests for replaced Prometheus instruments in `tests/unit/metrics/test_prometheus.py`: verify `tool_executions_total` counter has labels `[namespaced_name, status]`, verify `tool_execution_duration_seconds` histogram has labels `[namespaced_name]` and `LATENCY_BUCKETS_MEDIUM` buckets, verify counter increments and histogram observes correctly
- [ ] T006 [P] Add unit tests for tool metric dispatch in `tests/unit/metrics/test_recorder.py`: verify `TOOL_EXECUTION_DURATION` dispatches to histogram (observe) and counter (inc), verify `TOOL_EXECUTION_STATUS` dispatches to counter only, verify missing `namespaced_name` raises `ValueError`, verify missing `status` defaults to `"unknown"`

### Implementation

- [ ] T007 [P] Replace `tool_executions_total` Counter labels from `["component", "tool_id"]` to `["namespaced_name", "status"]` in `NexusPrometheusMetrics.__init__` in `src/nexus/metrics/prometheus.py`
- [ ] T008 [P] Replace `tool_execution_duration_seconds` Histogram labels from `["component", "tool_id"]` to `["namespaced_name"]` in `NexusPrometheusMetrics.__init__` in `src/nexus/metrics/prometheus.py`
- [ ] T009 Remove `TOOL_EXECUTION_DURATION` and `TOOL_EXECUTION_COUNT` entries from `_COMPONENT_METRIC_MAP` in `src/nexus/metrics/recorder.py`; add `_dispatch_tool_execution` static method to `MetricsRecorder`: for `TOOL_EXECUTION_DURATION` — observe histogram (value / 1000) with `namespaced_name` label, increment counter with `namespaced_name` and `status` labels; for `TOOL_EXECUTION_STATUS` — increment counter only with `namespaced_name` and `status` labels; raise `ValueError` if `namespaced_name` is absent, default `status` to `"unknown"` if absent
- [ ] T010 Update `_dispatch_prometheus` method in `src/nexus/metrics/recorder.py`: add explicit `TOOL_EXECUTION_DURATION` and `TOOL_EXECUTION_STATUS` cases routing to `_dispatch_tool_execution`

**Checkpoint**: All unit tests pass. `make format && make lint && make typecheck && make test-all` passes. Foundation ready.

---

## Phase 3: User Story 1 — Query Tool Execution Metrics via REST API (Priority: P1) 🎯 MVP

**Goal**: Tool execution metrics recorded via `MetricsRecorder` are queryable through the existing REST API with `category=tool`.

**Independent Test**: Record tool metrics programmatically, query via `GET /api/v1/metrics?category=tool`, verify results contain tool metrics with correct labels.

### Tests

- [ ] T011 [US1] Add integration test in `tests/integration/metrics/test_router.py`: record `TOOL_EXECUTION_DURATION` with `{namespaced_name: "github::search_code", status: "success"}`, query `GET /api/v1/metrics?category=tool`, verify metric appears in results with correct labels
- [ ] T012 [US1] Add integration test in `tests/integration/metrics/test_router.py`: query `GET /api/v1/metrics?category=tool` with no tool metrics recorded, verify empty result set (not error)

### Validation

- [ ] T013 [US1] Run full test suite (`make test-all`) and verify US1 acceptance scenarios pass: category=tool returns tool metrics, empty category returns empty set, time-range filtering works

**Checkpoint**: User Story 1 complete. Tool metrics queryable via REST API.

---

## Phase 4: User Story 2 — Scrape Tool Metrics via Prometheus (Priority: P1)

**Goal**: Tool execution metrics are exposed through the Prometheus/OpenMetrics endpoint with correct counter and histogram instruments.

**Independent Test**: Record tool metrics, scrape `/api/v1/metrics/openmetrics`, verify `nexus_tool_executions_total` counter and `nexus_tool_execution_duration_seconds` histogram appear with `namespaced_name` and `status` label values.

### Tests

- [ ] T014 [US2] Add integration test in `tests/integration/metrics/test_router.py`: record `TOOL_EXECUTION_DURATION` with namespaced_name/status labels, scrape OpenMetrics endpoint, verify `nexus_tool_executions_total` counter and `nexus_tool_execution_duration_seconds` histogram are present with expected label values
- [ ] T015 [US2] Add integration test in `tests/integration/metrics/test_router.py`: record tool metrics with `status="error"` and `status="timeout"`, scrape OpenMetrics endpoint, verify counter reflects correct status labels

### Validation

- [ ] T016 [US2] Run full test suite (`make test-all`) and verify US2 acceptance scenarios pass: coupled dispatch updates both instruments, failure status reflected, distinct label combinations present

**Checkpoint**: User Story 2 complete. Tool metrics visible in Prometheus scrape output.

---

## Phase 5: User Story 3 — Filter Tool Metrics by Category (Priority: P2)

**Goal**: Filtering by `category=tool` returns only tool-specific metrics and excludes other categories.

**Independent Test**: Record metrics across multiple categories (tool, workflow, llm), query with `category=tool`, verify only tool metrics returned.

### Tests

- [ ] T017 [US3] Add integration test in `tests/integration/metrics/test_router.py`: record metrics across tool, workflow, and llm categories, query with `category=tool`, verify only tool metrics returned (no workflow or llm metrics)

### Validation

- [ ] T018 [US3] Run full test suite (`make test-all`) and verify US3 acceptance scenarios pass: category filtering isolates tool metrics, invalid category returns validation error

**Checkpoint**: User Story 3 complete. Category filtering works correctly for tool metrics.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup.

- [ ] T019 Verify backward compatibility: run existing metric test suites and confirm no regressions in LLM, cache, workflow, agent, error metrics (`make test-all`)
- [ ] T020 Verify existing tests referencing `TOOL_EXECUTION_DURATION` and `TOOL_EXECUTION_COUNT` with `[component, tool_id]` labels are updated to use the new `[namespaced_name]` label set
- [ ] T021 Run `make format && make lint && make typecheck` and fix any issues
- [ ] T022 Run quickstart.md validation: manually verify the code examples in `specs/036-tool-metrics/quickstart.md` work as documented

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories
- **User Stories (Phases 3-5)**: All depend on Phase 2 completion
  - US1 and US2 can proceed in parallel (both P1, independent concerns: REST vs. Prometheus)
  - US3 can proceed in parallel with US1/US2 (category filtering is an existing capability)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Phase 2 — no dependencies on other stories
- **User Story 2 (P1)**: Can start after Phase 2 — no dependencies on other stories
- **User Story 3 (P2)**: Can start after Phase 2 — no dependencies on other stories (tests only need Phase 2 types and instruments)

### Within Each Phase

- Tests MUST be written first and verified to FAIL before implementation
- Phase 2: T004/T005/T006 (tests) → T007/T008 (instruments, parallel) → T009 (dispatch) → T010 (routing)

### Parallel Opportunities

- T004, T005, T006 can all run in parallel (different test files)
- T007, T008 can run in parallel (same file but independent instruments)
- US1, US2, US3 can all start in parallel after Phase 2
- T011, T012 can run in parallel (different test scenarios)
- T014, T015 can run in parallel (different test scenarios)

---

## Parallel Example: Phase 2

```bash
# Launch all tests in parallel (different files):
Task: "T004 - Unit tests for types in tests/unit/metrics/test_types.py"
Task: "T005 - Unit tests for prometheus in tests/unit/metrics/test_prometheus.py"
Task: "T006 - Unit tests for recorder in tests/unit/metrics/test_recorder.py"

# After tests fail, launch instrument creation in parallel:
Task: "T007 - Counter instrument in src/nexus/metrics/prometheus.py"
Task: "T008 - Histogram instrument in src/nexus/metrics/prometheus.py"
```

---

## Implementation Strategy

### MVP First (Phase 1 + Phase 2 + User Story 1)

1. Complete Phase 1: Add types and category (T001-T003)
2. Complete Phase 2: Tests → instruments → dispatch (T004-T010)
3. Complete Phase 3: US1 integration tests → validate REST API queryability (T011-T013)
4. **STOP and VALIDATE**: `make test-all` passes, tool metrics queryable via REST API
5. Deploy/demo if ready

### Incremental Delivery

1. Phase 1 + 2 → Foundation ready
2. Add US1 → REST API queryability validated → MVP
3. Add US2 → Prometheus scraping validated
4. Add US3 → Category filtering validated
5. Phase 6 → Polish, backward compatibility confirmed

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- All source changes are within `src/nexus/metrics/` (3 files: types.py, prometheus.py, recorder.py)
- All test changes are within `tests/unit/metrics/` and `tests/integration/metrics/`
- Commit after each phase completion
- `make format && make lint && make typecheck && make test-all` must pass at every checkpoint
