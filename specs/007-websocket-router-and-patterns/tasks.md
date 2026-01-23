# Tasks: Generic WebSocket API

**Input**: Design documents from `./`
**Prerequisites**: plan.md, data-model.md, src/nexus/ws/example.yaml, quickstart.md
**Strategy**: Fully dynamic WebSocket implementation with multi-channel support - everything driven by AsyncAPI specs

## Dynamic Architecture Overview

This implementation is **truly generic** - no hardcoded routes or models required:

```
AsyncAPI Spec (src/nexus/ws/example.yaml)
  └─> Defines component "example" with three channels:
      - Channel "coffee" → address: /ws/example/v1/coffee
      - Channel "chat" → address: /ws/example/v1/chat
      - Channel "agent-events" → address: /ws/example/v1/agent_events
      - Messages: Dict-based with JSON schema validation

Dynamic System Auto-discovers:
  1. Specs: Scans /ws/ directory for .yaml files
  2. Channels: Extracts all channels from each spec
  3. Routes: Registers channel-specific endpoints
  4. Handlers: Discovers optional handlers (src/nexus/ws/example.py)
  5. Interceptors: Validates configuration at bootstrap

Flow:
  1. Start app → Scan src/nexus/ws/*.yaml files
  2. For each YAML file (component):
     - Extract component name from filename (example.yaml → "example")
     - For each channel in spec:
       - Normalize channel name (agent-events → agent_events)
       - Discover handler function (handle_coffee, handle_chat, handle_agent_events)
       - Discover background task (on_connect_chat, on_connect_agent_events)
       - Create endpoint (/ws/example/v1/{channel})
       - Register route in FastAPI
  3. Runtime: Request → Validate (dict) → Handle → Respond
```

**Adding a new WebSocket endpoint requires:**
1. Add channel definition to component's AsyncAPI spec (or create new .yaml file)
2. Optional: Create handler function: `handle_{channel}(message: dict) -> dict`
3. Optional: Create background task: `on_connect_{channel}(websocket, connection_id)`
4. Restart app (endpoints auto-register)

**No code changes needed in:**
- Route registration
- Model definitions (dict-based validation)
- Endpoint handlers (generic with hook pipeline)
- Bootstrap validation (interceptors)

## Task Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Phase 1: Setup

- [X] **T001** [P] Verify WebSocket dependencies in pyproject.toml:
  - Ensure FastAPI includes WebSocket support
  - Ensure websockets client library for testing
  - Verify pytest-asyncio for async tests

- [X] **T002** [P] Create WebSocket configuration in `src/nexus/core/config/base.py`:
  ```python
  WEBSOCKET_MAX_MESSAGE_SIZE = 1048576  # 1MB
  WEBSOCKET_MAX_CONNECTIONS = 100
  WEBSOCKET_PING_INTERVAL = 30  # seconds
  WEBSOCKET_PING_TIMEOUT = 10  # seconds
  ```

## Phase 2: Tests First (TDD)

### Contract Tests
- [X] **T003** [P] Create contract test in `tests/contract/test_websocket_contracts.py`:
  - Test WebSocket connection establishment
  - Validate HelloRequest schema (name field)
  - Validate HelloResponse schema (message, timestamp)
  - Validate ErrorResponse schema (error, message, timestamp)
  - Validate against `specs/007-simple-websocket/contracts/websocket-api.yaml`

### Unit Tests
- [X] **T004** [P] Create message validator tests in `tests/unit/websocket/test_validator.py`:
  - Test valid HelloRequest (with name)
  - Test invalid JSON
  - Test missing name field
  - Test name too long (>100 chars)
  - Test name empty string
  - Test non-string name

- [X] **T005** [P] Create handler tests in `tests/unit/websocket/test_handlers.py`:
  - Test hello handler generates correct greeting
  - Test hello handler includes timestamp
  - Test error handler generates correct error codes
  - Test error handler includes timestamp

