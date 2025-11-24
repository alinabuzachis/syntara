# Adaptor Streaming - Quick Start Guide

**Feature**: Adaptor Streaming
**Version**: 1.0.0
**Last Updated**: 2025-11-13

## Overview

This guide demonstrates how to use the streaming LLM response feature. The adaptor streaming provides real-time, delta-by-delta delivery of LLM responses via WebSocket, while maintaining backward compatibility with existing REST API responses.

## Prerequisites

- API endpoint: `http://localhost:8000/api/v1` (development) or production URL
- Authentication: Bearer token or API key
- WebSocket client for streaming events
- REST client for submitting requests

## Base URL

```
http://localhost:8000/api/v1
```

All examples use this development URL. Replace with your environment's URL.

---

## Example 1: Streaming LLM Response with WebSocket

**Use Case**: Submit a query and receive real-time streaming deltas via WebSocket

### Step 1: Submit Invocation Request (REST)

```bash
curl -X POST http://localhost:8000/api/v1/invocations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "prompt": "Explain quantum computing in simple terms",
    "session_id": "session-001"
  }'
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "prompt": "Explain quantum computing in simple terms",
  "created_by": "user-123",
  "session_id": "session-001",
  "status": "created",
  "created_at": "2025-11-13T10:00:00Z",
  "updated_at": "2025-11-13T10:00:00Z"
}
```

### Step 2: Connect to WebSocket for Streaming

Connect to the streaming WebSocket endpoint at `/ws/agent_orchestrator/v1/invocations/{invocation_id}`:

```javascript
// JavaScript WebSocket client
const invocation_id = "550e8400-e29b-41d4-a716-446655440000";
const ws = new WebSocket(`ws://localhost:8000/ws/agent_orchestrator/v1/invocations/${invocation_id}`);

// Handle streaming events
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  switch(data.event_type) {
    case 'delta':
      // Display delta in real-time
      console.log('Delta:', data.data.delta);
      appendToResponse(data.data.delta);
      break;

    case 'completion':
      // Streaming completed successfully
      console.log('Streaming completed');
      finalizeResponse();
      break;

    case 'error':
      // Handle errors
      console.error('Streaming error:', data.data.message);
      handleStreamingError(data.data);
      break;

    case 'cancelled':
      // Streaming was cancelled
      console.log('Streaming cancelled:', data.data.reason);
      handleCancellation(data.data.reason);
      break;
  }
};

ws.onopen = () => {
  console.log('WebSocket connected, waiting for streaming to begin...');
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};
```

### Step 3: Observe Streaming Output

**Expected WebSocket Events:**

```json
// Delta streaming begins
{
  "event_type": "delta",
  "invocation_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-11-13T10:00:02.456Z",
  "event_id": "1691431234567-1",
  "data": {
    "delta": "Quantum"
  }
}

{
  "event_type": "delta",
  "invocation_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-11-13T10:00:02.478Z",
  "event_id": "1691431234567-2",
  "data": {
    "delta": " computing"
  }
}

// More deltas...
{
  "event_type": "delta",
  "invocation_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-11-13T10:00:02.500Z",
  "event_id": "1691431234567-3",
  "data": {
    "delta": " uses"
  }
}

// Streaming completes (detected when astream() generator exhausts)
{
  "event_type": "completion",
  "invocation_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-11-13T10:00:05.123Z",
  "event_id": "1691431234567-4",
  "data": {}
}
```

### Step 4: Verify REST API Still Works

```bash
# Check final status via REST API
curl -X GET http://localhost:8000/api/v1/invocations/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "prompt": "Explain quantum computing in simple terms",
  "status": "completed",
  "result": {
    "type": "answer",
    "content": "Quantum computing uses quantum mechanics...",
    "metadata": {"model": "anthropic/claude-3.5-sonnet"}
  },
  "created_at": "2025-11-13T10:00:00Z",
  "completed_at": "2025-11-13T10:00:08Z"
}
```

**Note**: The REST API response remains unchanged. Streaming state is managed entirely through WebSocket events and Valkey streams.

---

## Example 2: Multi-Client Streaming

**Use Case**: Multiple clients connect to the same invocation and receive synchronized streaming

### Client A (First to connect):

```javascript
// Client A connects first
const wsA = new WebSocket(`ws://localhost:8000/ws/agent_orchestrator/v1/invocations/${invocation_id}`);
// Receives both historical events (if any) + live streaming
```

### Client B (Connects later):

```javascript
// Client B connects during streaming
const wsB = new WebSocket(`ws://localhost:8000/ws/agent_orchestrator/v1/invocations/${invocation_id}`);
// Receives historical events (replay) + continues with live streaming
```

**Both clients receive identical event sequences:**
- Client A: Event 1, 2, 3, 4, 5...
- Client B: Event 1, 2, 3, 4, 5... (replay) + 6, 7, 8... (live)

---

## Example 3: Error Handling and Cancellation

**Use Case**: Handle streaming errors and cancellations gracefully

### Error Scenario:

When the LLM API returns a rate limit error (HTTP 429), the system extracts structured error information:

```json
{
  "event_type": "error",
  "invocation_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-11-13T10:00:05.123Z",
  "event_id": "1691431234567-90",
  "data": {
    "type": "https://api.nexus.com/errors/llm-error",  // RFC 9457 error type URI
    "title": "LLM Rate Limit Exceeded",                 // Short summary
    "detail": "OpenRouter API rate limit exceeded. Please try again in a few moments.",
    "code": "RATE_LIMIT_EXCEEDED",                      // Machine-readable error code
    "retryable": true                                   // Rate limits are retryable with backoff
  }
}
```

**Error Classification Logic:**
- **Rate limits (429)** → `retryable: true` (transient error)
- **Authentication (401/403)** → `retryable: false` (config issue)
- **Server errors (5xx)** → `retryable: true` (upstream issues)
- **Timeouts** → `retryable: true` (network issues)

### Cancellation Scenario:

**When LLM Times Out (Actual Cancellation):**
```javascript
// Server detects timeout during streaming
// LLM request is cancelled, cancelled event sent to all clients
{
  "event_type": "cancelled",
  "data": {
    "reason": "timeout"
  }
}
```

**When Client Disconnects (No Cancellation):**
```javascript
// Client disconnects WebSocket
ws.close();

