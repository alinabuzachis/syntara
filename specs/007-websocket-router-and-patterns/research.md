# Research: Agents WebSocket

**Feature**: Agents WebSocket Streaming
**Date**: 2025-10-20
**Last Updated**: 2025-10-20 (post-clarification review)
**Status**: Complete - Incorporates clarification decisions

## Research Questions

### 1. WebSocket Implementation with FastAPI

**Decision**: Use FastAPI's native WebSocket support with `fastapi.WebSocket`

**Rationale**:
- Built-in support in FastAPI, no additional dependencies needed
- Async/await native, aligns with existing FastAPI async architecture
- Automatic connection management and lifecycle handling
- Well-documented patterns for WebSocket endpoints
- Integrates seamlessly with existing dependency injection system

**Alternatives Considered**:
- socketio-python: Adds unnecessary complexity, fallback mechanisms not needed
- websockets library directly: Lower level, would require reimplementing FastAPI integration
- SSE (Server-Sent Events): Decision record shows WebSockets chosen over SSE

**Best Practices**:
- Use dependency injection for DB session and Redis client
- Implement graceful shutdown on connection close
- Use structured exception handling for connection errors
- Validate invocation_id before accepting connection

### 2. Event Storage and Delivery

**Decision**: Use Redis Streams for event storage and pub/sub delivery

**Rationale**:
- Redis already in project dependencies
- Redis Streams provide ordered, persistent event log
- Built-in consumer groups for multiple clients
- Automatic TTL for event cleanup
- Sub-millisecond latency for event delivery
- XREAD with blocking for efficient polling

**Alternatives Considered**:
- PostgreSQL LISTEN/NOTIFY: Limited message size, no persistence, no ordering guarantees
- In-memory dict: No persistence, complex multi-client coordination, memory leaks
- RabbitMQ/Kafka: Over-engineered for this use case, adds infrastructure complexity

**Implementation Pattern**:
```python
# Publisher (invocation service):
await redis.xadd(f"invocation:{id}:events", {"type": "started", "data": "..."})

# Subscriber (WebSocket handler):
events = await redis.xread({f"invocation:{id}:events": last_id}, block=1000)
```

### 3. Connection Health Monitoring

**Decision**: Implement bidirectional ping/pong with 30-second intervals

**Rationale**:
- WebSocket protocol includes built-in ping/pong frames
- FastAPI WebSocket supports `send_text`, `receive_text`, `send_json`, `receive_json`
- 30-second interval balances responsiveness with overhead
- Detect stale connections before TCP timeout (usually 60s+)

**Best Practices**:
- Server sends ping every 30 seconds
- Client must respond with pong
- Close connection after 2 missed pongs (60s total)
- Use asyncio.wait_for() with timeout for pong responses

### 4. Multi-Client Event Delivery

**Decision**: Each client maintains independent read position in Redis Stream

**Rationale**:
- Redis Streams support multiple consumers reading from same stream
- Each consumer can track its own position via last_id
- No coordination overhead between clients
- Clients can reconnect and resume from last received event

**Implementation**:
- Each WebSocket connection is independent consumer
- Track last_event_id per connection
- Use XREAD with last_id to fetch only new events
- No consumer groups needed (all clients get all events)

### 5. Invocation Validation

**Decision**: Query PostgreSQL on connection to verify invocation exists

**Rationale**:
- Prevents clients from subscribing to non-existent invocations
- Fail fast with clear error message
- Single query on connection (not per-event)
- Aligns with existing SQLAlchemy patterns

**Query Pattern**:
```python
invocation = await db.get(Invocation, invocation_id)
if not invocation:
    await websocket.close(code=1008, reason="Invocation not found")
```

### 6. Testing Strategy

**Decision**: Three-tier testing approach

**Contract Tests** (Phase 1):
- OpenAPI schema for WebSocket endpoint
- JSON schema for event message formats
- Use httpx WebSocket test client

**Integration Tests** (Phase 1):
- Full WebSocket connection lifecycle
- Event delivery end-to-end
- Multi-client scenarios
- Reconnection behavior
- Error handling (invalid ID, connection drop)

**Performance Tests** (Post-MVP):
- 100+ concurrent connections
- Event delivery latency measurement
- Connection establishment time

**Tools**:
- pytest-asyncio for async test support
- httpx.AsyncClient for WebSocket testing
- fakeredis for Redis mocking (unit tests)
- Real Redis for integration tests

### 7. Error Handling Patterns

**Decision**: Structured error responses with WebSocket close codes

**Error Categories**:
1. **Validation Errors** (1008 Policy Violation):
   - Invalid invocation_id format
   - Invocation does not exist
   - Close immediately with reason

2. **Connection Errors** (1011 Internal Error):
   - Redis unavailable
   - Database connection lost
   - Close with retry-able indication

3. **Client Errors** (1002 Protocol Error):
   - Malformed ping/pong
   - Unexpected message format
   - Close with non-retry indication

**Best Practices**:
- Log all errors with structured context (invocation_id, client_ip, error_type)
- Use appropriate WebSocket close codes
- Provide clear reason messages
- Don't expose internal details in client-facing messages

### 8. Resource Cleanup

**Decision**: Multi-level cleanup strategy

**Connection Cleanup** (Immediate):
- On WebSocket close: Remove from active connections set
- Asyncio task cleanup via `finally` blocks
- No orphaned background tasks

