# Tasks: Workflow Runtime Telemetry

| Property | Description |
|----------|-------------|
| **Input** | Design documents from `/specs/030-workflow-runtime-telemetry/` |
| **Prerequisites** | plan.md, spec.md, research.md, data-model.md |
| **Organization** | Tasks are grouped by user story to enable independent implementation and testing of each story. |

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Add analytics-python dependency to pyproject.toml
- [X] T002 Add jsonschema dependency to pyproject.toml (for validating generated JSON schemas in contract tests)
- [X] T003 Create telemetry module directory structure at src/nexus/telemetry/
- [X] T004 Create telemetry events submodule at src/nexus/telemetry/events/
- [X] T005 Create telemetry interceptors submodule at src/nexus/telemetry/interceptors/
- [X] T006 Create telemetry sanitizers submodule at src/nexus/telemetry/sanitizers/
- [X] T007 Create telemetry test directories at tests/unit/telemetry/, tests/integration/telemetry/, tests/contract/telemetry/

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T009 Create TelemetrySettings Pydantic BaseSettings class in src/nexus/core/config/base.py with segment_write_key (SecretStr) and segment_endpoint URL (follows Nexus BaseSettings convention; telemetry is always enabled per spec)
- [X] T010 [P] Implement TelemetryClientRegistry singleton (WorkerRegistry pattern) in src/nexus/telemetry/client.py with initialize/get_client/shutdown methods
- [X] T011 [P] Create BaseTelemetryEvent abstract base class in src/nexus/telemetry/events/base.py with to_segment_event method
- [X] T012 [P] Implement DataSanitizer in src/nexus/telemetry/sanitizers/data_sanitizer.py for data sanitization
- [X] T013 [P] Create JSON schema generation script at tools/generate_telemetry_schemas.py that generates schemas from Pydantic models using model.model_json_schema()
- [X] T013B [P] Add 'generate-schemas' and 'validate-schemas' Makefile targets for schema generation and CI validation
- [X] T013C Add schema validation to CI workflow in .github/workflows/ci.yml to ensure Pydantic models and generated JSON schemas stay synchronized
- [X] T014 Register TelemetrySettings in the composite Settings class in src/nexus/core/config/base.py (env vars auto-bound via BaseSettings env_prefix="NEXUS_")
- [X] T015 Add TelemetrySettings to get_settings() cached loader in src/nexus/core/config/base.py
- [X] T016 Initialize TelemetryClientRegistry in Temporal Worker startup in src/nexus/workflows/workflow_engine/services/temporal_worker.py
- [X] T017 Add build-time ARG SEGMENT_WRITE_KEY to Dockerfile in containers/nexus/Containerfile
- [X] T018 Add ENV NEXUS_SEGMENT_WRITE_KEY=${SEGMENT_WRITE_KEY} to Dockerfile in containers/nexus/Containerfile

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Platform Telemetry Collection (Priority: P1) 🎯 MVP

**Goal**: Automatically capture workflow execution metrics (timing, activity details, execution paths, success/failure)

**Independent Test**: Execute a workflow and verify that telemetry events are generated with required data fields without affecting workflow execution

**TDD Workflow**: Each implementation task MUST have passing tests before considered complete (Red-Green-Refactor cycle per constitution)

### 3A: Event Data Classes (TDD Cycle 1)

**Tests First (Red):**
- [X] T019-TEST [P] [US1] Write unit tests for WorkflowExecutionStartEvent validation in tests/unit/telemetry/test_events.py
- [X] T020-TEST [P] [US1] Write unit tests for WorkflowExecutionCompletedEvent validation in tests/unit/telemetry/test_events.py
- [X] T021-TEST [P] [US1] Write unit tests for ActivityExecutionEvent validation in tests/unit/telemetry/test_events.py

**Implementation (Green):**
- [X] T019 [P] [US1] Create WorkflowExecutionStartEvent Pydantic model (frozen BaseModel) in src/nexus/telemetry/events/workflow_execution.py (make tests pass)
- [X] T020 [P] [US1] Create WorkflowExecutionCompletedEvent Pydantic model (frozen BaseModel) in src/nexus/telemetry/events/workflow_execution.py (make tests pass)
- [X] T021 [P] [US1] Create ActivityExecutionEvent Pydantic model (frozen BaseModel) in src/nexus/telemetry/events/activity_execution.py (make tests pass)

**Refactor:**
- [X] T019-REFACTOR [P] [US1] Review and refactor event Pydantic models for DRY compliance

### 3B: Event Builders (TDD Cycle 2)

