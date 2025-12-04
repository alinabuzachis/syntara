# WebSocket Hook System Documentation

**Feature**: Hook-Based Message Processing Pipeline
**Date**: 2025-10-29
**Purpose**: Document the WebSocket hook system for validation and interception

## Overview

The WebSocket system provides two types of extension points:

1. **Runtime Hooks**: Message processing pipeline that executes for each WebSocket message
2. **Bootstrap Interceptors**: Configuration validation that executes once during server startup

This document covers both systems.

### Runtime Hooks

The WebSocket system uses a hook-based pipeline for message processing, providing interception points at key stages of the message lifecycle. Hooks have default behaviors that can be overridden per handler.

**Key Benefits**:
- **Separation of concerns**: Validation, processing, and formatting are separate
- **Extensibility**: Override any hook without modifying framework code
- **Testability**: Each hook can be tested independently
- **Composability**: Hooks can call other functions or services

### Bootstrap Interceptors

Bootstrap interceptors validate configuration before the server accepts any connections, preventing misconfigurations from reaching production.

**Key Benefits**:
- **Early validation**: Catch errors at startup, not at runtime
- **Configuration safety**: Ensure channel definitions match implementation
- **Extensibility**: Add custom validation checks
- **Clean failure**: Server won't start with invalid configuration

## Hook Pipeline Flow

```
Client Message
    ↓
receive_json() → Dict
    ↓
[before_receive] ──→ ValidationError? ──→ [on_validation_error] → Send Error
    ↓ Valid
[after_receive]
    ↓
Handler Module ──→ Exception? ──→ [on_handler_error] → Send Error
    ↓ Success
[before_send]
    ↓
send_json() → Client
```

## Available Hooks

### 1. `before_receive`

**Purpose**: Validate incoming messages against AsyncAPI schema

**Signature**:
```python
async def before_receive(self, data: dict, message_type: str, channel: str) -> dict:
    ...
```

**Parameters**:
- `data`: Raw message dict from `websocket.receive_json()`
- `message_type`: Expected message type name (e.g., "ExampleRequest")
- `channel`: Channel name (e.g., "example")

**Default Behavior**:
- Validates dict against AsyncAPI JSON schema
- Checks required fields
- Validates field types and constraints
- Raises `ValidationError` if invalid

**Override Example**:
```python
# In example.py
from nexus.core.websocket import ValidationError

async def before_receive(data: dict, message_type: str, channel: str) -> dict:
    # Custom validation: reject offensive content
    if "badword" in data.get("input", "").lower():
        raise ValidationError("VALIDATION_ERROR", "Invalid input content")

    # Still perform schema validation
    from nexus.core.websocket import validate_message
    from pathlib import Path
    validate_message(data, message_type, Path(__file__).parent / "example.yaml")

    return data
```

**When to Override**:
- Add custom validation rules beyond schema
- Sanitize input data
- Check against external validation services
- Rate limiting or quota checks

---

### 2. `after_receive`

**Purpose**: Process validated messages before passing to handler

**Signature**:
```python
async def after_receive(self, data: dict, channel: str) -> dict:
    ...
```

**Parameters**:
- `data`: Validated message dict (passed `before_receive`)
- `channel`: Channel name

**Default Behavior**:
- Pass-through (returns data unchanged)

**Override Example**:
```python
# In example.py
async def after_receive(data: dict, channel: str) -> dict:
    # Enrich data with context
    data["_timestamp_received"] = datetime.now(UTC).isoformat()
    data["_channel"] = channel

    # Transform data
    data["input"] = data["input"].lower().strip()

    return data
```

**When to Override**:
- Enrich messages with metadata
- Transform data structure
- Add context from external services (user lookup, etc.)
- Logging or auditing

---

### 3. `before_send`

**Purpose**: Finalize response before sending to client

**Signature**:
```python
async def before_send(self, response: dict, channel: str) -> dict:
    ...
```

