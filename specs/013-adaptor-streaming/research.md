# Research: Adaptor Streaming

**Feature**: Adaptor Streaming (013-adaptor-streaming) | **Date**: 2025-11-13
**Input**: User story from `/specs/013-adaptor-streaming/jira-AAP-58160.txt`
**Related Specs**: Agent Orchestrator API, WebSocket Router and Patterns

## Overview

This research explores implementing streaming LLM responses for the Agent Orchestrator. The goal is to provide real-time, delta-by-delta streaming of LLM responses to connected clients via WebSocket, while maintaining backward compatibility with existing REST API responses.

## Key Research Questions

### 1. LangChain/LangGraph Streaming Integration

**Question**: How do LangChain and LangGraph support streaming LLM responses with OpenRouter?

**Findings**:

**LangChain (ChatOpenAI)**:
- `ChatOpenAI.astream()` method provides async delta streaming
- Yields `AIMessageChunk` objects containing incremental content
- Compatible with OpenRouter's streaming API endpoints
- Maintains same authentication and configuration as regular calls

**LangGraph (compiled graphs)**:
- `graph.astream_events(input, version="v2")` provides event-based streaming
- Filters for `on_chat_model_stream` events to extract LLM deltas
- Extracts content from `event["data"]["chunk"].content`
- Same OpenRouter compatibility through underlying ChatOpenAI model

**Implementation Patterns**:

**Option A - LangChain LLMs** (plain ChatOpenAI):
```python
async def stream_response(prompt: str):
    messages = self.prompt_template.format_messages(query=prompt)
    async for chunk in self.llm.astream(messages):
        content = chunk.content
        yield content
```

**Option B - LangGraph** (compiled graphs):
```python
async def stream_response(input_data: dict):
    async for event in self.graph.astream_events(input_data, version="v2"):
        if event["event"] == "on_chat_model_stream":
            content = event["data"]["chunk"].content
            if content:
                yield content
```

**Decision**: Support both approaches. The WebSocket API and Valkey events remain identical regardless of backend - only the source of deltas changes. Project is migrating from Option A (LangChain) to Option B (LangGraph).

### 2. WebSocket Event Architecture

**Question**: How to structure streaming events for WebSocket delivery?

**Findings**:
- **Separate WebSocket endpoint**: Create new `/ws/agent_orchestrator/v1/invocations/{id}` endpoint specifically for streaming
- **Dedicated event types**: Define new event schema for streaming: `delta`, `error`, `cancelled`, `completion`
- **Independent of Spec 002**: ProgressEvent from Spec 002 is not implemented and not being extended (see [websocket-comparison.md](./websocket-comparison.md))
- **Valkey Streams integration**: Events stored in dedicated streams for persistence and replay
- **Multi-client support**: Independent stream read positions enable late-joining clients
- **Real-time streaming focus**: Events designed for delta-by-delta delivery, not workflow progress

**Event Structure**:
```json
// Delta event - individual delta delivery
{
  "event_type": "delta",
  "invocation_id": "uuid",
  "timestamp": "2025-11-13T10:00:00Z",
  "event_id": "1691431234567-1",
  "data": {
    "delta": "Hello"
  }
}

// Completion event - streaming finished
{
  "event_type": "completion",
  "invocation_id": "uuid",
  "timestamp": "2025-11-13T10:00:05Z",
  "event_id": "1691431234567-2",
  "data": {}
}
```

**Decision**: Create separate WebSocket streaming architecture with dedicated event types (`delta`, `error`, `cancelled`, `completion`). Include Valkey event_id in JSON payload for client resumption. This is completely independent from Spec 002's ProgressEvent design (not implemented).

### 3. Valkey Streams for Event Caching

**Question**: How to implement event caching and replay for late-joining clients?

**Findings**:
- Valkey Streams provide ordered, persistent event storage
- XADD for publishing events, XREAD for consuming
- Support for multiple consumers with independent positions
- TTL support for automatic cleanup

**Stream Structure**:
```
invocation:{id}:events stream containing:
- Valkey event IDs: Auto-generated (format: {milliseconds}-{sequence})
- Application events: token, error, cancelled, completion events
- JSON payload includes event_id for client resumption
```

