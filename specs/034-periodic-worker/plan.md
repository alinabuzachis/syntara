# Implementation Plan: Shared Periodic Worker

**Branch**: `034-periodic-worker` | **Date**: 2026-03-12 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/034-periodic-worker/spec.md`

## Summary

Extract a shared `PeriodicWorker` component from the duplicated background task patterns in CompletionPoller (PR #404) and PeriodicCollector (PR #447). The worker provides reusable asyncio lifecycle management (start/stop/cancel/error-resilience) and database-backed cross-instance coordination via PostgreSQL advisory locks so that only one application process executes the work callback per cycle, regardless of how many workers are deployed.

## Technical Context

**Language/Version**: Python 3.12+
**Primary Dependencies**: asyncio, SQLAlchemy (async), SQLModel, structlog, PostgreSQL (advisory locks)
**Storage**: PostgreSQL (advisory locks for coordination — no new tables)
**Testing**: pytest, pytest-asyncio, unittest.mock
**Target Platform**: Linux server (FastAPI + uvicorn)
**Project Type**: Single Python project (monorepo)
**Performance Goals**: Advisory lock acquisition < 1ms per cycle. Worker overhead negligible relative to callback duration.
**Constraints**: No additional infrastructure beyond PostgreSQL. No schema migrations.
**Scale/Scope**: 2 immediate consumers (metrics poller, telemetry collector). 1 optional future consumer (WebSocket cleanup). Designed for up to ~100 concurrent uvicorn workers.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Modular Architecture** | PASS | PeriodicWorker placed in `src/nexus/core/workers/`, independent module with no hidden dependencies. Consumers import it explicitly. |
| **II. Test-Driven Development** | PASS | Unit tests for lifecycle + coordination. Integration tests for real DB advisory locks. Consumer refactors tested with existing suites. |
| **III. Explicit Configuration** | PASS | All parameters (name, interval, session_factory, callback, coordinate flag) are explicit constructor arguments. No hardcoded defaults for session factory. |
| **IV. Observability First** | PASS | Structured logging for all lifecycle transitions (start, stop, cycle error, lock acquired, lock skipped) with worker name in every entry. |
| **V. API Stability** | PASS | Internal infrastructure component. Not a public API. Consumers are internal modules. |
| **DRY Principle** | PASS | This feature exists specifically to eliminate duplicated lifecycle code across 3 implementations. |
| **SOLID - SRP** | PASS | PeriodicWorker has one responsibility: manage periodic execution. Domain logic lives in callbacks. |
| **SOLID - OCP** | PASS | New periodic tasks added by providing new callbacks, not modifying the worker. |
| **SOLID - DIP** | PASS | Worker depends on abstractions (async_sessionmaker, Callable), not concretions. |
| **Composition vs Inheritance** | PASS | Composition chosen per constitution guidance. Worker accepts callbacks, not overridden methods. |
| **Dependency Injection** | PASS | session_factory is constructor-injected, not internally instantiated. |
| **Code Quality** | PASS | 100% test coverage target. mypy strict. Linting via pre-commit. |

**Post-Phase-1 Re-check**: All gates still pass. No schema changes introduced. No new external dependencies. Advisory locks are a PostgreSQL built-in.

## Project Structure

### Documentation (this feature)

```text
specs/034-periodic-worker/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research decisions
├── data-model.md        # Entity definitions (no DB schema changes)
├── quickstart.md        # Usage examples and development guide
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
src/nexus/core/workers/
├── __init__.py          # Exports PeriodicWorker
└── periodic.py          # PeriodicWorker implementation

tests/unit/core/workers/
├── __init__.py
└── test_periodic_worker.py    # Lifecycle + coordination unit tests

tests/integration/core/workers/
├── __init__.py
└── test_periodic_worker_coordination.py  # Advisory lock integration tests
```

**Structure Decision**: Placed under `src/nexus/core/workers/` following the established pattern of shared infrastructure in `core/` (alongside `core/database/`, `core/config/`, `core/logging/`, `core/websocket/`).

## Design Decisions

### D-001: PostgreSQL Advisory Locks for Coordination

**Decision**: Use `pg_try_advisory_xact_lock()` (transaction-level) for cross-instance coordination.

**Why**: Zero schema changes. Non-blocking. Auto-release when the transaction ends (session context manager exit) or on connection drop (crash safety). Safe with connection pooling because the lock is bound to the transaction, not the underlying connection. PostgreSQL always available. See [research.md](research.md#r-001) for full analysis.

**Lock key**: Deterministic 64-bit integer from `sha256(worker_name)[:8]`.

**Cycle flow**:
```
sleep(interval) → open session → pg_try_advisory_xact_lock(key)
  → acquired: run callback → close session (implicit ROLLBACK releases lock)
  → not acquired: close session → skip cycle
