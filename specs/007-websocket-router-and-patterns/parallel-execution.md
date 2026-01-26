# Parallel Execution Considerations for WebSocket Implementation

## Overview

This document outlines the parallel execution challenges encountered during WebSocket implementation, both in production and testing environments, and the solutions implemented to avoid race conditions and performance issues.

## Production Considerations

### Global State and Thread Safety

#### Issue 1: Global Spec Cache

**Location**: `src/nexus/core/websocket/endpoint_factory.py:34`

```python
_SPEC_CACHE: dict[str, dict[str, Any]] = {}
```

**Problem**:
- Mutated during `scan_handler_specs()` at line 431
- NOT thread-safe by default
- Multiple workers could overwrite cache entries

**Impact**:
- Potential cache corruption in multi-worker deployments
- Race conditions when multiple processes start simultaneously

**Mitigation**:
- Cache is populated during application startup (lifespan event)
- Single-threaded router discovery with file locks
- Cache becomes read-only after startup

#### Issue 2: Singleton Handler Registry

**Location**: `src/nexus/core/websocket/discovery.py:228`

```python
_registry = HandlerRegistry()
```

**Problem**:
- Internal cache `_handlers: dict[str, ModuleType]`
- Cache operations not thread-safe
- Parallel imports can cause race conditions

**Mitigation**:
- Handler discovery runs during startup
- File-based locking prevents concurrent discovery: `/tmp/nexus_router_discovery_*.lock`
- Registry becomes read-only after startup

#### Issue 3: Dynamic Module Imports

**Location**: `src/nexus/core/websocket/endpoint_factory.py:329-341`

**Problem**:
- `importlib.util.module_from_spec()` modifies `sys.modules`
- NOT safe for parallel execution
- Can cause duplicate initialization

**Mitigation**:
- All module imports happen during startup
- File locks ensure sequential discovery across workers
- Per-worker lock files for pytest-xdist: `nexus_router_discovery_gw*.lock`

### Production Deployment Best Practices

1. **Use Process-Based Workers** (e.g., Gunicorn with `--workers`)
   - Each worker gets isolated memory space
   - No shared state between workers
   - File locks prevent discovery races

2. **Pre-fork Model**
   - Router discovery runs in main process before fork
   - Child workers inherit read-only caches
   - Eliminates discovery overhead per worker

3. **Health Check Endpoints**
   - Monitor router discovery completion
   - Verify WebSocket endpoints are registered
   - Detect startup failures early

## Testing Considerations

### Challenge 1: TestClient Incompatibility with Receive-Only Channels

#### Problem

**Location**: `tests/integration/websocket/test_receive_only_channels.py`

Starlette's `TestClient` is fundamentally incompatible with receive-only WebSocket channels:

1. **TestClient WebSocket Disconnect Behavior**
   - TestClient doesn't properly signal disconnect to server when context manager exits
   - Server endpoint waits indefinitely for client disconnect

2. **Message Queue Race Condition**
   - Both background task (sending messages) and test (receiving messages) compete for same internal queue
   - Connection stays alive based on message activity (no separate keepalive mechanism)
   - When test tries to read, endpoint is blocking the queue

3. **No Proper Disconnect Signaling**
   - Server needs to keep connection alive without consuming messages
   - TestClient provides no mechanism to wait for disconnect

#### Evidence

```python
# Bidirectional tests (use same fixture)
✅ PASS - 9 tests in 8.75s with parallel execution

# Receive-only tests (use same fixture)
❌ TIMEOUT - Even in sequential execution
```

This proves the issue is NOT the fixture scope, but the WebSocket client implementation.

#### Solution: Use Real WebSocket Client for Receive-Only Tests

**Implementation**: `tests/integration/websocket/test_receive_only_channels.py`

```python
import asyncio
from websockets import connect as websocket_connect
from uvicorn import Config, Server

@pytest.mark.asyncio
async def test_receive_only_channel_sends_events_via_on_connect(self) -> None:
    """Events sent through on_connect handler."""
    from nexus.api.main import app

    # Start real uvicorn server in background
    config = Config(app, host="127.0.0.1", port=9999, log_level="error")
    server = Server(config)
    server_task = asyncio.create_task(server.serve())

    try:
        # Wait for router discovery to complete
        await asyncio.sleep(2.0)

        # Connect with real WebSocket client
        async with websocket_connect("ws://127.0.0.1:9999/ws/example/v1/tokens") as websocket:
            # Receive messages from receive-only channel
            token_str = await websocket.recv()
            token = json.loads(token_str)
            assert "token" in token

    finally:
        # Graceful server shutdown with timeout
        server.should_exit = True
        try:
            await asyncio.wait_for(server_task, timeout=5.0)
        except asyncio.TimeoutError:
            server_task.cancel()
            try:
                await server_task
            except asyncio.CancelledError:
                pass
```

**Benefits**:
- ✅ Real WebSocket connection (no test double artifacts)
- ✅ Proper disconnect signaling
- ✅ No message queue race conditions
- ✅ Works in parallel execution

**Test Results**:
- Sequential: 3 tests in 12.19s
- Parallel (`-n auto`, 16 workers): 3 tests in 10.16s

### Challenge 2: Handler Discovery for Receive-Only Channels

#### Problem

**Location**: `src/nexus/core/websocket/discovery.py:165-187`

Handler discovery looks for `handle_{channel_name}` function to identify the correct module:

```python
# Discovery searches for this function
handler_func_name = f"handle_{channel_name}"

# If not found, returns default module
if not hasattr(found_module, handler_func_name):
    logger.warning("No handler '%s' found, using default", handler_func_name)
    module = _create_default_handler()  # <-- Missing on_connect_tokens!
```