**Tests First (Red):**
- [X] T022-TEST [US1] Write unit tests for WorkflowExecutionEventBuilder (builds WorkflowExecutionStartEvent and WorkflowExecutionCompletedEvent) including hash calculation in tests/unit/telemetry/test_events.py
- [X] T023-TEST [US1] Write unit tests for ActivityExecutionEventBuilder in tests/unit/telemetry/test_events.py
- [X] T024-TEST [US1] Write unit tests for duration_ms calculation (from Segment-provided timestamps) in tests/unit/telemetry/test_events.py

**Implementation (Green):**
- [X] T022 [US1] Implement WorkflowExecutionEventBuilder to build both WorkflowExecutionStartEvent and WorkflowExecutionCompletedEvent in src/nexus/telemetry/events/workflow_execution.py (make tests pass)
- [X] T023 [US1] Implement ActivityExecutionEventBuilder in src/nexus/telemetry/events/activity_execution.py (make tests pass)
- [X] T024 [US1] Implement duration_ms calculation (from Segment-provided timestamps: complete_event.timestamp - start_event.timestamp) in src/nexus/telemetry/events/workflow_execution.py (make tests pass)

### 3C: Interceptors (TDD Cycle 3)

**Tests First (Red):**
- [X] T025-TEST [P] [US1] Write unit tests for TelemetryWorkflowInboundInterceptor in tests/unit/telemetry/test_interceptors.py
- [X] T028-TEST [P] [US1] Write unit tests for TelemetryActivityInboundInterceptor in tests/unit/telemetry/test_interceptors.py

**Implementation (Green):**
- [X] T025 [US1] Create TelemetryWorkflowInboundInterceptor in src/nexus/telemetry/interceptors/workflow_interceptor.py (make tests pass)
- [X] T026 [US1] Implement workflow start event capture in TelemetryWorkflowInboundInterceptor.execute_workflow (make tests pass)
- [X] T027 [US1] Implement workflow completion event capture in TelemetryWorkflowInboundInterceptor.execute_workflow (make tests pass)
- [X] T028 [US1] Create TelemetryActivityInboundInterceptor in src/nexus/telemetry/interceptors/activity_interceptor.py (make tests pass)
- [X] T029 [US1] Implement activity execution event capture in TelemetryActivityInboundInterceptor.execute_activity (make tests pass)

### 3D: Collector & Integration (TDD Cycle 4)

**Tests First (Red):**
- [X] T030-TEST [US1] Write unit tests for TelemetryCollector service in tests/unit/telemetry/test_collector.py
- [X] T034-TEST [US1] Write contract tests verifying Pydantic models produce valid events and consistent JSON schemas in tests/contract/telemetry/test_event_schemas.py