**Event Cleanup** (Deferred):
- Redis EXPIRE on invocation stream key (24 hours)
- Triggered when invocation status = completed/failed
- Manual cleanup job for orphaned streams (future)

**Implementation**:
```python
try:
    # WebSocket handling
except WebSocketDisconnect:
    # Log disconnect
finally:
    # Clean up connection resources
    await cleanup_connection(invocation_id, connection_id)
```

## Dependencies Summary

### Required
- FastAPI 0.104+ (WebSocket support)
- Redis 5.0+ (Streams support)
- SQLAlchemy 2.0+ (async invocation queries)
- pytest-asyncio (testing)
- httpx (WebSocket test client)

### Optional
- prometheus-client (metrics, future)
- structlog (structured logging, future)

## Performance Considerations

**Bottlenecks Identified**:
1. Redis network latency (mitigated by local deployment)
2. JSON serialization (acceptable at <100 events/sec per invocation)
3. Database query on connection (cached result for validation)

**Optimization Strategies**:
- Use Redis pipelining for batch event publishing (future)
- Connection pooling for Redis (via aioredis)
- Lazy loading of historical events (only on reconnect)

## Security Considerations

**MVP Scope** (Deferred):
- Authentication: Deferred to future iteration
- Authorization: Deferred to future iteration
- Rate limiting: Deferred to future iteration

**Immediate Mitigations**:
- Invocation ID validation prevents unauthorized access (security through obscurity)
- Connection limits prevent resource exhaustion
- Input validation on all WebSocket messages

## Configuration Constants

**Values Based on Clarifications** (Session 2025-10-20):
```python
WEBSOCKET_HEARTBEAT_INTERVAL = 30  # seconds
WEBSOCKET_PONG_TIMEOUT = 10  # seconds
WEBSOCKET_MAX_CONNECTIONS_PER_USER_IP = 25  # Clarification Q2
WEBSOCKET_MAX_TOTAL_CONNECTIONS = 100
WEBSOCKET_DEFAULT_REPLAY_COUNT = 10  # Clarification Q1 (default)
WEBSOCKET_ALLOW_FULL_HISTORY_REPLAY = True  # Clarification Q1 (optional)
REDIS_EVENT_STREAM_TTL = 86400  # 24 hours - Clarification Q3
REDIS_EVENT_RETENTION_COUNT = 1000  # max events per invocation
```

## Clarification Decisions (Session 2025-10-20)

The following decisions were made through formal clarification process:

### 1. Event Replay Window (Clarification Q1)
**Question**: What is the maximum event replay window for reconnecting clients?
**Decision**: Default replay of last 10 events, with optional full history retrieval available

**Implementation Impact**:
- Default behavior: XREAD with XREVRANGE to get last 10 events
- Optional parameter: client can request full history (last_id='0')
- Balances performance (default) with flexibility (full history option)

### 2. Connection Limits (Clarification Q2)
**Question**: What is the maximum concurrent connections allowed per user/IP?
**Decision**: 25 connections per user/IP

**Implementation Impact**:
- Track connections per client IP address
- Reject new connections exceeding limit with clear error message
- Supports dashboard/multi-tab use cases while preventing abuse

### 3. Event Cleanup Timing (Clarification Q3)
**Question**: When should event data be cleaned up after invocation completion?
**Decision**: After 24 hours retention

**Implementation Impact**:
- Redis EXPIRE set to 86400 seconds on invocation completion
- Clients can reconnect and replay within 24-hour window
- Automatic cleanup reduces storage requirements

### 4. Error Event Handling (Clarification Q4)
**Question**: What event should be emitted when an invocation fails or encounters an error?
**Decision**: Emit "error" event and keep connection open for potential recovery

**Implementation Impact**:
- New event type: "error" (added to started, completed)
- Connection remains open after error event
- Clients can monitor for recovery, retry, or completion events
- Supports resilient error handling patterns

### 5. Observability Requirements (Clarification Q5)
**Question**: What observability data should the system provide?
**Decision**: Connection events + metrics + event delivery traces (traces lower priority)

**Implementation Impact**:
- **Priority 1** (MVP): Log connection lifecycle (connect, disconnect, errors)
- **Priority 1** (MVP): Expose metrics (connection count, latency, error rates)
- **Priority 2** (Post-MVP): Event delivery traces for debugging
- Supports production operations and troubleshooting

## Open Questions Resolved (Initial Research)

1. **Q**: Should we support historical event replay on connect?
   **A**: Yes, via Redis Stream XREAD - **Updated by Clarification Q1**: Default last 10, optional full history

2. **Q**: How to handle slow consumers?
   **A**: Redis buffers events, client catches up at its own pace, no backpressure needed for MVP

3. **Q**: Should events be persisted after invocation completion?
   **A**: Yes with TTL - **Updated by Clarification Q3**: 24-hour retention

4. **Q**: How to handle WebSocket protocol version negotiation?
   **A**: Not needed, WebSocket protocol is standard, clients use same version

## References

- [FastAPI WebSocket Documentation](https://fastapi.tiangolo.com/advanced/websockets/)
- [Redis Streams Introduction](https://redis.io/docs/data-types/streams/)
- [WebSocket Protocol RFC 6455](https://tools.ietf.org/html/rfc6455)
- Nexus ADR: WebSockets decision (decision-records.md line 14)
- Nexus Constitution v1.1.0