**Parameters**:
- `response`: Response dict from handler
- `channel`: Channel name

**Default Behavior**:
- Adds `timestamp` field if not present (ISO 8601 UTC)

**Override Example**:
```python
# In example.py
from datetime import UTC, datetime

async def before_send(response: dict, channel: str) -> dict:
    # Always add timestamp (override if present)
    response["timestamp"] = datetime.now(UTC).isoformat()

    # Add metadata
    response["_channel"] = channel
    response["_version"] = "1.0"

    # Filter sensitive fields
    response.pop("_internal_data", None)

    return response
```

**When to Override**:
- Add response metadata
- Transform response structure
- Filter sensitive fields
- Add caching headers or ETags

---

### 4. `on_validation_error`

**Purpose**: Format validation errors into response dicts

**Signature**:
```python
async def on_validation_error(self, error: ValidationError, channel: str) -> dict:
    ...
```

**Parameters**:
- `error`: ValidationError instance with `error_type`, `message`, and optional `field`
- `channel`: Channel name

**Default Behavior**:
- Returns standard error format:
  ```python
  {
      "error": error.error_type,
      "message": error.message,
      "timestamp": datetime.now(UTC).isoformat()
  }
  ```

**Override Example**:
```python
# In example.py
from datetime import UTC, datetime

async def on_validation_error(error: ValidationError, channel: str) -> dict:
    # Detailed error response
    return {
        "error": error.error_type,
        "message": error.message,
        "field": error.field if hasattr(error, 'field') else None,
        "channel": channel,
        "timestamp": datetime.now(UTC).isoformat(),
        "help_url": f"https://docs.example.com/errors/{error.error_type}"
    }
```

**When to Override**:
- Add detailed error information
- Include help URLs or documentation links
- Log errors to monitoring system
- Translate error messages

---

### 5. `on_handler_error`

**Purpose**: Handle internal errors from handler execution

**Signature**:
```python
async def on_handler_error(self, error: Exception, channel: str) -> dict:
    ...
```

**Parameters**:
- `error`: Exception raised by handler
- `channel`: Channel name

**Default Behavior**:
- Returns generic error:
  ```python
  {
      "error": "INTERNAL_ERROR",
      "message": f"Handler error: {str(error)}",
      "timestamp": datetime.now(UTC).isoformat()
  }
  ```

**Override Example**:
```python
# In example.py
import logging
from datetime import UTC, datetime

logger = logging.getLogger(__name__)

async def on_handler_error(error: Exception, channel: str) -> dict:
    # Log error with context
    logger.exception("Handler error on channel %s", channel, exc_info=error)

    # Alert monitoring system
    # await alert_system.send(error, channel)

    # Return user-friendly error (hide implementation details)
    return {
        "error": "INTERNAL_ERROR",
        "message": "An unexpected error occurred. Please try again later.",
        "timestamp": datetime.now(UTC).isoformat(),
        "support_id": str(uuid.uuid4())  # For support tracking
    }
```

**When to Override**:
- Add error logging and monitoring
- Classify errors by type
- Retry logic for transient errors
- Generate support tickets or alerts
- Hide sensitive error details from clients

---

## Hook Discovery

Hooks are discovered automatically from handler modules in the `src/nexus/{component}/ws/` directory. If a handler implements a function with a matching hook name, it replaces the default.

**Discovery Process**:
1. Framework scans `src/nexus/{component}/ws/*.py` for handler files
2. Spec path is automatically derived: `{handler}.py` → `schemas/{component}/websocket-{handler}.yaml`
3. Handler/spec pairing is validated (fail-fast if mismatch)
4. Endpoint factory creates `WebSocketHooks` instance with defaults
5. For each hook name, check if handler has matching function
6. If found, replace default hook with handler's version

