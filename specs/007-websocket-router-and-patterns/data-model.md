# Data Model: Generic WebSocket API

**Feature**: Multi-Channel WebSocket System with Convention-Based Discovery
**Date**: 2025-10-23
**Last Updated**: 2025-10-29

## Overview

This feature provides a generic, extensible multi-channel WebSocket router system with hook-based message processing. Messages are plain Python dicts validated against AsyncAPI schemas per channel. No persistent storage is required—all data exists only during the lifetime of active connections.

**Key Characteristics**:
- Dict-based message handling (no ORM/model classes)
- JSON schema validation via hooks per channel
- Multi-channel support with channel-specific message types
- Convention-based channel discovery
- Optional handlers with defaults

**File Organization**:
- **Handler files**: Located in `src/nexus/{component}/ws/*.py`
- **Schema files**: Centralized in `schemas/{component}/websocket-{handler}.[yaml,yml]`
- **Automatic path mapping**: `{handler}.py` → `websocket-{handler}.yaml` (no configuration needed)
- **Fail-fast validation**: Handler/spec pairing is validated at startup
- **Component-level merging**: Multiple schemas per component are merged into a single specification

## Example Component Channels

The example component demonstrates three channel types:
- **Coffee Channel**: Request/response pattern for text-to-coffee-word conversion
- **Chat Channel**: Bidirectional communication with server-initiated random messages
- **Agent-Events Channel**: Subscription-based event streaming with dynamic subscription management

## Entities

### Coffee Channel Messages

#### 1. CoffeeRequest (Ephemeral Dict)

Represents a client request for coffee word generation.

**Fields**:
- `input` (str, required): The input text to transform into coffee-themed words

**Validation Rules** (from AsyncAPI schema):
- `input` must be a string
- `input` must be between 1 and 100 characters
- `input` must be valid UTF-8

**Dict Format**:
```json
{
  "input": "hi"
}
```

**Processing**:
- No model class created
- Validated as plain dict via `before_receive` hook
- Passed directly to `handle_coffee()` handler as dict

**Lifecycle**: Received → Validated → Processed → Discarded

#### 2. CoffeeResponse (Ephemeral Dict)

Represents a server response containing coffee words.

**Fields**:
- `output` (str, required): Space-separated coffee words corresponding to input characters
- `timestamp` (str, optional): ISO 8601 timestamp (added by `before_send` hook)

**Dict Format**:
```json
{
  "output": "espresso hario",
  "timestamp": "2025-10-29T10:30:00.000Z"
}
```

**Example Mappings**:
- "h" → "espresso"
- "i" → "hario"
- "t" → "turkish"
- "e" → "extraction"
- "a" → "arabica"

**Processing**:
- `handle_coffee()` returns dict with `output` only
- `before_send` hook adds `timestamp` automatically
- Sent directly via `websocket.send_json()`

**Lifecycle**: Created by handler → Finalized by hook → Sent → Discarded

### Chat Channel Messages

#### 3. ChatRequest (Ephemeral Dict)

Represents a client message for uppercase echo.

**Fields**:
- `message` (str, required): The chat message to echo in uppercase

**Validation Rules** (from AsyncAPI schema):
- `message` must be a string
- `message` must be between 1 and 1000 characters
- `message` must be valid UTF-8

**Dict Format**:
```json
{
  "message": "hello world"
}
```

**Processing**:
- Validated as plain dict via `before_receive` hook
- Passed directly to `handle_chat()` handler as dict

**Lifecycle**: Received → Validated → Processed → Discarded

#### 4. ChatResponse (Ephemeral Dict)

Represents a server response for chat (echo or random message).

**Fields**:
- `reply` (str, required): The chat reply (uppercase echo or random message)
- `type` (str, required): Message type indicator - "echo" or "random"
- `timestamp` (str, optional): ISO 8601 timestamp (added by `before_send` hook)

**Dict Format (Echo)**:
```json
{
  "reply": "HELLO WORLD",
  "type": "echo",
  "timestamp": "2025-10-29T10:30:00.000Z"
}
```