### Integration Tests
- [X] **T006** [P] Create WebSocket endpoint tests in `tests/integration/websocket/test_hello_endpoint.py`:
  - Test connection establishment to /ws/hello/v1
  - Test successful hello request/response (send {"name": "Alice"}, receive greeting)
  - Test multiple sequential requests on same connection
  - Test invalid request (missing name field) returns error
  - Test malformed JSON returns INVALID_REQUEST error
  - Test connection close by client
  - Test connection close by server

- [X] **T007** [P] Create concurrent connection tests in `tests/integration/websocket/test_concurrent_connections.py`:
  - Test 10 concurrent connections work correctly
  - Test each connection handles requests independently
  - Test connection cleanup after disconnect

## Phase 3: Core Implementation

### Message Validation (Dict-Based)
- [X] **T008** [P] Create JSON schema validator in `src/nexus/core/websocket/schema_validator.py`:
  - **Actual Implementation**: Dict-based validation using JSON schemas from AsyncAPI
  - Function: `validate_message(data: dict, message_type: str, spec_path: Path) -> None`
  - Load and cache AsyncAPI specifications
  - Extract JSON schemas from message definitions
  - Validate dict structure against JSON schema
  - Validate required fields, types, and constraints
  - Raise `ValidationError` with error type and message
  - **No model generation** - validates dicts directly

### Hook System
- [X] **T009** [P] Create hook pipeline in `src/nexus/core/websocket/hooks.py`:
  - **Actual Implementation**: Hook-based message processing pipeline
  - Class: `WebSocketHooks` with default behaviors
  - Hooks implemented:
    - `before_receive`: Validate incoming dict against AsyncAPI schema
    - `after_receive`: Optional message transformation (default: pass-through)
    - `before_send`: Add timestamp to response dict
    - `on_validation_error`: Format validation error as dict
    - `on_handler_error`: Format handler exception as dict
  - Support for handler-specific hook overrides
  - Uses `schema_validator.py` for validation

### Handler Auto-Discovery System
- [X] **T010** [P] Create handler discovery in `src/nexus/core/websocket/discovery.py`:
  - **Actual Implementation**: Component and channel-specific handler discovery
  - Discover component handler module: `src/nexus/ws/{component}.py`
  - Look up channel-specific handler function: `handle_{channel}()`
  - Look up optional background task: `on_connect_{channel}()`
  - Support for default empty handler if function doesn't exist
  - Handler interface: `async def handle_{channel}(message: dict) -> dict`
  - Background task interface: `async def on_connect_{channel}(websocket, connection_id)`

**Example Handler** (`src/nexus/ws/example.py`):
```python
"""Example WebSocket multi-channel handler.

Auto-discovered by filename: example.yaml → example.py
Defines handlers for multiple channels: coffee, chat, agent_events
"""
import random
from datetime import datetime, UTC

# Coffee channel - simple request/response
async def handle_coffee(message: dict) -> dict:
    """Convert input characters to coffee words."""
    input_text = message["input"]
    coffee_words = [COFFEE_WORDS[c.lower()] for c in input_text if c.lower() in COFFEE_WORDS]
    return {"output": " ".join(coffee_words)}

# Chat channel - bidirectional with server messages
async def handle_chat(message: dict) -> dict:
    """Echo message in uppercase."""
    return {"reply": message["message"].upper(), "type": "echo"}

async def on_connect_chat(websocket, connection_id: str):
    """Send random messages every 3 seconds."""
    while True:
        await asyncio.sleep(3)
        await websocket.send_json({
            "reply": random.choice(RANDOM_MESSAGES),
            "type": "random",
            "timestamp": datetime.now(UTC).isoformat()
        })

# Agent-events channel - subscription-based event streaming
async def handle_agent_events(message: dict) -> dict:
    """Manage event subscriptions."""
    action = message["action"]
    groups = message["groups"]
    connection_id = get_current_connection_id()

    if action == "subscribe":
        agent_subscriptions[connection_id].update(groups)
        status = "subscribed"
    elif action == "unsubscribe":
        agent_subscriptions[connection_id] -= set(groups)
        status = "unsubscribed"

    return {"status": status, "action": action, "groups": groups}

async def on_connect_agent_events(websocket, connection_id: str):
    """Send events to subscribed connections."""
    # Start independent background tasks for log and progress events
    # Events sent only if connection subscribed to that group
```

