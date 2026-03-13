# Feature Specification: Shared Periodic Worker

**Feature Branch**: `034-periodic-worker`
**Created**: 2026-03-12
**Status**: Draft
**Input**: Create a shared PeriodicWorker foundation for background periodic tasks (metrics polling, telemetry collection) that provides reusable lifecycle management and database-backed cross-instance coordination so that only one worker executes per cycle regardless of how many application processes are running.

## Problem Statement

Nexus has multiple background periodic tasks (metrics polling, telemetry collection, WebSocket cleanup) that each independently reimplement the same asyncio lifecycle pattern. This causes two problems:

1. **Code duplication**: Three separate implementations of start/stop/cancel/error-handling with divergent APIs (sync vs async stop, different error handling, different logging).

2. **Multi-instance correctness**: Every application worker process starts its own instance of every periodic task. When N workers run in parallel:
   - **Telemetry** (PR #447): N workers each fire the same 4 SQL aggregation queries and send N nearly-identical Segment events every cycle. With 100 workers, that is 400 redundant queries and 100 duplicate analytics events per cycle.
   - **Metrics** (PR #404): N workers each run a CompletionPoller with an in-memory dedup set. They cannot coordinate across processes, so the same execution may emit metrics N times. Prometheus histograms are per-process, so scraped values depend on which worker answers the scrape request.

The shared PeriodicWorker must solve both problems: provide a single reusable lifecycle foundation **and** ensure that only one instance across all workers actually executes the work callback at any given time.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Developer Creates a New Periodic Background Task (Priority: P1)

A platform developer needs to add a new periodic background task (e.g., cache cleanup, health checks, analytics collection). Instead of reimplementing asyncio task lifecycle management, error handling, and graceful shutdown from scratch, they use the shared PeriodicWorker foundation. They provide only their task-specific work callback and configuration, and the worker handles everything else -- including ensuring that only one instance runs the callback even when multiple workers are deployed.

**Why this priority**: This is the core value proposition. Without a reusable foundation, every new periodic task duplicates boilerplate code, introduces inconsistencies, and multiplies database and external API load with every additional worker process.

**Independent Test**: Can be tested by instantiating a PeriodicWorker with a simple counter callback, starting it, verifying the callback runs at the configured interval, and stopping it cleanly. Multi-instance behavior can be tested by starting two workers with the same worker name and verifying that only one executes the callback per cycle.

**Acceptance Scenarios**:

1. **Given** a developer defines an async work callback, **When** they create a PeriodicWorker with that callback and a 5-second interval and call start(), **Then** the callback executes approximately every 5 seconds until stop() is called.
2. **Given** a running PeriodicWorker, **When** the developer calls stop(), **Then** the background task is cancelled, any in-flight work is allowed to complete or is cancelled gracefully, and the worker can optionally run a cleanup callback.
3. **Given** a PeriodicWorker is constructed, **When** start() is called multiple times, **Then** only one background task runs (idempotent start).
4. **Given** two application processes both start a PeriodicWorker with the same name and interval, **When** a cycle fires, **Then** only one of the two processes executes the work callback. The other process skips the cycle.

---

### User Story 2 - Metrics Poller Uses Shared Worker (Priority: P1)

The CompletionPoller (PR #404) is refactored to use the shared PeriodicWorker as its foundation. It retains its specific behavior (querying terminal executions, emitting Prometheus metrics, deduplication) but delegates task lifecycle, interval management, error resilience, and cross-instance coordination to the shared worker. This eliminates duplicate metric emission when multiple API workers run concurrently.

**Why this priority**: This is one of the two immediate consumers that motivated the shared worker. Without this, the metrics poller continues to carry duplicated lifecycle code and emits duplicate metrics under multi-worker deployment.

**Independent Test**: Can be tested by verifying that the refactored CompletionPoller starts/stops correctly and still emits workflow and activity metrics for completed executions, using the same test suite as PR #404.

**Acceptance Scenarios**:

1. **Given** the CompletionPoller is refactored to use PeriodicWorker, **When** it starts and the database contains completed executions, **Then** workflow and activity duration metrics appear in the MetricsRecorder and Prometheus registry.
2. **Given** the CompletionPoller is running, **When** the work callback raises an exception (e.g., database timeout), **Then** the worker logs the error and continues to the next cycle without crashing.
3. **Given** the CompletionPoller is stopped, **When** stop() is called, **Then** the background task is cancelled and no further poll cycles execute.
4. **Given** three API workers each start a CompletionPoller, **When** a poll cycle fires, **Then** only one worker queries the database and emits metrics. The other two skip the cycle.

---

### User Story 3 - Telemetry Collector Uses Shared Worker (Priority: P1)

The PeriodicCollector (PR #447) is refactored to use the shared PeriodicWorker as its foundation. It retains its specific behavior (querying aggregate counts, building SystemAnalyticsEvent, sending to Segment) but delegates task lifecycle, interval management, error resilience, and cross-instance coordination to the shared worker. This eliminates redundant SQL queries and duplicate Segment events when multiple workers run concurrently.

**Why this priority**: This is the second immediate consumer. Without coordination, scaling to N workers multiplies both database load (4N queries per cycle) and Segment costs (N duplicate events per cycle).

**Independent Test**: Can be tested by verifying that the refactored PeriodicCollector starts/stops correctly and sends exactly one analytics event to Segment per cycle regardless of how many workers are running.

**Acceptance Scenarios**:

1. **Given** the PeriodicCollector is refactored to use PeriodicWorker, **When** it starts, **Then** it collects database snapshots and sends SystemAnalyticsEvent to Segment at the configured interval.
2. **Given** the PeriodicCollector is running, **When** stop() is called, **Then** the background task is cancelled, pending Segment events are flushed via the cleanup callback, and no further collection cycles run.
3. **Given** the PeriodicCollector is constructed with a test-specific session factory, **When** it runs in an integration test, **Then** it queries the test database (not the production database).
4. **Given** 100 API workers each start a PeriodicCollector, **When** a collection cycle fires, **Then** exactly one worker executes the 4 database queries and sends one Segment event. The other 99 skip the cycle.

---

### User Story 4 - WebSocket Manager Migrates to Shared Worker (Priority: P3)

The existing WebSocketConnectionLifecycleManager already implements a periodic cleanup loop with the same pattern. It can optionally be migrated to use the shared PeriodicWorker to further consolidate lifecycle code in the codebase.

**Why this priority**: This is a nice-to-have refactor. The WebSocket manager works today and its migration is not blocking any new work. Note: the WebSocket cleanup may actually need to run in every worker (since each worker holds its own connections in memory), so this migration may use the worker with coordination disabled.

**Independent Test**: Can be tested by verifying that WebSocket stale connection cleanup still runs at its configured interval after the migration.

**Acceptance Scenarios**:

1. **Given** the WebSocket manager is migrated to PeriodicWorker, **When** it runs, **Then** stale connections are still detected and closed at the configured interval with no change in behavior.

---

### Edge Cases

- What happens when the work callback takes longer than the configured interval? The next cycle should start only after the current one completes (no overlapping executions).
- What happens when stop() is called while a work callback is in-flight? The in-flight work should be cancelled via asyncio task cancellation, and the cleanup callback should still run.
- What happens when start() is called after stop()? The worker should be restartable (a new background task is created).
- What happens when the work callback consistently fails every cycle? The worker must continue running and attempting future cycles (log-and-continue pattern).
- What happens when the application process receives SIGTERM? The FastAPI lifespan shutdown hook calls stop(), which cancels the task and runs cleanup.
- What happens when a cleanup callback itself raises an exception? The exception should be logged but must not prevent the worker from completing its shutdown.
- What happens when the worker instance that acquired the coordination lock crashes mid-cycle? The lock must have a bounded lifetime so that another worker can take over within a reasonable time (no permanent deadlock).
- What happens when the coordination backend (database) is temporarily unreachable? The worker should skip the cycle and try again at the next interval, the same way it handles work callback failures.
- What happens when all workers start at the same time (e.g., deployment rollout)? Exactly one should acquire the lock; the others should skip. There must be no thundering-herd problem causing lock contention storms.

## Requirements *(mandatory)*

### Functional Requirements

#### Lifecycle Management

- **FR-001**: System MUST provide a reusable periodic worker component that accepts an async work callback and executes it at a configurable interval.
- **FR-002**: System MUST manage the full asyncio task lifecycle: creation, cancellation, and cleanup.
- **FR-003**: System MUST survive exceptions in the work callback without terminating the periodic loop. Errors MUST be logged via structured logging and the next cycle MUST proceed normally.
- **FR-004**: System MUST support a configurable interval (in seconds) provided at construction time.
- **FR-005**: System MUST accept a database session factory as a required construction parameter. The worker MUST NOT default to any hardcoded session factory to ensure test compatibility.
- **FR-006**: System MUST provide an async stop() method that cancels the background task and awaits its completion.
- **FR-007**: System MUST support an optional async cleanup callback that runs during stop(), after the background task is cancelled. This enables consumers to flush buffers or release resources.
- **FR-008**: System MUST be idempotent on start -- calling start() multiple times MUST NOT create multiple background tasks.
- **FR-009**: System MUST be restartable -- calling start() after stop() MUST create a new background task.
- **FR-010**: System MUST NOT execute work callbacks concurrently within the same process -- each cycle waits for the previous callback to complete before sleeping for the next interval.
- **FR-011**: System MUST support a human-readable worker name for structured logging, so log entries clearly identify which worker produced them.
- **FR-012**: System MUST handle asyncio.CancelledError during the sleep phase and propagate it to terminate the loop cleanly.
- **FR-013**: System MUST log worker lifecycle transitions (started, stopped, cycle error) using structured logging with the worker name included in every log entry.

#### Cross-Instance Coordination

- **FR-014**: System MUST ensure that at most one worker instance across all application processes executes the work callback per cycle. All other instances MUST skip the cycle.
- **FR-015**: The coordination mechanism MUST use the database (which is already available in all deployments) as the coordination backend. It MUST NOT require additional infrastructure (e.g., Redis, ZooKeeper, etcd).
- **FR-016**: The coordination lock MUST have a bounded lifetime. If the lock holder crashes or is killed without releasing the lock, another instance MUST be able to acquire it after the lock holder's transaction ends or connection is dropped. The lock MUST be held for the duration of the callback execution (the critical section) and auto-release when the session's transaction ends (COMMIT or ROLLBACK), which happens when the session context manager exits. Transaction-level advisory locks are used so that the lock is tied to the transaction — not the underlying pooled connection — eliminating the risk of lock leaks in a connection-pooled setup. The lock MUST also auto-release if the database connection is lost (crash safety).
- **FR-017**: The coordination mechanism MUST be non-blocking. If a worker cannot acquire the lock, it MUST skip the cycle immediately (no waiting or queuing).
- **FR-018**: Cross-instance coordination MUST be optional at construction time. Some periodic tasks (e.g., per-process WebSocket cleanup) need to run in every worker. The worker MUST support a mode where coordination is disabled and every instance runs the callback independently.
- **FR-019**: Lock acquisition and release failures MUST be handled gracefully. A failure to acquire or release the lock MUST be logged and treated the same as a skipped cycle -- the worker continues to the next interval.

### Key Entities

- **PeriodicWorker**: The reusable foundation component. Manages a single asyncio background task that repeatedly sleeps for a configured interval and then invokes a user-provided async callback. Accepts: worker name, interval, session factory, work callback, optional cleanup callback, coordination enabled/disabled flag.
- **Work Callback**: An async callable provided by the consumer (e.g., CompletionPoller, PeriodicCollector). Contains all domain-specific logic. Receives the session factory so it can open database sessions as needed.
- **Cleanup Callback**: An optional async callable invoked during stop(). Used by consumers that need to flush buffers or release resources (e.g., Segment flush in PeriodicCollector).
- **Coordination Lock**: A database-backed mechanism that ensures only one worker instance executes a given periodic task per cycle. Identified by the worker name. Has a bounded lifetime to prevent deadlocks from crashed processes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All existing periodic background tasks (metrics poller, telemetry collector) can be refactored to use the shared worker with no change in observable behavior -- same metrics emitted, same telemetry events sent, same error resilience.
- **SC-002**: Adding a new periodic background task requires only defining a work callback and instantiating the worker -- no reimplementation of asyncio lifecycle, error handling, graceful shutdown, or cross-instance coordination.
- **SC-003**: Integration tests for both metrics and telemetry can inject a test session factory at construction time, eliminating the production-database-in-tests problem identified by reviewers.
- **SC-004**: A work callback that raises an exception does not interrupt the periodic cycle -- the next cycle runs after the configured interval.
- **SC-005**: The shared worker achieves 100% unit test coverage for lifecycle management (start, stop, restart, error resilience, idempotent start, concurrent execution prevention).
- **SC-006**: The total lines of lifecycle boilerplate across periodic task consumers is reduced by at least 50% compared to the current duplicated implementations.
- **SC-007**: When N application workers run concurrently with coordination enabled, exactly one executes the work callback per cycle. Database query load and external API calls (e.g., Segment) scale as O(1), not O(N).
- **SC-008**: If the lock-holding worker crashes, another worker takes over within at most 2x the configured interval (lock expiry + next cycle sleep).

## Compatibility with Event-Driven Architectures

PR #404 reviewer bzwei suggested two alternative approaches for metrics emission: (1) a broadcast/pub-sub service that publishes execution completion events for subscribers to react to, and (2) consolidating metrics emission into `activity_sync_service`, the single point where execution progress is received from Temporal.

Both are push-based designs that could eliminate the need for the CompletionPoller (US2) entirely. This spec is compatible with that evolution:

- **The PeriodicWorker is a general-purpose tool, not coupled to metrics.** If metrics move to event-driven emission, US2 (CompletionPoller refactor) can be dropped without affecting the foundation (US1) or the telemetry collector (US3).
- **Telemetry aggregation is inherently periodic** and cannot move to push-based. The PeriodicCollector sends full-state snapshots of database counts to Segment -- this is not triggerable from individual events.
- **Cross-instance coordination remains necessary** regardless of architecture. Even with pub/sub, only one worker should send the Segment aggregate per cycle, and periodic cleanup tasks (WebSocket, cache) still need the same coordination.
- **The PeriodicWorker and a future broadcast service are complementary**, not competing. Push-based is better for low-latency event reactions (metrics). Pull-based is better for periodic aggregation, cleanup, and health checks.

If a broadcast service is implemented in the future, the only change to this spec is that US2 becomes unnecessary. US1, US3, and US4 remain valid.

## Assumptions

- The work callback is an async callable. Synchronous callbacks are not supported.
- The interval is measured as sleep time between the end of one callback and the start of the next (not fixed-rate scheduling). This matches the existing behavior in all three current implementations.
- The worker does not provide retry logic for failed callbacks -- it simply logs and moves to the next cycle. Consumers that need retry can implement it within their own callback.
- Database session management (opening/closing sessions) is the responsibility of the work callback, not the worker itself. The worker provides the session factory for the callback to use.
- PostgreSQL is always available in all Nexus deployments and can serve as the coordination backend. No additional infrastructure is required.
- The coordination mechanism does not need to guarantee strict leader election (exactly one leader at all times). It only needs to guarantee that at most one instance runs the callback per cycle. Occasional skipped cycles (where no instance runs) are acceptable and preferable to duplicate execution.

## Out of Scope

- Full leader election with failover guarantees (the coordination is per-cycle, not persistent leader assignment).
- Fixed-rate scheduling (where cycles fire at wall-clock intervals regardless of callback duration).
- Metrics or telemetry about the worker itself (e.g., tracking how long each cycle takes).
- Configuration hot-reloading (changing the interval without restarting the worker).
- Coordination across entirely separate Nexus deployments (only within a single deployment sharing the same database).