**Dict Format (Random Server Message)**:
```json
{
  "reply": "How's your day going?",
  "type": "random",
  "timestamp": "2025-10-29T10:30:03.000Z"
}
```

**Processing**:
- Echo: `handle_chat()` returns dict with uppercase message and type="echo"
- Random: `on_connect_chat()` background task sends random message with type="random" every 3 seconds
- `before_send` hook adds `timestamp` automatically
- Sent directly via `websocket.send_json()`

**Lifecycle**:
- Echo: Created by handler → Finalized by hook → Sent → Discarded
- Random: Created by background task → Sent → Discarded

### Agent-Events Channel Messages

#### 5. AgentEventsRequest (Ephemeral Dict)

Represents a client request to manage event subscriptions.

**Fields**:
- `action` (str, required): Action to perform - "subscribe" or "unsubscribe"
- `groups` (array[str], required): List of event groups to subscribe/unsubscribe ("log", "progress")

**Validation Rules** (from AsyncAPI schema):
- `action` must be one of: "subscribe", "unsubscribe"
- `groups` must be a non-empty array of strings
- Each group must be one of the supported event groups

**Dict Format (Subscribe)**:
```json
{
  "action": "subscribe",
  "groups": ["log", "progress"]
}
```

**Dict Format (Unsubscribe)**:
```json
{
  "action": "unsubscribe",
  "groups": ["log"]
}
```

**Processing**:
- Validated as plain dict via `before_receive` hook
- Passed directly to `handle_agent_events()` handler as dict
- Handler uses `get_current_connection_id()` to access connection-specific subscription state
- Updates global subscription dictionary for this connection

**Lifecycle**: Received → Validated → Processed (subscription state updated) → Discarded

#### 6. AgentEventsResponse (Ephemeral Dict)

Represents a server confirmation of subscription changes.

**Fields**:
- `status` (str, required): Status indicator - "subscribed" or "unsubscribed"
- `action` (str, required): Echo of the action performed
- `groups` (array[str], required): Echo of the groups affected
- `timestamp` (str, optional): ISO 8601 timestamp (added by `before_send` hook)

**Dict Format**:
```json
{
  "status": "subscribed",
  "action": "subscribe",
  "groups": ["log", "progress"],
  "timestamp": "2025-10-29T10:30:00.000Z"
}
```

**Processing**:
- `handle_agent_events()` returns dict with status, action, and groups
- `before_send` hook adds `timestamp` automatically
- Sent directly via `websocket.send_json()`

**Lifecycle**: Created by handler → Finalized by hook → Sent → Discarded

#### 7. AgentEvent (Ephemeral Dict)

Represents a server-initiated event sent to subscribed connections.

**Fields (Common)**:
- `type` (str, required): Always "event" for event messages
- `group` (str, required): Event group identifier ("log" or "progress")
- `timestamp` (str, required): ISO 8601 timestamp when event was generated

**Fields (Log Events - group="log")**:
- `level` (str, required): Log level - "info", "warning", "error", or "debug"
- `message` (str, required): Log message content

**Fields (Progress Events - group="progress")**:
- `progress` (int, required): Progress percentage (0-100)
- `task` (str, required): Task description

**Dict Format (Log Event)**:
```json
{
  "type": "event",
  "group": "log",
  "level": "info",
  "message": "Processing data...",
  "timestamp": "2025-10-29T10:30:05.000Z"
}
```

**Dict Format (Progress Event)**:
```json
{
  "type": "event",
  "group": "progress",
  "progress": 45,
  "task": "Data analysis",
  "timestamp": "2025-10-29T10:30:08.000Z"
}
```

**Processing**:
- Created by `on_connect_agent_events()` background task
- Two independent background tasks (one per event group) generate events every 3-8 seconds (random interval)
- Events only sent if connection is subscribed to that group (checked via global subscription dictionary)
- Sent directly via `websocket.send_json()` without going through handler

**Lifecycle**: Created by background task → Sent (if subscribed) → Discarded

**Subscription Management**:
- Global subscription dictionary tracks which connections are subscribed to which groups
- Key: connection_id (from `get_current_connection_id()`)
- Value: set of subscribed groups (e.g., {"log", "progress"})
- Initialized empty on connection
- Cleaned up on disconnect