### Connection Management
- [X] **T011** Create connection manager in `src/nexus/core/websocket/connection.py`:
  - **Actual Implementation**: Connection tracking with context support
  - Class: `WebSocketConnectionManager`
  - Track active connections (in-memory dict)
  - Connection context using ContextVar for per-connection state
  - Function: `get_current_connection_id() -> str | None`
  - Methods:
    - `add_connection(connection_id: str, client_address: str, channel: str)`
    - `remove_connection(connection_id: str)`
    - `get_active_count() -> int`
  - Log connection lifecycle events
  - Enable connection-specific state (e.g., subscriptions for agent-events)

### Dynamic WebSocket Endpoint Generator
- [X] **T012** Create endpoint generator in `src/nexus/core/websocket/endpoint_factory.py`:
  - **Actual Implementation**: Multi-channel endpoint generation per component
  - Scan `src/nexus/ws/` directory for `.yaml` files
  - Extract component name from filename (example.yaml → "example")
  - For each channel in spec:
    - Normalize channel name (agent-events → agent_events)
    - Discover component handler module
    - Look up channel handler function: `handle_{channel}()`
    - Look up optional background task: `on_connect_{channel}()`
    - Create hooks instance
    - Generate generic WebSocket handler function that:
      1. Accepts connection
      2. Generates connection ID (UUID)
      3. Sets connection context (ContextVar)
      4. Registers connection with connection manager
      5. Starts optional background task
      6. Enters message loop (receive → hooks → handle → hooks → send)
      7. Cancels background task on disconnect
      8. Handles errors and cleanup
    - Return FastAPI-compatible async WebSocket endpoint

### Bootstrap Interceptor System
- [X] **T012a** [P] Create interceptor system in `src/nexus/core/websocket/interceptor.py`:
  - **Actual Implementation**: Bootstrap-time validation and lifecycle hooks
  - Class: `InterceptorRegistry` for managing interceptors
  - Lifecycle hooks:
    - `on_bootstrap_start(channels)`: Before endpoint creation
    - `before_endpoint_creation(channel_name, channel_info)`: Per channel
    - `after_endpoint_creation(channel_name, endpoint)`: Per channel
    - `on_bootstrap_complete()`: After all endpoints created
  - Built-in `ValidationInterceptor`:
    - Validates channel addresses match channel names
    - Prevents server startup on configuration errors
  - Extensible for custom bootstrap validations

### Dynamic Router Registration
- [X] **T013** Create router builder in `src/nexus/api/api/v1/websocket/__init__.py`:
  - Function: `build_websocket_router(spec_path: str | None = None) -> APIRouter`
  - **Auto-discovery mode (spec_path=None)**:
    - Call `scan_handler_specs()` to find all handlers using automatic path mapping
    - Load AsyncAPI specs from convention-derived paths
    - Create endpoints for all channels in all discovered specs
  - **Explicit mode (spec_path provided)**:
    - Load single AsyncAPI spec from provided path
    - Create endpoints for all channels in that spec
  - For each channel in each spec:
    - Call `create_websocket_endpoint()` to create endpoint handler
    - Register endpoint using `router.add_websocket_route(address, endpoint)`
  - Return configured APIRouter for inclusion in main API

