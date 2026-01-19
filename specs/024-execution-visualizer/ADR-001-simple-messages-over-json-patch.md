# ADR-001: JSON Patch for WebSocket Updates with Valkey Streams Replay

## Status

Superseded by team decision on 2026-01-14

## Date

2025-01-13 (Original)
2026-01-14 (Superseded)

## Context

The AAP-60127 proposal specified JSON Patch (RFC 6902) for incremental WebSocket updates to minimize bandwidth and enable granular state synchronization. During implementation of the execution visualization feature (spec 024), we evaluated both approaches against our actual use case requirements.

### Original Proposal (JSON Patch)

```json
{
  "type": "patch",
  "patches": [
    {"op": "replace", "path": "/nodes/0/status", "value": "running"},
    {"op": "add", "path": "/nodes/0/progress", "value": 20}
  ]
}
```

### Implemented Approach (Simple Messages)

```json
{
  "type": "activity_update",
  "execution_id": "abc-123-def-456",
  "activity_id": "process_data",
  "status": "running",
  "progress": 45
}
```

## Decision

Use simple `activity_update` messages instead of JSON Patch for WebSocket communication.

## Rationale

### Message Frequency Analysis

- Expected message rate: 1-10 messages/second during workflow execution
- Message size comparison:
  - Simple message: ~100-150 bytes
  - JSON Patch: ~50-80 bytes
- At 10 msg/sec: ~1.5 KB/sec vs ~0.8 KB/sec
- **Conclusion**: Negligible difference at expected scale

### Implementation Complexity

| Aspect | JSON Patch | Simple Messages |
|--------|-----------|-----------------|
| Backend serialization | Requires jsonpatch library | Native JSON serialization |
| Frontend application | Requires jsonpatch library + merge logic | Direct state update by activity_id |
| Debugging | Path-based addressing harder to trace | Explicit activity_id in every message |
| Testing | Complex patch sequences with ordering | Simple message validation |
| Idempotency | `add`/`remove` operations are NOT idempotent | Naturally idempotent (last status wins) |

### Risk Assessment

**JSON Patch Risks:**
- Patch ordering bugs when messages arrive out of order
- Idempotency issues with `add`/`remove` operations
- Path-based addressing requires maintaining node index mappings
- Library dependency for both frontend and backend

**Simple Messages Risks:**
- Slightly higher bandwidth (acceptable at scale)
- No built-in progress tracking (added as optional field)

### Activity-Centric Model Fit

The backend data model is activity-centric (ActivityExecution records in database). Simple messages naturally map to this model:
- `activity_id` directly maps to `activity_id` in ActivityExecution
- No translation layer needed between database model and WebSocket message
- Frontend stores activity states in a Map keyed by `activity_id`

## Consequences

### Positive

- Simpler implementation on both frontend and backend
- No external library dependencies (jsonpatch)
- Easier debugging with explicit activity identifiers
- Naturally idempotent - no ordering concerns
- Cleaner separation of concerns (message per activity, not patches to a document)

### Negative

- ~50-70% higher bandwidth per message (negligible at expected scale)
- No built-in support for complex state transitions (not needed for current use case)

### Neutral

- Progress tracking added as optional field in message schema
- Can migrate to JSON Patch later if bandwidth becomes an issue (unlikely)

## Alternatives Considered

1. **JSON Patch (RFC 6902)** - Rejected for complexity vs minimal bandwidth benefit
2. **Full state updates** - Rejected for excessive bandwidth
3. **Custom binary protocol** - Rejected for non-standard, harder debugging
4. **GraphQL subscriptions** - Rejected for infrastructure overhead

## Related Decisions

- Event Replay not implemented (database query on reconnect instead)
- Edge status computed client-side (not broadcast from server)
- Valkey Pub/Sub for inter-process communication

## References

- [AAP-60127 Event-Driven Real-Time Streaming Proposal](../../../AAP-60127-Event-Driven-Real-Time-Streaming-for-Nexus-Workflow-Engine.md)
- [RFC 6902 - JSON Patch](https://datatracker.ietf.org/doc/html/rfc6902)
- [Execution Visualizer Spec](../../../specs/024-execution-visualizer/spec.md)
- [Data Model Documentation](../../../specs/024-execution-visualizer/data-model.md)

---

## 2026-01-14 Update: Reversal of Decision

### New Context

After team discussion and alignment with the adaptor streaming implementation (spec 013), the following decisions were made:

1. **Replace Valkey pub/sub with Valkey Streams** for event replay support from any `event_id`
2. **Adopt JSON Patch format** (RFC 6902) for WebSocket messages to enable:
   - Idempotent operations (`replace`, `test`)
   - Initial state delivery via `op=add` operations
   - Precise state updates via `op=replace` operations
3. **WebSocket replay parameter**: `replay=<event_id>` to support reconnection from a specific point
4. **Change sequence to event_id**: Use Valkey auto-generated stream IDs (format: `{milliseconds}-{sequence}`) instead of application-level sequence numbers

### New Decision

Use **JSON Patch (RFC 6902)** with Valkey Streams for WebSocket communication.

### Rationale for Reversal

1. **Event Replay Requirement**: Valkey Streams provide native replay capability, allowing clients to reconnect from any `event_id`. This requires a stable message format that can be replayed idempotently - JSON Patch is ideal for this.

2. **Initial State Delivery**: With Valkey Streams replay, initial state can be delivered via WebSocket using `op=add` operations, eliminating the need for separate REST endpoints for activity states.

3. **Consistency with Adaptor Streaming**: Spec 013 (adaptor-streaming) already uses Valkey Streams with similar replay semantics. Using the same pattern provides consistency across the codebase.

4. **Idempotency for Replay**: JSON Patch's `replace` operation is naturally idempotent, making it safe to replay messages without side effects. Simple messages lack this guarantee.

5. **Path-Based Updates**: JSON Patch's path-based addressing (e.g., `/activities/process_data/status`) provides clear, structured updates that map well to the activity tree structure.

### New Message Format

```json
{
  "type": "activity_patch",
  "execution_id": "abc-123-def-456",
  "event_id": "1691431234567-0",
  "ops": [
    {"op": "replace", "path": "/activities/process_data/status", "value": "completed"}
  ]
}
```

### Consequences of Reversal

**Positive:**
- Event replay support from any `event_id` via Valkey Streams
- No separate REST endpoint needed for initial activity states
- Idempotent operations safe for replay
- Consistency with adaptor streaming (spec 013)
- Native support for partial state updates

**Negative:**
- Slightly more complex message format (~20-30% larger messages)
- Requires jsonpatch library on frontend and backend
- More complex testing scenarios with JSON Patch operations

**Mitigation:**
- Message size increase is acceptable (still <200 bytes per update)
- jsonpatch is a well-maintained library with broad support
- Test coverage will include replay scenarios