```

**Lock safety**: Transaction-level advisory locks auto-release when the transaction ends (COMMIT or ROLLBACK). The session context manager performs an implicit ROLLBACK on exit, which releases the lock — even when the underlying connection is returned to a pool rather than closed. This eliminates the leak risk of session-level locks (`pg_try_advisory_lock`) where a failed explicit `pg_advisory_unlock` could leave the lock held on a pooled connection. No `finally` block with explicit unlock is needed. If the database connection drops (crash, kill, network drop), the lock also auto-releases. The lock is held for the duration of the callback execution, which is the actual critical section. If a callback hangs without crashing, the lock is held until the process is externally killed (at which point the connection drops and the lock auto-releases).

### D-002: Composition Over Inheritance

**Decision**: PeriodicWorker is a concrete class that accepts a `Callable` callback, not an abstract base class.

**Why**: Constitution mandates composition. Reviewer explicitly requested this pattern. Separates lifecycle testing from domain logic testing. See [research.md](research.md#r-006).

### D-003: No Database Migration

**Decision**: No Alembic migration needed.

**Why**: Advisory locks are built-in PostgreSQL primitives. No tables, rows, or indexes created. See [research.md](research.md#r-003).

### D-004: Session Factory as Required Parameter

**Decision**: `session_factory: async_sessionmaker[AsyncSession]` is a required constructor parameter with no default.

**Why**: Prevents the hardcoded `AsyncSessionLocal` problem flagged by reviewers on both PRs. Tests inject a test-scoped factory. See [research.md](research.md#r-004).

### D-005: Async stop() with Optional Cleanup Callback

**Decision**: `stop()` is always async. An optional `cleanup_callback` runs after task cancellation.

**Why**: Proper shutdown must `await` the cancelled task. PeriodicCollector needs to flush Segment on stop. See [research.md](research.md#r-005).

## Integration Strategy

PR #404 (CompletionPoller) and PR #447 (PeriodicCollector) will be **rebased on top of `034-periodic-worker`** before they are merged. This means:

1. The PeriodicWorker foundation lands in `main` first (via this branch).
2. PR #404 and PR #447 are then rebased onto the updated `main` so that `PeriodicWorker` is available as an import.
3. During the rebase, each PR's consumer code is refactored in-place to use `PeriodicWorker`, eliminating the duplicated lifecycle code before it ever reaches `main`.

This avoids merging duplicated lifecycle patterns into `main` only to immediately refactor them out. The consumer PRs arrive already using the shared foundation.

## Implementation Sequence

### Phase 1: Core PeriodicWorker (No Consumers)

1. Create `src/nexus/core/workers/__init__.py` and `periodic.py`
2. Implement PeriodicWorker class:
   - Constructor with all parameters (name, interval, session_factory, callback, cleanup_callback, coordinate)
   - Lock key derivation from name
   - `start()` — idempotent, creates asyncio task
   - `stop()` — cancels task, awaits completion, runs cleanup callback
   - `_run_loop()` — sleep → try lock → run callback → release lock (or skip)
   - Structured logging for all transitions
3. Write unit tests (`test_periodic_worker.py`):
   - Start/stop lifecycle
   - Idempotent start
   - Restart after stop
   - Error resilience (callback raises exception)
   - CancelledError handling
   - Coordination skip (mock advisory lock returning false)
   - Coordination disabled mode
   - Cleanup callback execution
   - Cleanup callback error handling
4. Write integration tests (`test_periodic_worker_coordination.py`):
   - Advisory lock acquisition against real PostgreSQL
   - Two workers with same name: only one runs per cycle
   - Lock release after callback completes
   - Lock auto-release on session close (simulated crash)

### Phase 2: Rebase & Refactor CompletionPoller (PR #404)

**Prerequisite**: Rebase PR #404 onto `034-periodic-worker` (or onto `main` after this branch merges).

1. Refactor `src/nexus/metrics/completion_poller.py`:
   - Replace internal `_poll_loop`, `start()`, `stop()` with PeriodicWorker
   - Extract `_poll_once()` as the standalone work callback
   - Remove `@lru_cache` singleton — instantiate in `main.py` with injected session_factory
   - Remove the `emitted_completions` module-level set import from `execution_service` (dedup stays but is scoped to the callback closure)
2. Update `src/nexus/api/main.py`:
   - Replace `get_completion_poller()` with `PeriodicWorker(name="completion-poller", ...)`
3. Update existing tests to match refactored structure

### Phase 3: Rebase & Refactor PeriodicCollector (PR #447)

**Prerequisite**: Rebase PR #447 onto `034-periodic-worker` (or onto `main` after this branch merges).

1. Refactor `src/nexus/telemetry/periodic_collector.py`:
   - Replace internal `_collection_loop`, `start()`, `stop()` with PeriodicWorker
   - Extract `_collect_and_send()` as the standalone work callback
   - Pass `registry.flush` as the cleanup callback
2. Update `src/nexus/api/main.py`:
   - Replace `PeriodicCollector(...)` with `PeriodicWorker(name="telemetry-collector", ...)`
3. Update existing tests to match refactored structure

## Complexity Tracking

No constitution violations to justify. All design choices align with constitution principles.