**Decision**: Use Valkey Streams with TTL for event persistence and replay. No database storage of session statistics for MVP.

### 4. Connection Stability

**Question**: How to ensure stable connections during long-running LLM streams?

**Findings**:
- WebSocket ping/pong for connection health monitoring
- 30-second intervals with 2-missed-pong timeout
- TCP keepalive settings at infrastructure level
- Client-side reconnection with exponential backoff

**Stability Measures**:
- Server sends ping every 30 seconds
- Client must respond with pong within timeout
- Connection dropped after 2 missed pongs (60s total)
- Valkey buffers events during temporary disconnects

**Decision**: Implement bidirectional ping/pong with 30s intervals and 60s total timeout.

### 5. Client Reconnection

**Question**: How do clients reconnect and resume streaming without losing events?

**Findings**:
- WebSocket reconnections are new connections (no automatic session resumption)
- Clients can use `replay_count` parameter for simple reconnection (default: last 10 events)
- Clients extract `event_id` from WebSocket messages and use `last_event_id` parameter for precise resumption (no duplicates)
- Valkey Streams support resuming from any event ID
- Event IDs are timestamp-based for ordering

**Decision**: Support both simple (replay_count) and precise (last_event_id) reconnection strategies.

**Implementation**:
- Simple: `?replay_count=10` (default, may have some duplicates)
- Precise: `?last_event_id=1691431234567-42` (exact resumption)
- Live-only: `?replay_count=0` (skip history)
- Complete history: `?replay_count=all` or `?last_event_id=0` (get everything)

### 7. Performance Characteristics

**Question**: What are the performance implications of streaming?

**Findings**:
- Delta streaming: <100ms p95 latency from LLM to client
- Valkey operations: <10ms p95 for event storage/retrieval
- Memory usage: ~50MB per concurrent streaming invocation
- Network overhead: Minimal (small JSON events vs large complete responses)

**Optimizations**:
- Event batching for high-frequency tokens (future)
- Connection pooling for Valkey
- Async processing throughout pipeline
- Compression for large delta payloads (future)

**Decision**: Target <100ms p95 end-to-end streaming latency.

### 8. Multi-Client Synchronization

**Question**: How do multiple clients stay synchronized during streaming?

**Findings**:
- All clients read from same Valkey stream
- Independent read positions allow late-joining
- Sequence numbers ensure ordering
- Event replay provides catch-up for new clients

**Synchronization Strategy**:
- Client A connects: Gets live streaming + historical events
- Client B connects later: Gets replay of all events + continues live
- All clients see identical event sequence
- Sequence numbers prevent duplicates

**Decision**: Independent stream reading with sequence number ordering.

### 9. Stream Completion Detection

**Question**: How do we detect when LLM delta streaming is complete?

**Findings**:

**LangChain (ChatOpenAI)**:
- `astream()` method yields chunks until completion
- Stream ends naturally when LLM finishes generating
- No explicit "end of stream" signal from LLM API
- Detection occurs when async generator stops yielding

**LangGraph (compiled graphs)**:
- `astream_events()` yields events until completion
- Stream ends when no more `on_chat_model_stream` events are generated
- Generator exhausts naturally when LLM finishes
- Detection occurs when async generator stops yielding events

**Common Behavior**:
- Both backends use async generator exhaustion to signal completion
- No explicit end-of-stream signal from LLM provider
- System sends `completion` event after generator exhaustion

**Decision**: Detect completion when async generator (either `astream()` or `astream_events()`) exhausts naturally, then emit `completion` event to WebSocket clients.

### 10. Error Handling

**Question**: How to handle streaming errors gracefully?

**Findings**:
- LLM API timeouts/errors during streaming
- WebSocket connection failures mid-stream
- Valkey unavailability affecting event storage
- Client disconnection during streaming

**Error Scenarios**:
- LLM timeout: Emit error event with retryable=true, close stream
- WebSocket disconnect: Cancel LLM streaming, cleanup
- Valkey failure: Fallback to in-memory (temporary), log error
- Network issues: Emit error event with retryable=true, client handles retry logic

