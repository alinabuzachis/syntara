# Research: Shared Periodic Worker

**Feature**: 034-periodic-worker
**Date**: 2026-03-12

## R-001: Cross-Instance Coordination Mechanism

### Decision
Use PostgreSQL transaction-level advisory locks (`pg_try_advisory_xact_lock`) for cross-instance coordination.

### Rationale
- Transaction-level advisory locks auto-release when the transaction ends (COMMIT or ROLLBACK), which happens when the session context manager exits. This is safe with connection pooling because the lock is tied to the transaction, not the underlying pooled connection.
- `pg_try_advisory_xact_lock()` is non-blocking: returns `true` if acquired, `false` immediately if not. No queuing.
- Zero schema changes required — advisory locks operate outside the table system. No migration needed.
- PostgreSQL is always available in all Nexus deployments (FR-015).
- No additional infrastructure (Redis, ZooKeeper) required.
- Negligible performance overhead — advisory locks are in-memory within PostgreSQL.

### Why Transaction-Level Instead of Session-Level

Session-level advisory locks (`pg_try_advisory_lock` / `pg_advisory_unlock`) are bound to the underlying database *connection*, not the SQLAlchemy session. In a connection-pooled setup, `session.close()` returns the connection to the pool without closing it. If the explicit `pg_advisory_unlock()` call fails (e.g., network blip, task cancellation) and the exception is suppressed, the lock leaks on the pooled connection and persists until the connection is recycled.

Transaction-level locks (`pg_try_advisory_xact_lock`) avoid this entirely: they are bound to the transaction, which ends when the session context manager exits (implicit ROLLBACK). No explicit unlock is needed, so there is no failure path that can leak the lock.

### Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| **Session-level advisory locks** (`pg_try_advisory_lock` / `pg_advisory_unlock`) | Bound to the connection, not the session. Lock leaks if explicit unlock fails in a pooled setup. Requires careful error handling. Transaction-level locks are safer. |
| **Database table with row-level locking** (`SELECT ... FOR UPDATE SKIP LOCKED`) | Requires a new table + migration. More complex. Risk of stale rows if cleanup fails. Advisory locks are simpler for "at most one" coordination. |
| **Database table with TTL-based expiry** (write a row with `expires_at`, check before running) | Requires a new table + migration. Must handle clock skew. Requires periodic cleanup of expired rows. More moving parts. |
| **Redis distributed lock (Redlock)** | Violates FR-015 (no additional infrastructure). Redis is deployed for streaming but adding lock dependency couples the worker to Redis availability. |
| **File-based locking** (`filelock`) | Only works within a single host. Does not coordinate across containers/pods. Already used in codebase but only for test-xdist parallelism. |
| **OS-level named semaphores** | Not cross-container. Not portable. |

### Implementation Notes
- Use a deterministic 64-bit integer key derived from the worker name: `int.from_bytes(hashlib.sha256(name.encode()).digest()[:8], "big")`.
- Each cycle: open session → acquire lock → run callback → close session (ROLLBACK releases lock). If acquire fails, skip cycle.
- Transaction-level advisory locks auto-release on transaction end, providing safe behavior with connection pooling (FR-016).
- Locks also auto-release on connection close (crash, kill, network drop).

---

## R-002: Where to Place the Shared Worker

### Decision
Place the PeriodicWorker in `src/nexus/core/workers/periodic.py`.

### Rationale
- The `core/` directory houses shared infrastructure (database, config, logging, models, websocket, constants).
- A `workers/` subdirectory follows the existing pattern of domain-specific subdirectories under `core/`.
- Both consumers (metrics in `src/nexus/metrics/`, telemetry in `src/nexus/telemetry/`) import from `core/` already.
- Keeps the worker independent of any specific consumer.

### Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| `src/nexus/core/background_tasks/` | More verbose, no precedent in codebase for this naming. |
| `src/nexus/core/periodic_worker.py` (flat file) | Works but a directory allows future expansion (e.g., adding a registry of all workers). |
| `src/nexus/workers/` (top-level module) | Breaks the pattern of shared infrastructure living under `core/`. |

---

## R-003: Advisory Lock vs Table Lock — Schema Impact

### Decision
No new database table is needed. No Alembic migration is required.

### Rationale
PostgreSQL advisory locks are a built-in database feature that operates outside the table/schema system. They use shared memory within the PostgreSQL server and do not create rows, tables, or indexes. This means:
- No migration to write, review, or maintain.
- No `env.py` model registration needed.
- No schema version bump.
- No risk of migration conflicts with other in-flight PRs.

This is a significant advantage over table-based approaches.

---

## R-004: Session Factory Pattern for the Worker

### Decision
The PeriodicWorker accepts an `async_sessionmaker` (the same type as `AsyncSessionLocal`) as a required constructor parameter. The work callback receives this factory and creates its own sessions.

### Rationale
- Matches the existing pattern in `ContextManagerPlanner` and `InvocationExecutor` where `session_factory` is injected.
- `async_sessionmaker` is the native SQLAlchemy type used by `AsyncSessionLocal` (see `session.py` line 27).
- Tests can pass a test-scoped `async_sessionmaker` bound to the test database engine.
- The worker uses the factory directly for advisory lock acquisition (separate short-lived session per cycle).

### Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Accept `get_db` (async generator dependency) | Designed for FastAPI DI, not for standalone background tasks. Awkward to use outside request context. |
| Accept raw `AsyncEngine` | Too low-level. Consumers would have to create their own sessions. |
| Default to `AsyncSessionLocal` if not provided | Violates FR-005. Breaks integration tests (the core reviewer concern on both PRs). |

---

## R-005: Async stop() vs Sync stop()

### Decision
The `stop()` method is `async`. Both consumers will use the async variant.

### Rationale
- PR #447's `PeriodicCollector.stop()` is already async (needs to `await self._task` and flush Segment).
- PR #404's `CompletionPoller.stop()` is sync but only because it doesn't await the task — it just cancels and sets `self._task = None`. This is actually incomplete (the task may still be running).
- A proper stop must `await` the cancelled task to ensure it has actually terminated before the lifespan shutdown proceeds.
- The FastAPI lifespan is an async context manager, so calling `await worker.stop()` is natural.
- Making stop() async with an optional cleanup callback covers both cases cleanly.

---

## R-006: Composition vs Inheritance

### Decision
Use composition. PeriodicWorker is a standalone class that accepts a work callback, not a base class that consumers inherit from.

### Rationale
- The constitution favors composition over inheritance (Code Architecture Principles).
- The reviewer suggestion was explicitly: "a periodic worker that accepts a `Callable` at construction time".
- CompletionPoller and PeriodicCollector have no shared domain logic — only shared lifecycle. Composition cleanly separates these concerns.
- Testing is simpler: test the worker with a stub callback, test each consumer's callback independently.
- Consumers can still wrap the worker in their own class for encapsulation if desired.

### Alternatives Considered

| Alternative | Why Rejected |
|-------------|-------------|
| Abstract base class with `_do_work()` template method | Inheritance couples lifecycle and domain logic. Constitution recommends composition. Harder to test lifecycle independently. |
| Mixin class | Same coupling problems. Python multiple inheritance adds complexity. |