### Shared Error Message

#### 8. ErrorResponse (Ephemeral Dict)

Represents an error response for invalid requests or processing failures across all channels.

**Fields**:
- `error` (str, required): Error type identifier
- `message` (str, required): Human-readable error description
- `timestamp` (str, required): ISO 8601 timestamp when error occurred (UTC)

**Dict Format**:
```json
{
  "error": "VALIDATION_ERROR",
  "message": "Field 'input' is required",
  "timestamp": "2025-10-23T10:30:15.000Z"
}
```

**Error Types**:
- **INVALID_REQUEST**: Malformed JSON (detected by `receive_json()`)
- **VALIDATION_ERROR**: Missing or invalid required fields (from `before_receive` hook)
- **INTERNAL_ERROR**: Server-side processing failure (from handler)

**Processing**:
- Generated by hook methods (`on_validation_error`, `on_handler_error`)
- No model class required
- Sent directly as dict

**Lifecycle**: Error detected → Hook formats dict → Sent → Discarded

### 9. WebSocketConnection (Transient State)

Represents an active client connection to the WebSocket endpoint.

**Fields**:
- `connection_id` (UUID, required): Unique identifier for this connection (generated internally)
- `client_address` (str, required): Client IP address and port
- `connected_at` (datetime, required): Connection establishment timestamp
- `channel` (str, required): Channel name (e.g., "coffee", "chat", "agent_events")

**Connection Context**:
- Connection ID stored in ContextVar for access within handlers
- Accessible via `get_current_connection_id()` function
- Enables connection-specific state management (e.g., subscriptions)

**Subscription State (agent-events channel only)**:
- Global dictionary mapping connection_id → set of subscribed event groups
- Managed by `handle_agent_events()` handler
- Cleaned up on disconnect

**Storage**: In-memory only (Python object, no persistence)
**Lifetime**: Duration of WebSocket connection only

**Validation Rules**:
- Connection must be established before accepting messages
- Connection must be cleaned up on disconnect

## Data Relationships

```
Client Connection (In-Memory)
  ├── Coffee Channel
  │   ├── receives → CoffeeRequest Dict (Ephemeral)
  │   └── sends → CoffeeResponse Dict (Ephemeral)
  ├── Chat Channel
  │   ├── receives → ChatRequest Dict (Ephemeral)
  │   ├── sends → ChatResponse Dict (Ephemeral, echo)
  │   └── sends → ChatResponse Dict (Ephemeral, random, server-initiated)
  ├── Agent-Events Channel
  │   ├── receives → AgentEventsRequest Dict (Ephemeral)
  │   ├── sends → AgentEventsResponse Dict (Ephemeral)
  │   ├── maintains → Subscription State (In-Memory)
  │   └── sends → AgentEvent Dict (Ephemeral, server-initiated, if subscribed)
  └── All Channels
      ├── validates via → Hook Pipeline
      ├── processes via → Handler Module
      └── sends → ErrorResponse Dict (Ephemeral, on error)
```

**Cardinality**:
- One Connection can receive many Request dicts (sequential)
- One Connection can send many Response dicts (sequential or server-initiated)
- One Request produces exactly one Response (or one ErrorResponse)
- Chat channel: One Connection can receive many server-initiated random messages (every 3 seconds)
- Agent-events channel: One Connection has one subscription state (set of groups)
- Agent-events channel: One Connection can receive many server-initiated events (only for subscribed groups)

**Processing Pipeline**:
```
Dict → before_receive → after_receive → handler → before_send → Dict
                ↓                                      ↓
         on_validation_error                  on_handler_error
```

## Storage Strategy

### In-Memory Only
**Purpose**: Active connection tracking and message processing
**Data Structures**: Python objects (WebSocket connection handlers)
**Lifetime**: Connection duration only
**Cleanup**: Automatic on connection close

### No Persistent Storage
- No database required
- No Redis/ValKey required
- No message queuing required
- All data is ephemeral and transient

## Message Flow