// Server detects disconnection:
// - Stops sending events to this client only
// - LLM continues running for other clients
// - No cancelled event is sent
// - Other clients continue receiving deltas
```

**Client Reconnection Strategies:**

**Simple Reconnection (Default):**
```javascript
// Client reconnects with default settings
const ws = new WebSocket(`ws://localhost:8000/ws/agent_orchestrator/v1/invocations/${invocation_id}`);
// Gets last 10 events automatically, then live events
```

**Precise Reconnection (No Duplicates):**
```javascript
// Client tracks last event ID from previous connection
let last_event_id = "1691431234567-42"; // From previous session

// Reconnect with exact resume point
const ws = new WebSocket(
  `ws://localhost:8000/ws/agent_orchestrator/v1/invocations/${invocation_id}?last_event_id=${last_event_id}`
);
// Resumes exactly after the last received event
```

**Live-Only Reconnection (Skip History):**
```javascript
// Client already has full context, wants only new events
const ws = new WebSocket(
  `ws://localhost:8000/ws/agent_orchestrator/v1/invocations/${invocation_id}?replay_count=0`
);
// Gets only events generated after reconnection
```

**Connecting to Completed Invocation:**
```javascript
// Option 1: Get all history with replay_count=all
const ws = new WebSocket(
  `ws://localhost:8000/ws/agent_orchestrator/v1/invocations/${invocation_id}?replay_count=all`
);

// Option 2: Start from beginning of stream
const ws2 = new WebSocket(
  `ws://localhost:8000/ws/agent_orchestrator/v1/invocations/${invocation_id}?last_event_id=0`
);

// Both receive all historical events from the start, then connection closes
```

---

## Example 4: Historical Event Replay

**Use Case**: Late-joining clients can catch up on missed events

```javascript
// Request more historical events on connection
const ws = new WebSocket(
  `ws://localhost:8000/ws/agent_orchestrator/v1/invocations/${invocation_id}?replay_count=50`
);

// Client receives last 50 events immediately, then live events
```

---

## Configuration Options

### WebSocket Connection Parameters

- **replay_count**: Number of historical events to replay (default: 10, max: 1000). Use 0 for live-only, "all" for complete history.
- **last_event_id**: Resume from specific Valkey event ID (for precise reconnection, takes precedence over replay_count). Use "0" to start from beginning of stream.
- **Connection timeout**: 60 seconds (2 missed pings)
- **Ping interval**: 30 seconds

### Streaming Parameters

- **Delta batching**: Disabled (immediate delivery for real-time experience)
- **Event TTL**: Configurable in setting. Default to 24hr
- **Max concurrent connections**: Unlimited per invocation
- **Memory limits**: Automatic cleanup of completed streams

---

## Troubleshooting

### Common Issues

**WebSocket connection fails:**
```javascript
ws.onerror = (error) => {
  console.error('Connection failed:', error);
  // Check invocation ID is valid
  // Verify authentication
  // Check server is running
};
```

**Missing events:**
- Check Valkey connectivity
- Verify event TTL hasn't expired
- Check replay_count parameter

**Streaming stalls:**
- Check LLM API status
- Verify OpenRouter configuration
- Check network connectivity

### Debug Information

**Check Valkey streams:**
```bash
# Connect to Valkey
valkey-cli

# Check stream exists
KEYS invocation:*:events

# View stream contents
XRANGE invocation:550e8400-e29b-41d4-a716-446655440000:events - +
```

**Check invocation status:**
```bash
curl -X GET http://localhost:8000/api/v1/invocations/{id} \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Performance Expectations

- **Delta latency**: <100ms from LLM to client
- **Connection stability**: 99.9% uptime
- **Concurrent streams**: 100+ simultaneous invocations
- **Memory usage**: <50MB per active streaming session
- **Event persistence**: 24 hours for debugging

## Next Steps

1. **Implement WebSocket Handler**: Create `/ws/agent_orchestrator/v1/invocations/{id}` endpoint
2. **Modify GenericAgent**: Add streaming support to `execute()` method
3. **Add Event Publishing**: Integrate with Valkey Streams
4. **Test Multi-Client**: Verify synchronization works correctly
5. **Monitor Performance**: Set up metrics and alerting

For detailed implementation steps, see the `tasks.md` file generated by the `/tasks` command.
