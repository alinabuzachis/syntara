# Data Model: Adaptor Streaming

**Feature**: Adaptor Streaming (013-adaptor-streaming) | **Date**: 2025-11-13
**Phase**: 1 - Design & Contracts

## Overview

The Adaptor Streaming data model extends the existing Agent Orchestrator data model to support real-time LLM response streaming. The model introduces streaming event types, WebSocket connection management, and Valkey Stream integration for event caching and replay. All streaming data is ephemeral and designed for real-time delivery with optional persistence for late-joining clients.

**Key Design Principles:**

- **Event-Driven Streaming**: Incremental delta delivery via WebSocket events
- **Valkey Stream Caching**: 24-hour event persistence for replay capability
- **Multi-Client Support**: Independent event consumption for concurrent clients
- **Backward Compatibility**: Streaming is additive to existing REST API responses
- **Ephemeral by Default**: Streaming events are real-time with optional short-term persistence

---

## Core Entities

### StreamingEvent (Valkey Stream Entry)

Represents an individual streaming event published to Valkey Streams for WebSocket delivery. Events are stored in streams named `invocation:{id}:events` and consumed by WebSocket handlers.

**Fields:**

- `stream_key`: String (Primary Key) - **Auto-generated** (`invocation:{invocation_id}:events`)
- `event_id`: String - **Required** (Valkey stream entry ID, format: `{milliseconds_since_epoch}-{sequence_within_timestamp}`) - **Always present for resumption**
- `event_type`: Enum - **Required** (values: delta, error, cancelled, completion)
- `invocation_id`: UUID - **Required** (Foreign key to Invocation)
- `timestamp`: Timestamp - **Auto-generated** (Event creation time with microsecond precision)
- `data`: JSON - **Required** (Event-specific payload data)

**Event Types & Data Structures:**

**delta** (NEW for streaming):
```json
{
  "delta": "Hello"
}
```

**completion** (NEW for streaming):
```json
{}
```
Note: Empty object - the `event_type` itself indicates successful completion.

**cancelled** (existing, enhanced):
```json
{
  "reason": "timeout"
}
```

**Relationships:**

- `invocation_id` → Invocation (Many-to-One)
- Stream entries are ordered by Valkey `event_id` (timestamp-based)
- JSON `event_id` field enables precise client resumption

**Validation Rules:**

- `event_type` must be valid enum value
- `event_id` must match Valkey stream entry ID format
- `data` structure must match event_type schema
- `timestamp` must be >= invocation.started_at

**Storage Location:** Valkey Streams (ephemeral with configurable TTL)

---

## Supporting Entities

### WebSocketConnection

Represents an active WebSocket connection for streaming events. Managed in-memory by WebSocket handlers, not persisted to database.

**Fields:**

- `connection_id`: UUID (Primary Key) - **Auto-generated**
- `invocation_id`: UUID - **Required** (Foreign key to Invocation)
- `client_ip`: String - **Required** (Client IP address for logging)
- `user_agent`: String - **Optional** (Client user agent string)
- `connected_at`: Timestamp - **Auto-generated**
- `last_ping_at`: Timestamp - **Auto-updated** (Last ping received)
- `last_event_id`: String - **Auto-updated** (Last event_id sent to this client - for logging/debugging only)
- `is_active`: Boolean - **Auto-managed** (Connection health status)
- `reconnect_count`: Integer - **Auto-incremented** (Number of reconnections for this client)

**State Management:**

- **Connecting**: Initial handshake in progress
- **Active**: Successfully connected, consuming events
- **Reconnecting**: Temporary disconnect, attempting reconnection
- **Closed**: Connection terminated (client disconnect or error)

**Health Monitoring:**

- Ping/pong every 30 seconds
- Connection marked inactive after 60 seconds (2 missed pongs)
- Automatic cleanup of stale connections

**Storage Location:** In-memory (WebSocket handler state)

---

### Client Connection Scenarios

Coordination between GenericAgent (event publisher) and WebSocket handlers (event consumers) occurs entirely through Valkey Streams. No in-memory session state is needed for coordination.

**Active Streaming:**
- Client connects → WebSocket handler reads from Valkey stream
- Handler replays historical events (if any) from Valkey
- Handler blocks waiting for new events to arrive in Valkey
- GenericAgent publishes delta events to Valkey as LLM generates them
- Client receives real-time delta events through Valkey stream

**Completed Invocation:**
- Client connects → Gets all historical events from Valkey Streams only
- No live streaming (LLM already finished)
- Client receives replay of all stored events (deltas, errors, completion status)
- WebSocket connection closes after replay completes

**Failed Invocation:**
- Similar to completed, but error events are included in replay
- Client receives error event with classification (retryable/non-retryable)

### Stream Completion Detection

**How Completion is Detected**:

The system supports two streaming backends:

1. **LangChain LLMs** (e.g., `ChatOpenAI`):
   - Uses `llm.astream(messages)` to yield content chunks
   - When generator exhausts (no more chunks), streaming is complete

2. **LangGraph** (e.g., compiled graphs):
   - Uses `graph.astream_events(input, version="v2")` to yield events
   - Filters for `event["event"] == "on_chat_model_stream"` events
   - Extracts content from `event["data"]["chunk"].content`
   - When no more `on_chat_model_stream` events, streaming is complete

**Common Behavior** (regardless of backend):
- System sends `completion` event when streaming finishes
- WebSocket API and Valkey events remain identical

