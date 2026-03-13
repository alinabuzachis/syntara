# Quickstart: Shared Periodic Worker

**Feature**: 034-periodic-worker
**Date**: 2026-03-12

## Using the PeriodicWorker

### Basic Usage (with cross-instance coordination)

```python
from nexus.core.workers.periodic import PeriodicWorker
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlmodel.ext.asyncio.session import AsyncSession

# 1. Define your work callback
async def collect_analytics(session_factory: async_sessionmaker[AsyncSession]) -> None:
    """Runs once per cycle. Only one instance executes across all workers."""
    async with session_factory() as session:
        # Your domain-specific work here
        result = await session.exec(select(func.count(Workflow.id)))
        count = result.one()
        send_to_analytics(count)

# 2. Create the worker
worker = PeriodicWorker(
    name="analytics-collector",
    interval_seconds=300,
    session_factory=AsyncSessionLocal,  # or inject test factory
    callback=collect_analytics,
)

# 3. Start and stop (typically in FastAPI lifespan)
worker.start()   # Creates background asyncio task
# ... app runs ...
await worker.stop()  # Cancels task, releases resources
```

### Without Coordination (runs in every process)

```python
worker = PeriodicWorker(
    name="connection-cleanup",
    interval_seconds=30,
    session_factory=AsyncSessionLocal,
    callback=cleanup_stale_connections,
    coordinate=False,  # Run in every worker independently
)
```

### With Cleanup Callback

```python
async def flush_segment() -> None:
    """Called during stop() to flush buffered events."""
    registry.flush()

worker = PeriodicWorker(
    name="telemetry-collector",
    interval_seconds=300,
    session_factory=AsyncSessionLocal,
    callback=collect_telemetry,
    cleanup_callback=flush_segment,
)
```

### Integration with FastAPI Lifespan

```python
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, Any]:
    # Start workers
    metrics_worker = PeriodicWorker(
        name="metrics-poller",
        interval_seconds=15,
        session_factory=AsyncSessionLocal,
        callback=poll_completions,
    )
    metrics_worker.start()

    telemetry_worker = PeriodicWorker(
        name="telemetry-collector",
        interval_seconds=300,
        session_factory=AsyncSessionLocal,
        callback=collect_analytics,
        cleanup_callback=flush_segment,
    )
    telemetry_worker.start()

    try:
        yield
    finally:
        await telemetry_worker.stop()
        await metrics_worker.stop()
```

## Testing

### Unit Test with Mock Session Factory

```python
import pytest
from unittest.mock import AsyncMock, MagicMock

@pytest.fixture
def mock_session_factory():
    factory = MagicMock()
    session = AsyncMock()
    factory.return_value.__aenter__ = AsyncMock(return_value=session)
    factory.return_value.__aexit__ = AsyncMock(return_value=None)
    return factory

async def test_worker_runs_callback(mock_session_factory):
    call_count = 0

    async def counting_callback(sf):
        nonlocal call_count
        call_count += 1

    worker = PeriodicWorker(
        name="test-worker",
        interval_seconds=0.01,
        session_factory=mock_session_factory,
        callback=counting_callback,
        coordinate=False,
    )
    worker.start()
    await asyncio.sleep(0.05)
    await worker.stop()

    assert call_count >= 2
```

### Integration Test with Real Database

```python
async def test_worker_with_real_db(test_db_session_factory):
    """Uses the test database, not production."""
    worker = PeriodicWorker(
        name="integration-test-worker",
        interval_seconds=0.1,
        session_factory=test_db_session_factory,
        callback=my_callback,
        coordinate=False,
    )
    worker.start()
    await asyncio.sleep(0.3)
    await worker.stop()
```

## Development Commands

```bash
# Run all tests
make test-all

# Run only periodic worker tests
uv run pytest tests/unit/core/workers/ -v

# Type check
make typecheck

# Lint and format
make format && make lint
```