### Request Processing Flow (Hook Pipeline)
1. Client sends JSON via `websocket.send_json({"input": "hi"})`
2. Server receives via `websocket.receive_json()` → dict
3. **before_receive hook**: Validates dict against AsyncAPI schema
4. **after_receive hook**: Optional processing (default: pass-through)
5. **handler**: Processes dict, returns response dict
6. **before_send hook**: Adds timestamp to response dict
7. Server sends via `websocket.send_json(response_dict)`
8. All dicts are discarded (garbage collected)

### Error Handling Flow
1. Client sends invalid JSON or dict
2. **before_receive hook**: Detects ValidationError
3. **on_validation_error hook**: Formats error dict
4. Server sends error dict to client
5. Connection remains open for subsequent requests
6. All dicts are discarded

## Message Validation

### Schema Discovery and Caching

The framework uses a two-level approach for schema validation:

**1. Component-Level Discovery** (at startup):
- Scans `src/nexus/{component}/ws/*.py` for handler files
- Derives spec path automatically: `{handler}.py` → `schemas/{component}/websocket-{handler}.yaml`
- Validates handler/spec pairing (fail-fast if mismatch)
- Loads and parses AsyncAPI schema files
- Merges multiple schemas per component (if multiple handlers exist)
- Caches merged schema in `_SPEC_CACHE[component_name]`

**2. Validation-Time Resolution**:
- Validator accepts either component name (uses cache) or explicit file path
- Component name lookup: `_SPEC_CACHE.get(component_name)`
- Explicit path: Load and cache on first use
- All subsequent validations use cached schema

**Example**:
```python
# src/nexus/example/ws/example.py
# Schema automatically mapped to: schemas/example/websocket-example.yaml

async def handle_coffee(message: dict) -> dict:
    # message already validated against cached schema
    return {"output": process(message["input"])}
```

### Dict Validation (via before_receive hook)
```python
# Actual implementation in hooks.py
async def before_receive(self, data: dict, message_type: str, channel: str) -> dict:
    # Validate against AsyncAPI JSON schema from cache
    validate_message(data, message_type, component_name=self.component)
    return data
```

**Schema Validation**:
- Uses cached AsyncAPI spec for component
- Validates required fields
- Checks field types (string, number, boolean, etc.)
- Validates constraints (minLength, maxLength, minimum, maximum)
- Raises `ValidationError` if invalid

### Response Generation (via before_send hook)
```python
# Actual implementation in hooks.py
async def before_send(self, response: dict, channel: str) -> dict:
    # Add timestamp if not present
    if "timestamp" not in response:
        response["timestamp"] = datetime.now(UTC).isoformat()
    return response
```

## Performance Characteristics

### Message Processing
- **Latency**: <10ms (in-memory processing only)
- **Throughput**: 1000+ messages/second per connection
- **Memory**: ~1KB per active connection
- **CPU**: Minimal (JSON parsing and string formatting only)

### Connection Management
- **Connection Overhead**: <1KB per connection
- **Max Connections**: 100+ (configuration dependent)
- **Connection Lifecycle**: Managed by WebSocket framework
- **Cleanup**: Automatic on disconnect

## Migration Strategy

**No Migrations Required**: This is a new feature with no persistent storage

## Convention-Based Configuration

The WebSocket framework uses file location conventions for automatic discovery and registration:

### Schema File Convention

**Location**: `schemas/{component}/websocket-{handler}.[yaml,yml]`

- All AsyncAPI specifications stored in central `schemas/` directory
- Organized by component subdirectories
- Filenames follow pattern: `websocket-{handler}.yaml` (matches handler filename)
- Supported formats: YAML (`.yaml`, `.yml`)

**Automatic Path Mapping**:
- Handler filename determines spec filename (no configuration needed)
- `example.py` → `websocket-example.yaml`
- `invocations.py` → `websocket-invocations.yaml`

