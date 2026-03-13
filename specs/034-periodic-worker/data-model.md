# Data Model: Shared Periodic Worker

**Feature**: 034-periodic-worker
**Date**: 2026-03-12

## Overview

This feature does **not** introduce any new database tables or modify existing schema. Cross-instance coordination uses PostgreSQL advisory locks, which are a built-in database primitive that operates outside the schema system.

## Entities

### PeriodicWorker (In-Memory Only)

Not a database model. A runtime object that manages a background asyncio task.

| Attribute | Type | Description |
|-----------|------|-------------|
| `name` | `str` | Human-readable worker identifier. Used for logging and as the seed for the advisory lock key. |
| `interval_seconds` | `float` | Seconds to sleep between the end of one callback and the start of the next. |
| `session_factory` | `async_sessionmaker[AsyncSession]` | Injectable database session factory. Required. No default. |
| `callback` | `Callable[[async_sessionmaker[AsyncSession]], Awaitable[None]]` | The async work function to execute each cycle. Receives the session factory. |
| `cleanup_callback` | `Callable[[], Awaitable[None]] \| None` | Optional async function called during stop(). |
| `coordinate` | `bool` | Whether to acquire an advisory lock before running the callback. Default: `True`. |
| `_task` | `asyncio.Task[None] \| None` | The background asyncio task. `None` when stopped. |
| `_lock_key` | `int` | 64-bit integer derived from `name` via SHA-256 hash. Used as the PostgreSQL advisory lock ID. |

### State Transitions

```
                start()
    IDLE ──────────────► RUNNING
     ▲                      │
     │        stop()        │
     └──────────────────────┘
              │
              ▼
         CLEANUP (optional)
              │
              ▼
            IDLE
```

Each cycle within the RUNNING state:

```
    sleep(interval)
         │
         ▼
    [coordinate=True?]──No──► execute callback ──► (loop)
         │
        Yes
         │
         ▼
    open session
         │
         ▼
    pg_try_advisory_xact_lock()
         │
    ┌────┴────┐
  acquired  not acquired
    │           │
    ▼           ▼
  execute    close session ──► skip cycle ──► (loop)
  callback
    │
    ▼
  close session (ROLLBACK releases lock) ──► (loop)
```

## Advisory Lock Key Derivation

The lock key is a deterministic 64-bit integer derived from the worker name:

```
lock_key = int.from_bytes(sha256(name.encode()).digest()[:8], "big")
```

This ensures:
- Same worker name across all processes → same lock key → mutual exclusion.
- Different worker names → different lock keys → independent coordination.
- No database table needed for key management.

## No Schema Migration Required

PostgreSQL transaction-level advisory locks (`pg_try_advisory_xact_lock`) operate on shared memory within the PostgreSQL server. They:
- Do not create tables, rows, or indexes.
- Do not require schema modifications.
- Do not appear in Alembic migration history.
- Auto-release when the transaction ends (COMMIT or ROLLBACK), which is safe with connection pooling because the lock is tied to the transaction, not the underlying pooled connection.
- Also auto-release when the database connection closes (crash safety).