**Implementation (Green):**
- [X] T030 [US1] Create TelemetryCollector service in src/nexus/telemetry/collector.py (make tests pass)
- [X] T031 [US1] Implement correlation_id generation (UUID v4) in workflow interceptor and propagation via Temporal workflow memo; TelemetryCollector receives correlation_id as parameter (make tests pass)
- [X] T031B [US1] Implement correlation_id retrieval from Temporal workflow memo in TelemetryActivityInboundInterceptor via activity.info().workflow_memo.get("telemetry_correlation_id") in src/nexus/telemetry/interceptors/activity_interceptor.py (make tests pass)
- [X] T032 [US1] Register TelemetryWorkflowInboundInterceptor in Temporal worker in src/nexus/workflows/workflow_engine/services/temporal_worker.py
- [X] T033 [US1] Add telemetry event logging at DEBUG level in src/nexus/telemetry/client.py
- [X] T034 [US1] Verify Pydantic validates events at construction; SegmentTelemetryClient.send_event receives pre-validated events (make tests pass)
- [X] T035 [US1] Add fire-and-forget error handling (log but don't raise) in SegmentTelemetryClient

**Integration Tests:**
- [X] T035-INTEGRATION [US1] Write integration test for end-to-end workflow telemetry capture in tests/integration/telemetry/test_workflow_telemetry.py

**Checkpoint**: At this point, User Story 1 should be fully functional with all tests passing - workflows generate telemetry events with workflow timing, activity types, and execution status

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect the user story and validation (most tests now in Phase 3 per TDD)

- [X] T051 [P] Create performance overhead test in tests/performance/telemetry/test_overhead.py validating <5% overhead requirement (SC-002)
- [X] T052 [P] Implement custom async benchmarking framework with time.perf_counter() in tests/performance/telemetry/benchmark.py
- [X] T053 [P] Create performance test scenarios (small/large/concurrent workflows) in tests/performance/telemetry/test_scenarios.py
- [X] T054 [P] Add unit tests for DataSanitizer in tests/unit/telemetry/test_sanitizers.py (if not already written in Phase 2)
- [X] T055 [P] Add docstrings to all public telemetry classes and methods per constitution documentation standards
- [X] T056 [P] Security audit: Verify no PII/credentials in sample telemetry events (validate SC-007)
- [ ] T057 [P] Create telemetry architecture documentation in docs/telemetry.md
- [X] T058 Add example environment variables to .env.example for NEXUS_SEGMENT_WRITE_KEY and NEXUS_SEGMENT_ENDPOINT
- [ ] T059 Update README.md with telemetry feature overview, configuration instructions, and FR-014 disclosure: "Telemetry is always enabled and collects workflow execution metrics transmitted to Red Hat via Segment.com for product improvement. No PII or credentials are collected. See docs/telemetry.md for details."
- [ ] T060 Run quickstart.md validation with test Segment workspace
- [X] T061 Verify all telemetry code passes make format, make lint, make typecheck
- [ ] T062 Verify telemetry test coverage meets 90% minimum requirement

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS user story implementation
- **User Story 1 (Phase 3)**: Depends on Foundational phase completion
- **Polish (Phase 4)**: Depends on User Story 1 being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - Core telemetry collection functionality

### Within User Story 1

1. T019-T021 (Event Pydantic models) → Can run in parallel
2. T022-T024 (Event builders) → Depends on T019-T021
3. T025-T029 (Interceptors) → Can run in parallel after T022-T024
4. T030-T031 (Collector) → Depends on T022-T024
5. T032-T035 (Integration) → Depends on T025-T031

### Parallel Opportunities

- All Setup tasks (T001-T007) can run in parallel
- Most Foundational tasks (T009-T013C) can run in parallel
- Event Pydantic models (T019-T021) can run in parallel
- Interceptors (T025, T028) can run in parallel after event builders complete
- All test tasks in Phase 4 (T051-T058) can run in parallel
- Documentation tasks (T059-T061) can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all event Pydantic models together:
Task: "Create WorkflowExecutionStartEvent Pydantic model in src/nexus/telemetry/events/workflow_execution.py"
Task: "Create WorkflowExecutionCompletedEvent Pydantic model in src/nexus/telemetry/events/workflow_execution.py"
Task: "Create ActivityExecutionEvent Pydantic model in src/nexus/telemetry/events/activity_execution.py"

# Launch both interceptors together (after event builders complete):
Task: "Create TelemetryWorkflowInboundInterceptor in src/nexus/telemetry/interceptors/workflow_interceptor.py"
Task: "Create TelemetryActivityInboundInterceptor in src/nexus/telemetry/interceptors/activity_interceptor.py"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T007)
2. Complete Phase 2: Foundational (T009-T018) - CRITICAL, blocks all stories
3. Complete Phase 3: User Story 1 (T019-T035)
4. **STOP and VALIDATE**: Test User Story 1 independently with quickstart.md
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational (T001-T018, excluding removed T008) → Foundation ready
2. Add User Story 1 (T019-T035) → Test independently → Deploy/Demo (MVP!)
3. Polish (T051-T062) → Final validation and documentation

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together (T001-T007, T009-T018)
2. Once Foundational is done:
   - Developers work on User Story 1 (T019-T035) in parallel where marked [P]
3. Team collaborates on Phase 4 (T051-T062) in parallel

---

## Notes

- [P] tasks = different files, no dependencies within the same phase
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Performance tests (SC-002: <5% overhead) are critical validation criteria
- All telemetry operations must be fire-and-forget (never block workflow execution)
- Pydantic validates events at construction (before transmission)
- Segment SDK handles batching and retry automatically (no application-level queue needed)

---

## Critical Success Criteria

### User Story 1 Complete When:
- ✅ Workflows generate telemetry events with workflow start/complete/activity execution
- ✅ Events include correlation_id linking all events for a workflow execution
- ✅ Activity execution events capture activity type, inbound/outbound paths
- ✅ Events validated by Pydantic at construction
- ✅ Telemetry overhead <5% (SC-002)

### All Stories Complete When:
- ✅ All contract tests pass (Pydantic models valid, generated JSON schemas consistent)
- ✅ All performance tests pass (<5% overhead)
- ✅ All integration tests pass (Segment transmission mocked)
- ✅ Test coverage ≥90% for telemetry module
- ✅ quickstart.md validation successful
- ✅ Documentation complete (docs/telemetry.md, README.md updates)