**Example Handler with Hooks**:
```python
# src/nexus/example/ws/example.py
# Schema automatically mapped to: schemas/example/websocket-example.yaml

from typing import Any
from datetime import UTC, datetime
from nexus.core.websocket import ValidationError

# Handler function (required)
async def handle_coffee(message: dict[str, Any]) -> dict[str, Any]:
    """Process message and return response."""
    input_text = message["input"]
    output = process_input(input_text)  # Your business logic
    return {"output": output}

# Override hooks (optional)
async def before_receive(data: dict, message_type: str, channel: str) -> dict:
    """Custom validation."""
    # Your validation logic
    return data

async def before_send(response: dict, channel: str) -> dict:
    """Custom response formatting."""
    response["timestamp"] = datetime.now(UTC).isoformat()
    response["version"] = "2.0"
    return response
```

---

## Automatic Path Mapping

The framework automatically maps handler files to their AsyncAPI specifications based on filename convention. No configuration is needed.

### Convention

```
src/nexus/{component}/ws/{handler}.py  →  schemas/{component}/websocket-{handler}.yaml
```

### Examples

| Handler File | Schema File |
|--------------|-------------|
| `example.py` | `websocket-example.yaml` |
| `invocations.py` | `websocket-invocations.yaml` |
| `chat.py` | `websocket-chat.yaml` |

### Fail-Fast Validation

At startup, the framework validates handler/spec pairing:

**Handler without spec** (causes startup error):
```
ValueError: Handler file 'orphan.py' in component 'example' has no corresponding spec file.
Expected: schemas/example/websocket-orphan.yaml
```

**Spec without handler** (causes startup error):
```
ValueError: Found 1 orphan spec file(s) without corresponding handlers:
  - schemas/example/websocket-missing.yaml (expected handler: src/nexus/example/ws/missing.py)
```

### Discovery and Caching

**At startup**:
1. All `.py` files in `src/nexus/{component}/ws/` are scanned
2. Spec path is derived from handler filename
3. Handler/spec pairing is validated (fail-fast if mismatch)
4. AsyncAPI schema is loaded and parsed
5. If component has multiple handlers, schemas are merged
6. Merged schema is cached in `_SPEC_CACHE[component_name]`

**At runtime**:
- Validation uses cached schema (no file I/O)
- Fast schema lookups by component name
- Consistent validation across all channels in component

---

## Bootstrap Interceptors

Bootstrap interceptors run during server startup to validate WebSocket configuration before accepting connections.

### Interceptor Lifecycle

```
Server Startup
    ↓
InterceptorRegistry.on_bootstrap_start(channels)
    ↓
For each channel:
    InterceptorRegistry.before_endpoint_creation(channel_name, channel_info)
    ↓
    Create endpoint
    ↓
    InterceptorRegistry.after_endpoint_creation(channel_name, endpoint)
    ↓
InterceptorRegistry.on_bootstrap_complete()
    ↓
Server Ready (or Exit if validation fails)
```

### Built-in Interceptors

#### ValidationInterceptor

Validates that channel addresses in AsyncAPI specs match actual channel names.

**Example Issue Caught**:
```yaml
# In example.yaml
channels:
  coffee:
    address: /ws/example/v1/tea  # ❌ Mismatch! Should be /ws/example/v1/coffee
```

**Error at Startup**:
```
ValidationError: Channel 'coffee' address mismatch
Expected: /ws/example/v1/coffee
Got: /ws/example/v1/tea
```

### Custom Interceptors

Create custom interceptors for application-specific validation:

```python
# custom_interceptor.py
from nexus.core.websocket.interceptor import BaseInterceptor

class AuthInterceptor(BaseInterceptor):
    """Validate that all channels have authentication configured."""

    async def before_endpoint_creation(
        self, channel_name: str, channel_info: dict
    ) -> None:
        # Check if channel requires authentication
        if not channel_info.get("security"):
            raise ValueError(
                f"Channel '{channel_name}' missing security configuration"
            )

# Register in router builder
from nexus.core.websocket.interceptor import InterceptorRegistry

registry = InterceptorRegistry()
registry.register(AuthInterceptor())
```