**Impact**:
- Receive-only channels only need `on_connect_{channel_name}`
- Discovery fails to find module with `on_connect_tokens`
- Default module doesn't have the required background task function
- Server raises `ValueError` on connection

#### Solution: Add Dummy Handler Function

**Location**: `src/nexus/example/ws/example.py:461-478`

```python
async def handle_tokens(message: dict) -> dict:
    """Dummy handler for tokens channel (receive-only).

    This function exists only to satisfy handler discovery requirements.
    It should never be called since tokens is a receive-only channel.
    """
    msg = "handle_tokens should never be called - tokens is a receive-only channel"
    raise RuntimeError(msg)


async def on_connect_tokens(websocket: WebSocket, connection_id: str) -> None:
    """Background task for tokens channel - sends periodic tokens."""
    # ... actual implementation
```

**Why This Works**:
1. Discovery finds `handle_tokens` and loads the correct module
2. `on_connect_tokens` is in same module, gets discovered
3. Receive-only channel never calls `handle_tokens` (endpoint_factory.py:556-570)
4. If accidentally called, raises clear error message

### Challenge 3: Function-Scoped Fixtures Triggering Router Discovery Per Test

#### Initial Hypothesis (Partially Correct)

**Location**: `tests/conftest.py:616-626`

```python
@pytest.fixture
def sync_test_client() -> Generator[TestClient, None, None]:
    """Create a synchronous test client."""
    with TestClient(app) as client:
        yield client
```

**Problem**:
- Function scope = new app instance per test
- Each app startup triggers router discovery
- Router discovery scans filesystem, creates locks
- 54 tests = 54 × router discovery overhead

**Why It Wasn't THE Issue**:
- Bidirectional WebSocket tests use same fixture and pass
- Proves fixture scope alone doesn't cause timeouts
- But it IS inefficient and slows tests

#### Better Pattern: Session-Scoped App

**Location**: `tests/conftest.py:391-454`

```python
@pytest_asyncio.fixture(scope="session")
async def session_app(worker_id: str) -> AsyncGenerator[FastAPI, None]:
    """Session-scoped app - router discovery runs ONCE per worker."""
    async with app.router.lifespan_context(app):
        logger.info("Session app initialized for worker '%s'", worker_id)

        # Enable log propagation for pytest caplog
        nexus_logger = logging.getLogger("nexus")
        nexus_logger.propagate = True

        yield app

@pytest_asyncio.fixture
async def base_client(test_db_session: AsyncSession, session_app: FastAPI):
    """Function-scoped client using session app."""
    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield test_db_session

    session_app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(transport=ASGITransport(app=session_app), base_url="http://test") as client:
        yield client

    session_app.dependency_overrides.clear()
```

**Benefits**:
- Router discovery runs once per pytest-xdist worker
- Database session still isolated per test
- Significant performance improvement
- Used by all async API tests

**For WebSocket Tests**:
- Async WebSocket tests should use `session_app` pattern
- Receive-only tests need real server (documented above)
- Bidirectional tests work with either pattern

## Parallel Execution Best Practices

### For Production

1. **File-Based Locking**
   - Use file locks for router discovery
   - Per-worker lock files: `nexus_router_discovery_{worker_id}.lock`
   - Prevents concurrent filesystem scanning

2. **Startup-Only Mutations**
   - All global state mutations during startup
   - Read-only access during request handling
   - No runtime cache modifications

3. **Worker Isolation**
   - Process-based workers (not threads)
   - Separate memory space per worker
   - No shared state except read-only caches

### For Testing

1. **Session-Scoped Fixtures**
   - Use session-scoped app for expensive setup
   - Override only per-test resources (database session)
   - Reduces startup overhead from O(n tests) to O(1 per worker)

2. **Real Clients for Receive-Only WebSockets**
   - Use `websockets` library, not `TestClient`
   - Start uvicorn server in background
   - Proper shutdown handling with timeout

3. **Lock File Cleanup**
   - Clean up worker lock files after test session
   - Implemented in `pytest_sessionfinish` hook
   - Pattern: `nexus_router_discovery_gw*.lock`

4. **Separate Ports for Parallel Tests**
   - Each receive-only test uses unique port
   - Prevents port conflicts in parallel execution
   - Example: test 1 uses 9999, test 2 uses 10000

## Performance Metrics

### Before Optimization
- WebSocket tests: Timeout (>120s)
- Router discovery: 54 times (once per test)
- Parallel execution: Failed

### After Optimization
- Sequential execution: 3 tests in 12.19s
- Parallel execution: 3 tests in 10.16s (16 workers)
- Router discovery: 1 time per worker
- No timeouts, no race conditions

## Key Takeaways

1. **TestClient is not suitable for receive-only WebSocket channels**
   - Use real WebSocket client (`websockets` library)
   - Start actual server for integration testing

2. **Handler discovery requires `handle_{channel}` even for receive-only**
   - Add dummy handler that raises error if called
   - Keeps discovery logic simple and consistent

3. **Session-scoped fixtures dramatically improve test performance**
   - Reduce router discovery from per-test to per-worker
   - Still maintain test isolation through dependency overrides

4. **File locks prevent parallel discovery races**
   - Essential for both production and testing
   - Per-worker locks for pytest-xdist

5. **Receive-only channels need unique port per test**
   - Prevents conflicts in parallel execution
   - Simple and reliable isolation strategy

## Related Files

- Implementation: `src/nexus/core/websocket/endpoint_factory.py`
- Discovery: `src/nexus/core/websocket/discovery.py`
- Tests: `tests/integration/websocket/test_receive_only_channels.py`
- Test fixtures: `tests/conftest.py`
- Investigation: `INVESTIGATION.md`