**Example Usage** in `src/nexus/api/main.py`:
```python
from fastapi import FastAPI
from nexus.api.v1.websocket import build_websocket_router

app = FastAPI()

# Auto-discovery mode: Scans all handlers using automatic path mapping
ws_router = build_websocket_router()
app.include_router(ws_router)

# That's it! All endpoints are auto-registered:
# 1. System scans src/nexus/{component}/ws/*.py for handlers
# 2. Derives spec path: {handler}.py → src/nexus/schemas/{component}/websocket-{handler}.yaml
# 3. Loads AsyncAPI specs from derived paths
# 4. Creates endpoints for all channels in all specs
# - Any future handlers added will be auto-discovered

# Alternative: Explicit spec mode (optional)
# from pathlib import Path
# spec_path = Path("specs/007-simple-websocket/contracts/websocket-api.yaml")
# ws_router = build_websocket_router(spec_path)
```

**Complete Example: Adding a New Endpoint**

To add a new WebSocket endpoint, you only need to:

1. **Define the channel in AsyncAPI spec** (or use existing spec):
```yaml
# In specs/007-simple-websocket/contracts/websocket-api.yaml
channels:
  echo:
    address: /ws/echo/v1
    messages:
      echoRequest:
        $ref: '#/components/messages/EchoRequest'
      echoResponse:
        $ref: '#/components/messages/EchoResponse'
```

2. **Create handler at `src/nexus/example/ws/echo.py`**:
```python
"""Echo WebSocket handler - auto-discovered from channel name 'echo'."""
# Schema automatically mapped to: schemas/example/websocket-echo.yaml

async def handle_echo(message: dict) -> dict:
    """Echo back the received message."""
    return {"text": message["text"]}
```

3. **Create spec at `schemas/example/websocket-echo.yaml`**

4. **Restart app** → endpoint `/ws/example/v1/echo` is automatically available!

**How it works:**
- On startup, `build_websocket_router()` scans `src/nexus/example/ws/echo.py`
- Derives spec path: `echo.py` → `schemas/example/websocket-echo.yaml`
- Validates handler/spec pairing exists (fail-fast if missing)
- Loads the spec and finds the "echo" channel definition
- Creates and registers endpoint at `/ws/example/v1/echo`
- Auto-discovers `handle_echo()` function from `echo.py`

**Warning:** If a handler file has no corresponding spec file, startup fails with an error message.

## Phase 3.5: Example Component Implementation

### Coffee Channel (Request/Response)
- [X] **T013a** [P] Implement coffee channel in `src/nexus/ws/example.py`:
  - **Actual Implementation**: Character-to-coffee-word converter
  - Handler: `async def handle_coffee(message: dict) -> dict`
  - Maps each character in input to a coffee word
  - Returns: `{"output": "space-separated coffee words"}`
  - No background task (simple request/response)

### Chat Channel (Bidirectional)
- [X] **T013b** [P] Implement chat channel in `src/nexus/ws/example.py`:
  - **Actual Implementation**: Uppercase echo + random server messages
  - Handler: `async def handle_chat(message: dict) -> dict`
  - Returns: `{"reply": message.upper(), "type": "echo"}`
  - Background task: `async def on_connect_chat(websocket, connection_id)`
    - Sends random messages every 3 seconds
    - Messages have `type: "random"`
    - Cancelled on disconnect

### Agent-Events Channel (Subscription-Based)
- [X] **T013c** [P] Implement agent-events channel in `src/nexus/ws/example.py`:
  - **Actual Implementation**: Dynamic subscription management for event streams
  - Handler: `async def handle_agent_events(message: dict) -> dict`
    - Processes subscribe/unsubscribe actions
    - Updates global subscription dictionary per connection
    - Uses `get_current_connection_id()` for connection-specific state
    - Returns: `{"status": "subscribed/unsubscribed", "action": "...", "groups": [...]}`
  - Background task: `async def on_connect_agent_events(websocket, connection_id)`
    - Starts two independent event generators (log and progress)
    - Each generates events every 3-8 seconds (random interval)
    - Events only sent if connection subscribed to that group
    - Log events: `{"type": "event", "group": "log", "level": "...", "message": "..."}`
    - Progress events: `{"type": "event", "group": "progress", "progress": N, "task": "..."}`
  - Global subscription tracking:
    - Dictionary mapping connection_id → set of subscribed groups
    - Initialized empty on connect
    - Cleaned up on disconnect