### When to Use Interceptors

**Use Interceptors For**:
- Configuration validation
- Required handler function checks
- Security policy enforcement
- Resource initialization (connection pools, caches)
- Metrics registration

**Don't Use Interceptors For**:
- Per-message validation (use runtime hooks instead)
- Business logic
- Request processing
- Dynamic behavior

---

## Connection Context

The WebSocket system provides connection-specific context accessible from any handler or background task.

### Accessing Connection Context

```python
from nexus.core.websocket.connection import get_current_connection_id

async def handle_agent_events(message: dict) -> dict:
    """Handler with connection-specific state."""
    # Get current connection ID
    connection_id = get_current_connection_id()

    # Use connection ID for per-connection state
    action = message["action"]
    groups = message["groups"]

    if action == "subscribe":
        # Store subscription for this specific connection
        subscriptions[connection_id].update(groups)

    return {"status": "subscribed", "action": action, "groups": groups}
```

### Connection Context Lifecycle

```
Connection Established
    ↓
Generate connection_id (UUID)
    ↓
Set connection context: _connection_context.set(connection_id)
    ↓
Connection context available in:
  - Handler functions (handle_*)
  - Background tasks (on_connect_*)
  - Hook overrides
    ↓
Connection Closed
    ↓
Context cleanup (automatic via ContextVar)
```

### Use Cases

**Subscription Management** (agent-events channel):
```python
# Global subscription tracking
agent_subscriptions: dict[str, set[str]] = defaultdict(set)

async def handle_agent_events(message: dict) -> dict:
    connection_id = get_current_connection_id()

    if message["action"] == "subscribe":
        agent_subscriptions[connection_id].update(message["groups"])
    elif message["action"] == "unsubscribe":
        agent_subscriptions[connection_id] -= set(message["groups"])

    return {"status": "ok"}

async def on_connect_agent_events(websocket, connection_id: str):
    """Send events only to subscribed connections."""
    while True:
        await asyncio.sleep(random.randint(3, 8))

        # Check if this connection is subscribed
        if "log" in agent_subscriptions[connection_id]:
            await websocket.send_json({
                "type": "event",
                "group": "log",
                "message": "Log event"
            })
```

**Rate Limiting**:
```python
# Track requests per connection
request_counts: dict[str, int] = defaultdict(int)

async def before_receive(data: dict, message_type: str, channel: str) -> dict:
    connection_id = get_current_connection_id()

    request_counts[connection_id] += 1

    if request_counts[connection_id] > 100:  # per connection limit
        raise ValidationError("RATE_LIMIT", "Too many requests")

    return data
```

**Connection-Scoped Caching**:
```python
# Cache per connection
connection_cache: dict[str, dict] = {}

async def after_receive(data: dict, channel: str) -> dict:
    connection_id = get_current_connection_id()

    # Get or create cache for this connection
    if connection_id not in connection_cache:
        connection_cache[connection_id] = {}

    # Use cached data
    cache = connection_cache[connection_id]
    # ... cache logic ...

    return data
```

---

## Best Practices

### 1. Keep Hooks Focused
Each hook should have a single responsibility:
- `before_receive`: Validation only
- `after_receive`: Data enrichment only
- `before_send`: Response formatting only

### 2. Avoid Side Effects in Validation
Validation hooks (`before_receive`) should not modify external state or call APIs. Keep them pure.

### 3. Handle Errors Gracefully
Always catch and handle exceptions in hooks. Let `on_handler_error` catch unexpected errors.

### 4. Log Important Events
Use hooks to log validation failures, processing errors, and important business events.

### 5. Document Custom Hooks
If you override hooks, document the behavior in the handler module's docstring.

### 6. Test Hooks Independently
Write unit tests for each hook override:
```python
# test_example_hooks.py
async def test_before_receive_rejects_invalid_input():
    from example import before_receive
    data = {"input": "badword"}
    with pytest.raises(ValidationError):
        await before_receive(data, "ExampleRequest", "example")
```

