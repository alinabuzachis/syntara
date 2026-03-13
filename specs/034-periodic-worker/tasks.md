# Tasks: Shared Periodic Worker

**Input**: Design documents from `/specs/034-periodic-worker/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: Included per constitution (TDD required) and spec SC-005 (100% unit test coverage target).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/nexus/`, `tests/` at repository root (existing Nexus structure)

---

## Phase 1: Setup

**Purpose**: Create the module structure for the shared periodic worker.

- [x] T001 Create package directory and exports in src/nexus/core/workers/__init__.py (export PeriodicWorker)
- [x] T002 [P] Create test package directory with __init__.py files in tests/unit/core/workers/ and tests/integration/core/workers/

---

## Phase 2: Foundational (Core PeriodicWorker)

**Purpose**: Implement the PeriodicWorker class. This MUST be complete before any consumer refactoring can begin.

**CRITICAL**: No user story work can begin until this phase is complete.

### Tests

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation (constitution: TDD)**

- [x] T003 Write unit tests for PeriodicWorker lifecycle (start, stop, idempotent start, restart after stop, no concurrent callback overlap via slow-callback test) in tests/unit/core/workers/test_periodic_worker.py
- [x] T004 Write unit tests for PeriodicWorker error resilience (callback raises exception, loop continues; CancelledError propagation) and structured logging output (verify lifecycle events contain worker name using structlog.testing.capture_logs) in tests/unit/core/workers/test_periodic_worker.py
- [x] T005 Write unit tests for PeriodicWorker coordination (mock advisory lock returning true/false, skip-on-false, coordinate=False mode) in tests/unit/core/workers/test_periodic_worker.py
- [x] T006 Write unit tests for PeriodicWorker cleanup callback (executed on stop, cleanup error logged but doesn't prevent shutdown) in tests/unit/core/workers/test_periodic_worker.py
- [x] T007 Write integration tests for advisory lock coordination against real PostgreSQL (lock acquisition, two workers with same name only one runs, lock release, auto-release on session close) in tests/integration/core/workers/test_periodic_worker_coordination.py

### Implementation

- [x] T008 Implement PeriodicWorker class in src/nexus/core/workers/periodic.py: constructor accepting name, interval_seconds, session_factory, callback, cleanup_callback, coordinate flag; lock key derivation from worker name via SHA-256
- [x] T009 Implement start() method in src/nexus/core/workers/periodic.py: idempotent asyncio.create_task, structured logging with worker name
- [x] T010 Implement _run_loop() method in src/nexus/core/workers/periodic.py: sleep-then-work cycle, CancelledError handling, exception catch-and-log-and-continue for callback errors
- [x] T011 Implement advisory lock acquire in _execute_cycle() in src/nexus/core/workers/periodic.py: open session, pg_try_advisory_xact_lock(key), run callback if acquired, session context manager exit releases lock via implicit ROLLBACK, skip if not acquired, handle coordinate=False mode
- [x] T012 Implement async stop() method in src/nexus/core/workers/periodic.py: cancel task, await task with CancelledError suppression, run cleanup_callback if provided (catch and log cleanup errors), structured logging
- [x] T013 Verify all unit tests (T003-T006) pass against implementation with `uv run pytest tests/unit/core/workers/test_periodic_worker.py -v`
- [x] T014 Verify integration tests (T007) pass against real PostgreSQL with `uv run pytest tests/integration/core/workers/test_periodic_worker_coordination.py -v`
- [x] T015 Run `make format && make lint && make typecheck` to ensure code quality compliance

**Checkpoint**: PeriodicWorker is fully functional and tested. Consumer refactoring can now begin.

---

## Phase 3: User Story 2 - Metrics Poller Refactor (Priority: P1)

**Goal**: Refactor CompletionPoller (PR #404) to use PeriodicWorker, eliminating duplicated lifecycle code and adding cross-instance coordination.

**Prerequisite**: PR #404 must be rebased on top of `034-periodic-worker` (or onto `main` after this branch merges). The rebase makes `PeriodicWorker` available as an import so the consumer refactoring happens during the rebase itself — duplicated lifecycle code never reaches `main`.

**Independent Test**: Start refactored CompletionPoller, insert completed executions in DB, verify workflow/activity metrics appear in MetricsRecorder. Verify stop() cancels cleanly.

### Tests

- [ ] T016 [US2] Update existing unit tests in tests/unit/metrics/test_completion_poller.py to work with the refactored CompletionPoller that delegates lifecycle to PeriodicWorker

### Implementation

- [ ] T017 [US2] Refactor src/nexus/metrics/completion_poller.py: remove _poll_loop, start(), stop() methods; extract _poll_once() as a standalone async callback that accepts session_factory; remove @lru_cache singleton pattern
- [ ] T018 [US2] Update src/nexus/api/main.py: replace get_completion_poller().start() / .stop() with PeriodicWorker instantiation using name="completion-poller", interval_seconds=15, callback=poll_completions, session_factory=AsyncSessionLocal
- [ ] T019 [US2] Verify refactored tests pass with `uv run pytest tests/unit/metrics/test_completion_poller.py -v`
- [ ] T020 [US2] Run `make format && make lint && make typecheck` for metrics module

**Checkpoint**: CompletionPoller uses PeriodicWorker. All existing metrics tests pass. Lifecycle boilerplate eliminated.

---

## Phase 4: User Story 3 - Telemetry Collector Refactor (Priority: P1)

**Goal**: Refactor PeriodicCollector (PR #447) to use PeriodicWorker, eliminating duplicated lifecycle code, adding cross-instance coordination, and ensuring Segment flush on shutdown.

**Prerequisite**: PR #447 must be rebased on top of `034-periodic-worker` (or onto `main` after this branch merges). The rebase makes `PeriodicWorker` available as an import so the consumer refactoring happens during the rebase itself — duplicated lifecycle code never reaches `main`.

**Independent Test**: Start refactored PeriodicCollector, verify it queries DB and sends SystemAnalyticsEvent to Segment (mocked). Verify stop() flushes Segment and cancels cleanly.

### Tests

- [ ] T021 [US3] Update existing unit tests in tests/unit/telemetry/test_periodic_collector.py to work with the refactored PeriodicCollector that delegates lifecycle to PeriodicWorker

### Implementation

- [ ] T022 [US3] Refactor src/nexus/telemetry/periodic_collector.py: remove _collection_loop, start(), stop() methods; extract _collect_and_send() as a standalone async callback that accepts session_factory; pass registry.flush as cleanup_callback
- [ ] T023 [US3] Update src/nexus/api/main.py: replace PeriodicCollector(...).start() / .stop() with PeriodicWorker instantiation using name="telemetry-collector", interval_seconds=settings.collection_interval_seconds, callback=collect_and_send, cleanup_callback=registry.flush, session_factory=AsyncSessionLocal (depends on T018 if running in parallel — both modify main.py)
- [ ] T024 [US3] Verify refactored tests pass with `uv run pytest tests/unit/telemetry/test_periodic_collector.py -v`
- [ ] T025 [US3] Run `make format && make lint && make typecheck` for telemetry module

**Checkpoint**: PeriodicCollector uses PeriodicWorker. All existing telemetry tests pass. Lifecycle boilerplate eliminated. Segment flushed on shutdown.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, quality checks, and cleanup.

- [ ] T026 Run full test suite with `make test-all` to verify no regressions across entire codebase
- [ ] T027 Run `make typecheck` to verify mypy strict mode passes for all modified files
- [ ] T028 Verify advisory lock coordination works end-to-end by running integration test suite: `uv run pytest tests/integration/core/workers/ -v`
- [ ] T029 Run quickstart.md validation: verify code examples in specs/034-periodic-worker/quickstart.md are consistent with final implementation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately ✅ DONE
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories ✅ DONE
- **US2 - Metrics Poller (Phase 3)**: Depends on Phase 2 ✅ AND PR #404 rebase onto this branch ⏳
- **US3 - Telemetry Collector (Phase 4)**: Depends on Phase 2 ✅ AND PR #447 rebase onto this branch ⏳
- **Polish (Phase 5)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (Core Worker)**: Covered by Phase 2 (Foundational) — it IS the foundation ✅ DONE
- **User Story 2 (Metrics Poller)**: Can start after Phase 2 + PR #404 rebase. No dependency on US3.
- **User Story 3 (Telemetry Collector)**: Can start after Phase 2 + PR #447 rebase. No dependency on US2.
- **User Story 4 (WebSocket)**: P3, not included in initial task set. Can be added later.

**US2 and US3 can proceed in parallel** since they modify different files and have no inter-dependencies.

### Within Each User Story

- Tests written and failing FIRST (TDD per constitution)
- Refactor implementation
- Verify tests pass
- Code quality checks

### Parallel Opportunities

- T001 and T002 can run in parallel (different directories) ✅ DONE
- T003, T004, T005, T006 can run in parallel (same file but independent test classes) ✅ DONE
- T008-T012 are sequential (building on each other within same file) ✅ DONE
- **US2 (Phase 3) and US3 (Phase 4) can run entirely in parallel** (different modules, different files)

---

## Parallel Example: Phases 3 & 4

```bash
# After PR #404 and PR #447 are rebased onto this branch, launch both consumer refactors in parallel:

# Developer A: Metrics Poller (US2)
Task: "T016 Update unit tests in tests/unit/metrics/test_completion_poller.py"
Task: "T017 Refactor src/nexus/metrics/completion_poller.py"
Task: "T018 Update src/nexus/api/main.py (metrics wiring)"

# Developer B: Telemetry Collector (US3)
Task: "T021 Update unit tests in tests/unit/telemetry/test_periodic_collector.py"
Task: "T022 Refactor src/nexus/telemetry/periodic_collector.py"
Task: "T023 Update src/nexus/api/main.py (telemetry wiring)"

# Note: T018 and T023 both modify main.py — coordinate merge if parallel.
```

---

## Implementation Strategy

### MVP First (Phase 1 + Phase 2 Only)

1. Complete Phase 1: Setup ✅
2. Complete Phase 2: Foundational PeriodicWorker ✅
3. **VALIDATED**: PeriodicWorker is independently testable with any callback
4. This is User Story 1 — the core foundation deliverable ✅

### Incremental Delivery

1. Phase 1 + Phase 2 → PeriodicWorker foundation ready (US1 complete) ✅
2. Rebase PR #404 onto this branch → Add Phase 3 → Metrics poller refactored (US2 complete) → Deploy/Demo
3. Rebase PR #447 onto this branch → Add Phase 4 → Telemetry collector refactored (US3 complete) → Deploy/Demo
4. Phase 5 → Final validation
5. Each phase adds value without breaking previous work

### Single Developer Strategy

1. Complete Phases 1-2 (foundation) ✅
2. Rebase PR #404 onto this branch, complete Phase 3 (metrics)
3. Rebase PR #447 onto this branch, complete Phase 4 (telemetry)
4. Complete Phase 5 (polish)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 is the foundation itself (Phase 2), not a separate user story phase
- US4 (WebSocket migration, P3) is deferred — can be added as a follow-up
- T018 and T023 both touch main.py — if done in parallel, coordinate the merge
- No Alembic migration needed — advisory locks are built-in PostgreSQL primitives
- Commit after each task or logical group
- **Blocking dependency**: Phases 3 & 4 require PR #404 and PR #447 respectively to be rebased on top of this branch first. The rebase brings in their source files and the refactoring to use PeriodicWorker happens during the rebase — duplicated lifecycle code never reaches `main`