**Examples**:
- ✅ `schemas/example/websocket-example.yaml` (for `example.py`)
- ✅ `schemas/example/websocket-channels.yml` (for `channels.py`)
- ❌ `schemas/example/spec.yaml` (doesn't match any handler)

### Handler File Convention

**Location**: `src/nexus/{component}/ws/*.py`

- Multiple `.py` files allowed per component
- Each file contains handler functions (`handle_*`, `on_connect_*`)
- Spec path automatically derived from handler filename
- Handlers use plain dicts, no model classes

**Multi-File Pattern Example**:

```
src/nexus/
├── example/
│   └── ws/
│       ├── __init__.py
│       └── example.py  # → schemas/example/websocket-example.yaml
└── agent_orchestrator/
    └── ws/
        ├── __init__.py
        ├── invocations.py  # → schemas/agent_orchestrator/websocket-invocations.yaml
        └── workflows.py    # → schemas/agent_orchestrator/websocket-workflows.yaml

schemas/
├── example/
│   └── websocket-example.yaml      # Single schema for example component
└── agent_orchestrator/
    ├── websocket-invocations.yaml  # First schema for agent_orchestrator
    └── websocket-workflows.yaml    # Second schema for agent_orchestrator
```

### Schema Merging Behavior

When a component has multiple handler files:

1. **Discovery**: All `.py` files in `ws/` directory are scanned
2. **Mapping**: Each handler is mapped to its spec via filename convention
3. **Validation**: Handler/spec pairing is verified (fail-fast if mismatch)
4. **Merging**: Schemas are merged into single specification per component
5. **Caching**: Merged schema is cached for runtime validation

**Example - agent_orchestrator component**:
- `invocations.py` → `websocket-invocations.yaml`
- `workflows.py` → `websocket-workflows.yaml`
- Both schemas merged into single `agent_orchestrator` specification
- If both define channel "status" → startup error (duplicate channel)

### Duplicate Channel Detection

The framework strictly enforces unique channel names per component:

```yaml
# schemas/agent_orchestrator/websocket-invocations.yaml
channels:
  invocations:
    address: /ws/agent_orchestrator/v1/invocations

# schemas/agent_orchestrator/websocket-workflows.yaml
channels:
  invocations:  # ❌ ERROR: Duplicate channel name
    address: /ws/agent_orchestrator/v1/invocations
```

**Error at startup**:
```
ValueError: Duplicate channel 'invocations' found in agent_orchestrator schemas
```

### Configuration Parameters

- **Max message size**: 1MB (configurable via FastAPI)
- **Connection timeout**: None (explicit close required)
- **Max connections**: 100+ (configurable)
- **Schema validation**: Strict mode (all fields validated)

**Backward Compatibility**: N/A (new feature)

## Data Constraints

### Business Rules
- Each request must receive exactly one response (success or error)
- Responses must be sent in order received per connection
- Connections can be closed by either party at any time
- No message persistence or replay capability

### Technical Constraints
- Message size limit: 1MB per message (FastAPI default)
- Input field length: 1-100 characters (AsyncAPI schema)
- JSON encoding: UTF-8 only
- Timestamp format: ISO 8601 UTC (added by hook)
- Dict-based messages only (no model classes)

## Error States

### Invalid Message Format
- **Trigger**: Client sends malformed JSON
- **Detection**: `websocket.receive_json()` raises `JSONDecodeError`
- **Response**: ErrorResponse dict with INVALID_REQUEST
- **Hook**: `on_validation_error`
- **Connection State**: Remains open

### Missing Required Field
- **Trigger**: Client sends dict without required field (e.g., 'input')
- **Detection**: `before_receive` hook validates against AsyncAPI schema
- **Response**: ErrorResponse dict with VALIDATION_ERROR
- **Hook**: `on_validation_error`
- **Connection State**: Remains open

### Handler Processing Error
- **Trigger**: Handler raises exception during processing
- **Detection**: Exception caught in endpoint pipeline
- **Response**: ErrorResponse dict with INTERNAL_ERROR
- **Hook**: `on_handler_error`
- **Connection State**: Remains open (unless critical error)

## Future Enhancements (Out of Scope)

**Hook Extensions**:
- Custom hook implementations per handler
- Async hook composition
- Hook middleware chains

**Advanced Features**:
- Message persistence for audit/debugging
- Additional endpoint types (multiple YAML specs)
- Binary message support alongside JSON
- Message compression (permessage-deflate)
- Rate limiting via hooks
- Authentication via pre-connection hooks
- Message routing based on content
- Pub/sub patterns