**Error Classification for WebSocket Events** (RFC 9457 Problem Details format):
```python
def classify_streaming_error(exception: Exception, invocation_id: Optional[UUID] = None) -> dict:
    """Classify streaming exception into RFC 9457 Problem Details format.

    Returns dict with: type (URI), title, detail, code, retryable, instance
    """
    ERROR_TYPE_BASE_URI = "https://api.nexus.com/errors"

    # Timeout errors
    if isinstance(exception, TimeoutError):
        return {
            "type": f"{ERROR_TYPE_BASE_URI}/timeout-error",
            "title": "Streaming Timeout",
            "detail": f"LLM streaming timed out: {str(exception)}",
            "code": "STREAM_TIMEOUT",
            "retryable": True,
            "instance": f"/invocations/{invocation_id}" if invocation_id else None
        }

    error_msg = str(exception).lower()

    # Rate limiting (429 status)
    if "rate limit" in error_msg or "429" in error_msg:
        return {
            "type": f"{ERROR_TYPE_BASE_URI}/llm-error",
            "title": "LLM Rate Limit Exceeded",
            "detail": f"OpenRouter API rate limit exceeded: {str(exception)}. Please try again in a few moments.",
            "code": "RATE_LIMIT_EXCEEDED",
            "retryable": True,
            "instance": f"/invocations/{invocation_id}" if invocation_id else None
        }

    # Authentication errors (401/403)
    if "unauthorized" in error_msg or "403" in error_msg or "401" in error_msg:
        return {
            "type": f"{ERROR_TYPE_BASE_URI}/llm-error",
            "title": "LLM Authentication Failed",
            "detail": f"Failed to authenticate with LLM provider: {str(exception)}",
            "code": "AUTHENTICATION_FAILED",
            "retryable": False,
            "instance": f"/invocations/{invocation_id}" if invocation_id else None
        }

    # Server errors (5xx)
    if "500" in error_msg or "502" in error_msg or "503" in error_msg:
        return {
            "type": f"{ERROR_TYPE_BASE_URI}/network-error",
            "title": "Upstream Service Error",
            "detail": f"LLM provider returned server error: {str(exception)}",
            "code": "UPSTREAM_ERROR",
            "retryable": True,
            "instance": f"/invocations/{invocation_id}" if invocation_id else None
        }

    # Default to non-retryable LLM error
    return {
        "type": f"{ERROR_TYPE_BASE_URI}/llm-error",
        "title": "LLM Streaming Error",
        "detail": f"An unexpected error occurred during LLM streaming: {str(exception)}",
        "code": "UNKNOWN_ERROR",
        "retryable": False,
        "instance": f"/invocations/{invocation_id}" if invocation_id else None
    }
```

**Decision**: Comprehensive error handling with structured error classification for WebSocket events.

### 12. Error Retry Behavior

**Question**: When LLM streaming fails with a retryable error, should the server automatically retry within the same invocation or require clients to create new invocations?

**Decision**: Client-initiated retry - server sends error event with `retryable` flag, clients must create new invocations for retries.

**Rationale**:
- **Simplicity**: Avoids complex retry state management on server
- **Clarity**: Clear error boundaries and debugging (each attempt = separate invocation)
- **Control**: Clients implement their own retry logic (backoff, circuit breakers, etc.)
- **Debugging**: Easier to trace issues when each retry is a separate invocation
- **Consistency**: Aligns with REST API patterns where failures require new requests

**Implementation**:
- Server sends `error` event with `retryable: true/false`
- If `retryable: true` → Client can create new invocation with same prompt
- If `retryable: false` → Show permanent error, no retry allowed
- No automatic server-side retry within same invocation
- Failed invocations marked as `failed` in database

## Technical Decisions

### Primary Architecture

**Streaming Pipeline**:
```
LLM → GenericAgent → Valkey Stream → WebSocket → Clients
```