**Completion Event Timing**:
```
Content Events: [chunk1, chunk2, chunk3, ...] → Completion Event
```

### Client Reconnection Strategies

**Simple Reconnection (Default):**
- Client reconnects with default `replay_count=10`
- Gets last 10 events for context, then live events
- May see some duplicate events but gets back in sync quickly

**Precise Reconnection:**
- Client tracks `event_id` from received WebSocket messages
- Reconnects with `last_event_id` parameter
- Resumes exactly where it left off (no duplicates)

**Live-Only Reconnection:**
- Client reconnects with `replay_count=0`
- Gets only new events generated after reconnection
- Useful when client already has full context

**Complete History Reconnection:**
- Client reconnects with `replay_count=all` or `last_event_id=0`
- Gets ALL historical events from the beginning of the stream
- Useful for new clients that want full context

---

## Integration with Existing Data Model

### Enhanced Invocation Entity

The existing `Invocation` entity is **not extended** with additional streaming fields for the MVP.

**Rationale**: The core streaming functionality works without storing session-level metadata in the database. Per-client consumption state is managed by Valkey stream read positions and WebSocket connection metadata.

**Future Enhancement**: Analytics fields (duration, connection count, deltas streamed) can be added later if monitoring requirements emerge.

---

## Entity Relationships

### Primary Relationships

```
Invocation (1) -----> (N) StreamingEvent (Valkey)
Invocation (1) -----> (N) WebSocketConnection (in-memory)
```

### Valkey Stream Structure

```
invocation:{id}:events (Redis Stream)
├── event_id_1: {type: "delta", data: {delta: "Hello"}}
├── event_id_2: {type: "delta", data: {delta: " world"}}
├── event_id_3: {type: "delta", data: {delta: "!"}}
└── event_id_N: {type: "error", data: {error_type: "llm_error", message: "Rate limit exceeded"}}
```

### WebSocket Connection Management

```
WebSocket Handler
├── Connection Pool: Map<invocation_id, Set<connection_id>>
├── Event Consumers: Map<connection_id, StreamConsumer>
└── Health Monitor: Connection health tracking
```

---

## State Machines

### Streaming Session State Machine

```
initializing → streaming → completing → completed
    ↓           ↓           ↓
    → cancelled  → cancelled → cancelled
    ↓           ↓
    → error     → error
```

**State Descriptions:**
- **initializing**: Setting up LLM streaming connection
- **streaming**: Actively streaming deltas to clients
- **completing**: LLM finished, sending final events
- **completed**: All events sent, streaming session closed
- **cancelled**: Streaming stopped due to client disconnect or cancellation
- **error**: Streaming failed due to LLM error or connection issues

### WebSocket Connection State Machine

```
connecting → active → reconnecting → closed
    ↓         ↓         ↓
    → closed   → closed  → closed
```

---

## Storage Architecture

### Valkey Streams (Primary Storage)

**Stream Configuration:**
- Key pattern: `invocation:{invocation_id}:events`
- Max length: Unlimited (rely on TTL for cleanup)
- TTL: configurable time after invocation completion
- Consumer groups: Not used (independent consumption)

**Stream Entry Structure:**
```
valkey_event_id: "1691431234567-1"  # Valkey auto-generated
event_data: {
  "event_type": "delta",
  "invocation_id": "uuid",
  "timestamp": "2025-11-13T10:00:00.000Z",
  "event_id": "1691431234567-1",
  "data": {"delta": "Hello"}
}

valkey_event_id: "1691431234567-2"  # Valkey auto-generated
event_data: {
  "event_type": "completion",
  "invocation_id": "uuid",
  "timestamp": "2025-11-13T10:00:05.000Z",
  "event_id": "1691431234567-2",
  "data": {}
}
```

### In-Memory State (Runtime Only)

**WebSocket Handler State:**
- Active connections per invocation
- Consumer positions in Valkey streams
- Health monitoring timers
- Cleanup tracking

**GenericAgent Streaming State:**
- Active streaming sessions
- Cancellation signals
- LLM connection state

### Database Schema (No Changes)

**No database schema changes required** for the MVP streaming implementation.

**Per-Client State**: Managed in Valkey Streams (read positions) and WebSocket handler memory.

---

## Database Schema Considerations

### Valkey Indexes/Keys

**Stream Keys:**
- `invocation:{id}:events` - Main event stream per invocation

**Metadata Keys (if needed):**
- `invocation:{id}:metadata` - Streaming session metadata
- `streaming:metrics:{date}` - Daily aggregated metrics

### Performance Optimizations

**Valkey Optimizations:**
- Pipelined XADD operations for batch event publishing
- XTRIM for automatic cleanup (though TTL handles this)
- Connection pooling for WebSocket handlers

**Memory Management:**
- Stream TTL prevents unbounded growth
- Automatic cleanup of completed invocation streams
- Memory limits on in-memory connection state

---

## Data Model Validation Checklist

- [x] Streaming event types defined with schemas
- [x] WebSocket connection management specified
- [x] Valkey stream integration designed
- [x] Multi-client synchronization supported
- [x] Event replay capability included
- [x] Performance metrics tracking defined
- [x] Error handling and cancellation covered
- [x] Backward compatibility maintained
- [x] Storage strategy aligns with ephemeral streaming requirements
- [x] Integration with existing Invocation entity documented