## Hook Execution Order

For a successful message:
1. `websocket.receive_json()` → dict
2. `before_receive(dict, message_type, channel)` → validated_dict
3. `after_receive(validated_dict, channel)` → processed_dict
4. `handler.handle_message(processed_dict)` → response_dict
5. `before_send(response_dict, channel)` → final_dict
6. `websocket.send_json(final_dict)`

For validation error:
1. `websocket.receive_json()` → dict
2. `before_receive(dict, message_type, channel)` → raises ValidationError
3. `on_validation_error(error, channel)` → error_dict
4. `websocket.send_json(error_dict)`

For handler error:
1. Steps 1-3 successful
2. `handler.handle_message(processed_dict)` → raises Exception
3. `on_handler_error(error, channel)` → error_dict
4. `websocket.send_json(error_dict)`

## Message Handling Patterns

The WebSocket system uses dict-based messages validated against AsyncAPI schemas. No model classes are generated - handlers work directly with Python dicts.

### Simple Request/Response (Coffee Channel)

```python
# src/nexus/example/ws/example.py
# Schema: schemas/example/websocket-example.yaml (automatic mapping)

async def handle_coffee(message: dict) -> dict:
    """Convert input characters to coffee words."""
    input_text = message["input"]  # Already validated by before_receive hook

    # Business logic
    coffee_words = [COFFEE_WORDS[c.lower()] for c in input_text]

    # Return dict - timestamp added automatically by before_send hook
    return {"output": " ".join(coffee_words)}
```

### Bidirectional with Background Task (Chat Channel)

```python
# src/nexus/example/ws/example.py
# Schema automatically mapped to: schemas/example/websocket-example.yaml

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
```

### Subscription-Based with Connection State (Agent-Events Channel)

```python
# src/nexus/example/ws/example.py
# Schema automatically mapped to: schemas/example/websocket-example.yaml
from collections import defaultdict
from nexus.core.websocket.connection import get_current_connection_id

# Global subscription tracking
agent_subscriptions: dict[str, set[str]] = defaultdict(set)

async def handle_agent_events(message: dict) -> dict:
    """Manage event subscriptions."""
    connection_id = get_current_connection_id()

    action = message["action"]
    groups = message["groups"]

    if action == "subscribe":
        agent_subscriptions[connection_id].update(groups)
        status = "subscribed"
    elif action == "unsubscribe":
        agent_subscriptions[connection_id] -= set(groups)
        status = "unsubscribed"

    return {"status": status, "action": action, "groups": groups}

async def on_connect_agent_events(websocket, connection_id: str):
    """Send events only to subscribed connections."""
    # Start independent background tasks for each event group
    async def send_log_events():
        while True:
            await asyncio.sleep(random.randint(3, 8))
            if "log" in agent_subscriptions[connection_id]:
                await websocket.send_json({
                    "type": "event",
                    "group": "log",
                    "level": "info",
                    "message": "Processing...",
                    "timestamp": datetime.now(UTC).isoformat()
                })

    async def send_progress_events():
        while True:
            await asyncio.sleep(random.randint(3, 8))
            if "progress" in agent_subscriptions[connection_id]:
                await websocket.send_json({
                    "type": "event",
                    "group": "progress",
                    "progress": random.randint(0, 100),
                    "task": "Data processing",
                    "timestamp": datetime.now(UTC).isoformat()
                })

    # Run both event generators concurrently
    await asyncio.gather(send_log_events(), send_progress_events())
```

## Future Enhancements

**Planned**:
- Async hook composition (chain multiple hooks)
- Hook middleware pattern
- Pre-connection hooks (authentication before accept)
- Post-connection hooks (session initialization)

**Under Consideration**:
- Hook priority/ordering
- Conditional hook execution
- Hook performance metrics
- Hook debugging tools