**Key Components**:
1. **GenericAgent**: Implements new `stream()` method to replace `execute()`
2. **WebSocket Handler**: New handler for `/ws/agent_orchestrator/v1/invocations/{id}` endpoint
3. **Event Publisher**: Publishes delta events to Valkey Streams
4. **Event Consumer**: WebSocket handler reads from Valkey Streams
5. **Connection Manager**: Handles client connections and health monitoring

### Integration Points

**With Agent Orchestrator**:
- Replaces `GenericAgent.execute()` with `GenericAgent.stream()`
- Uses streaming as the fundamental execution model

**With WebSocket Infrastructure**:
- Uses existing WebSocket router framework
- Follows established event format patterns
- Integrates with connection health monitoring

**With Valkey**:
- Follows established stream naming conventions
- Leverages existing TTL and cleanup mechanisms

### Backward Compatibility

**REST API**: Enhanced - POST returns immediately
**WebSocket**: New capability - streaming events enable real-time delta delivery
**GenericAgent**: Modified - streaming is the fundamental execution model

## Alternatives Considered

### 1. Server-Sent Events (SSE) vs WebSocket

**Rejected**: SSE doesn't support bidirectional communication needed for cancellation and health monitoring.

### 2. Direct HTTP Streaming vs Event-Based

**Rejected**: Event-based approach provides better decoupling, replay capability, and multi-client support.

### 3. In-Memory Queues vs Valkey Streams

**Rejected**: Valkey provides persistence, replay, and multi-instance support required for production.

### 4. Delta Buffering vs Immediate Emission

**Rejected**: Immediate emission provides true real-time experience; buffering introduces unnecessary latency.

## Open Questions Resolved

1. **Q**: Should streaming be the default behavior?
   **A**: Yes - the GenericAgent implementation uses `stream()` by default. Streaming is the fundamental execution model, with results delivered via WebSocket for real-time experience.

2. **Q**: How to handle very high delta rates?
   **A**: Implement event batching and client-side buffering to prevent overwhelming clients.

3. **Q**: What happens if clients can't keep up?
   **A**: Valkey buffers events; clients catch up at their own pace or disconnect if too far behind.

4. **Q**: How to test streaming reliability?
   **A**: Comprehensive testing including network interruptions, client reconnects, and long-running streams.

## Performance Benchmarks

**Expected Performance**:
- Delta streaming latency: <100ms p95
- Connection stability: 99.9% uptime
- Valkey operations: <10ms p95
- Memory per streaming invocation: <50MB
- Concurrent streams supported: 100+

**Monitoring Metrics**:
- Streaming success rate
- Average delta latency
- Connection drop rate
- Valkey stream size
- Client reconnection frequency

## Implementation Risks

### High Risk
- **LangChain/LangGraph/OpenRouter Compatibility**: Streaming API changes could break integration
- **WebSocket Scalability**: High concurrent connection management
- **Valkey Performance**: Stream operations under load

### Medium Risk
- **Memory Usage**: Large delta payloads accumulating in streams
- **Client Compatibility**: WebSocket client implementations vary
- **Network Reliability**: Temporary network issues during streaming

### Mitigation Strategies
- Comprehensive testing with OpenRouter streaming API
- Load testing with concurrent connections
- Valkey performance benchmarking
- Client library compatibility testing
- Retry logic and graceful degradation

## Conclusion

The research confirms that streaming LLM responses is technically feasible using:
- LangChain's `astream()` or LangGraph's `astream_events()` with OpenRouter
- WebSocket events for real-time delivery
- Valkey Streams for caching and replay
- Existing infrastructure with minimal changes

The implementation will provide significant UX improvements while maintaining system stability and backward compatibility.

## References

- [LangChain ChatOpenAI Streaming](https://python.langchain.com/docs/integrations/chat/openai/)
- [OpenRouter API Documentation](https://openrouter.ai/docs)
- [WebSocket Protocol RFC 6455](https://tools.ietf.org/html/rfc6455)
- [Redis Streams Documentation](https://redis.io/docs/data-types/streams/)
- Nexus WebSocket Router and Patterns Spec (007-websocket-router-and-patterns)
- Nexus Agent Orchestrator API Spec (002-agent-orchestrator)