## Phase 4: Observability

### Logging
- [X] **T014a** [P] Add basic logging in `src/nexus/core/websocket/connection.py`:
  - Log connection established (INFO level)
  - Log connection closed (INFO level)
  - Log errors (ERROR level)
  - Include: connection_id, client_address, timestamp

- [ ] **T014b** [P] Upgrade to structured logging:
  - Convert to structlog framework
  - Add message received logging (DEBUG level)
  - Add message sent logging (DEBUG level)
  - Implement JSON-formatted structured output

### Metrics
- [ ] **T015** [P] Add metrics collection in `src/nexus/core/websocket/metrics.py`:
  - Counter: `websocket_connections_total` (connections established, labeled by channel)
  - Gauge: `websocket_connections_active` (current active connections, labeled by channel)
  - Counter: `websocket_messages_received_total` (labeled by channel)
  - Counter: `websocket_messages_sent_total` (labeled by channel)
  - Counter: `websocket_errors_total` (by error type and channel)
  - Histogram: `websocket_message_processing_duration_seconds` (labeled by channel)

- [ ] **T016** Integrate metrics into endpoint factory:
  - Generated endpoints automatically record metrics
  - All metrics labeled by channel name (e.g., channel="hello")
  - No hardcoded channel names in metrics code

## Phase 5: Documentation & Polish

### API Documentation
- [ ] **T017** [P] Auto-generate API documentation from AsyncAPI spec:
  - Use AsyncAPI spec to generate markdown documentation
  - Document all available channels and their paths
  - Include message schemas and examples from spec
  - Generate client code examples for each channel
  - Save to `docs/api/websocket-generated.md`

### Example Handler Creator
- [ ] **T018** [P] Create handler template generator in `tools/create_ws_handler.py`:
  - Read AsyncAPI spec
  - List available channels without handlers
  - Generate skeleton handler code for new channels
  - Example: `python tools/create_ws_handler.py hello` creates `src/nexus/ws/hello.py`

## Phase 6: Testing & Validation

### Integration Testing
- [ ] **T019** Run full integration test suite:
  - All tests in tests/integration/websocket/ pass
  - Test with concurrent connections
  - Verify no memory leaks
  - Check connection cleanup

### Performance Testing
- [ ] **T020** Create performance test in `tests/performance/test_websocket_load.py`:
  - Test 100 concurrent connections
  - Test 1000 messages/second throughput
  - Measure latency (p50, p95, p99)
  - Monitor memory usage

### Manual Testing
- [ ] **T021** Manual testing checklist:
  - Connect using websocat or similar tool
  - Send valid requests and verify responses
  - Send invalid requests and verify error handling
  - Test connection stability over time
  - Verify graceful shutdown

## Success Criteria

All tasks completed when:
- ✓ All tests passing (unit, integration, contract)
- ✓ Endpoints auto-registered from AsyncAPI spec (no hardcoded routes)
- ✓ Handlers auto-discovered from channel names (e.g., hello → src/nexus/ws/hello.py)
- ✓ All message models dynamically generated from spec
- ✓ Validation rules extracted from spec (no hardcoded validation)
- ✓ Error handling working correctly
- ✓ Multiple sequential requests per connection work
- ✓ Concurrent connections work correctly
- ✓ Metrics labeled by channel name (generic, not hardcoded)
- ✓ Documentation auto-generated from spec
- ✓ System works with any AsyncAPI WebSocket specification (truly generic)
