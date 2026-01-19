# Research: Visualize Workflow Execution

**Feature**: Visualize Workflow Execution | **Date**: 2025-12-10
**Status**: Complete

---

## Executive Summary

This research document captures technical analysis and decisions for implementing real-time workflow execution visualization in Nexus. The feature enables operators to monitor workflow execution through an interactive graph with real-time status updates.

**Key Decisions**:
1. Extend existing WebSocket infrastructure (backend)
2. Use JSON Patch messages (RFC 6902) with Valkey Streams for real-time updates and event replay
3. Extend ReactFlow builder with runtime visualization mode (frontend)
4. Use Valkey Streams for event replay; WebSocket delivers initial and updated state

---

## 1. Backend Architecture Analysis

### 1.1 Activity Sync Infrastructure ✅ Existing

**Location**: `src/nexus/workflows/workflow_engine/`

**Components**:
| File | Purpose | Status |
|------|---------|--------|
| `services/activity_sync_service.py` | Stream Temporal events to database | ✅ Existing |
| `interceptors/monitoring_interceptor.py` | Auto-start monitoring on workflow init | ✅ Existing |
| `activities/internal/activity_monitoring.py` | Register monitoring activity | ✅ Existing |
| `services/activity_sync_registry.py` | Global registry for sync service | ✅ Existing |

### 1.2 Existing WebSocket Infrastructure

**Location**: `src/nexus/core/websocket/`

**Components**:
| File | Purpose | Reuse Strategy |
|------|---------|----------------|
| `manager.py` | Connection lifecycle management (singleton) | Use as-is |
| `connection.py` | Connection state tracking | Use as-is |
| `endpoint_factory.py` | Dynamic endpoint creation from AsyncAPI | Extend for visualization channel |
| `discovery.py` | Auto-discover handlers from convention paths | Follow pattern |
| `interceptor.py` | Bootstrap-time validation hooks | Use for schema validation |

**Connection Lifecycle**:
```
CONNECTING → CONNECTED → RECONNECTING → FAILED → CLOSED
                ↑              │
                └──────────────┘ (retry success)
```

| State | Description | UI Indicator |
|-------|-------------|--------------|
| `connecting` | Initial connection attempt | Loading spinner |
| `connected` | Active connection, receiving updates | Green indicator |
| `reconnecting` | Temporarily disconnected, auto-retrying | Yellow warning banner |
| `failed` | Max retries exceeded, gave up | Red error with manual retry button |
| `closed` | Intentionally disconnected | No indicator |

**Reconnection Parameters** (configurable):
| Parameter | Default | Description |
|-----------|---------|-------------|
| `initialDelay` | 1000ms | First retry delay |
| `maxDelay` | 30000ms | Maximum backoff delay |
| `maxAttempts` | 10 | Retries before transitioning to `failed` |
| `backoffMultiplier` | 2.0 | Exponential backoff factor |

**Health Monitoring**:
- Ping interval: 30 seconds
- Timeout: 60 seconds (2 missed pongs)
- Staleness threshold: 5 seconds (data marked stale after disconnection)

### 1.3 Existing AsyncAPI Specification

**Location**: `src/nexus/schemas/workflows/workflow-websocket-api.yaml`

**Existing Channels** (not used for visualization):
| Channel | Address | Purpose |
|---------|---------|---------|
| `allExecutions` | `/executions` | All executions with filtering |
| `approvalNotifications` | `/approvals` | Human approval workflow alerts |

**Key Message Types**:
- `execution_update` - Overall execution status
- `activity_update` - Individual activity status
- `connection_ack` - Connection acknowledgment with session

**Decision**: Create new `websocket-execution-streaming.yaml` with `activityUpdates` channel for visualization-specific messages. This follows the auto-discovery naming convention (`websocket-{handler}.yaml` pairs with `ws/{handler}.py`) and keeps visualization schemas separate from core execution/activity/approval messaging.

### 1.4 Workflow Execution Models

**Location**: `src/nexus/workflows/models/execution.py`

**ExecutionStatus Enum**:
```python
PENDING = "pending"
RUNNING = "running"
PAUSED = "paused"
COMPLETED = "completed"
FAILED = "failed"
CANCELLED = "cancelled"
```

**Mapping to Visualization States**:
| Backend Status | Visualization State |
|----------------|---------------------|
| `pending` | `pending` |
| `running` | `running` |
| `completed` | `success` |
| `failed` | `error` |
| `cancelled` | `cancelled` |
| (conditional skip) | `skipped` |
| `paused` | `pending` (with indicator) |

---

## 2. Frontend Architecture Analysis

### 2.1 ReactFlow Integration

**Location**: `nexus-ui/packages/nexus-ui/src/routes/builder/`

**Key Components**:
| Component | Purpose | Reuse Strategy |
|-----------|---------|----------------|
| `BuilderFlow.tsx` | Graph rendering with ReactFlow | Base pattern for RuntimeCanvas |
| `BuilderContent.tsx` | Workflow builder container | UI layout pattern |
| `registry/NodeRegistry.ts` | Node type registration (singleton) | Extend with runtime status |

**Node Registration Pattern**:
```typescript
NodeRegistry.register(
  createBasicNode({
    id: 'approval',
    label: 'Approval',
    icon: UserCheckIcon,
    category: 'logic',
    ...
  })
)
```

**Layout Algorithm**: Dagre for hierarchical positioning

### 2.2 State Management

**Location**: `nexus-ui/packages/nexus-ui/src/stores/useWorkflowStore.ts`

**Pattern**: Zustand with selective subscriptions

**Key Store Patterns**:
- `workflowVersion` counter for change detection
- Batch operations for atomic updates
- Edge synchronization hooks

**Decision**: Create separate `useExecutionStore` for runtime state, following same patterns as `useWorkflowStore`.

### 2.3 Edge Types

**Location**: `nexus-ui/packages/nexus-ui/src/routes/builder/components/`

**Existing Edge Components**:
- `ButtonEdge` - Interactive edge with add-node functionality

**Decision**: Create `ExecutionEdge` extending base edge with:
- Style transitions (dotted white → solid white when boundary passed)
- No success/fail colors - edge indicates boundary passed, not outcome
- No interactive buttons (runtime is read-only)

---

## 3. Protocol Design

### 3.1 JSON Patch Messages

**Rationale**: JSON Patch (RFC 6902) provides idempotent operations ideal for event replay. Operations can be safely replayed without side effects.

**Expected Message Frequency**:
| Scenario | Updates/Second | Notes |
|----------|----------------|-------|
| Workflow starting | 5-10 | Multiple nodes transition to running |
| Steady execution | 1-2 | Individual node completions |
| Parallel activities | 3-5 | Multiple concurrent node updates |
| Workflow completing | 2-3 | Final status transitions |

**Message Size**: ~150-250 bytes per `activity_patch` message (includes message_id, ops array, paths)

**Note**: Edge status is not sent from the server. Edge status is derived client-side from node status (dotted = pending, solid = passed).

**Initial State Delivery** (using `op=add`):
```json
{
  "type": "activity_patch",
  "execution_id": "abc-123-def-456",
  "message_id": "1691431234000-0",
  "ops": [
    {"op": "add", "path": "/activities/fetch_data/status", "value": "pending"},
    {"op": "add", "path": "/activities/process_data/status", "value": "pending"}
  ]
}
```

**Status Update** (using `op=replace`):
```json
{
  "type": "activity_patch",
  "execution_id": "abc-123-def-456",
  "message_id": "1691431234100-0",
  "ops": [
    {"op": "replace", "path": "/activities/process_data/status", "value": "running"}
  ]
}
```

**Activity Failure with Error Details**:
```json
{
  "type": "activity_patch",
  "execution_id": "abc-123-def-456",
  "message_id": "1691431240000-0",
  "ops": [
    {"op": "replace", "path": "/activities/send_notification/status", "value": "failed"},
    {"op": "add", "path": "/activities/send_notification/error_details", "value": "Connection timeout"}
  ]
}
```

**Client Ordering**: Messages include Valkey-generated `message_id` (format: `{milliseconds}-{sequence}`). On reconnect, client uses `replay=<last_message_id>` to receive all events since last known state.

### 3.2 Valkey Streams State Pattern

**Reference**: Commit 19adab46 - ActivitySyncService implementation (extended with Valkey Streams)

**Initial Connection**:
1. HTTP GET `/api/v1/executions/{id}?include=workflow_definition` → Execution + workflow_definition
2. Build visualization graph client-side from workflow_definition
3. WebSocket connect to `/ws/workflows/v1/executions/{id}?replay=0` → Receive all events from beginning
4. First messages use `op=add` to deliver initial activity states
5. Subsequent messages use `op=replace` for state updates

**Reconnection**:
1. Client uses last known `message_id` from previous connection
2. WebSocket reconnect to `/ws/workflows/v1/executions/{id}?replay=<last_message_id>` → Receive missed events
3. Client applies JSON Patch operations to local state
4. State automatically syncs to current without REST call

**Disconnection Handling**:
- Show stale data warning banner
- Auto-retry connection with exponential backoff
- On reconnect, replay from last known `message_id` (event replay via Valkey Streams)

**Key Difference from Original Plan**:
- Original: Temporal workflow tracks state in-memory, WebSocket long-polls via `wait_for_state_change`
- Implemented: `ActivitySyncService` streams Temporal events to database AND publishes to Valkey Streams

### 3.3 Event Replay via Valkey Streams

The original AAP-60127 proposal specified Event Sourcing with Replay for disconnection recovery. This is **now implemented** using Valkey Streams.

**Implementation Approach**: Valkey Streams with Replay
- Clients track `last_message_id` during connection
- On reconnection, clients connect with `replay=<last_message_id>` parameter
- Valkey Streams XREAD delivers all events since checkpoint
- Client applies JSON Patch operations to reconstruct current state

**Architecture**:
```
ActivitySyncService (Temporal Worker)
        │
        ├──> Database (persistent storage)
        └──> Valkey Streams (XADD to execution:{id}:events)
                │
                └──> WebSocket Handler (XREAD with replay)
                        │
                        └──> Frontend (apply JSON Patch operations)
```

**Replay Semantics**:
| Parameter | Behavior |
|-----------|----------|
| No parameter | Live streaming only (events after connection) |
| `replay=0` | Replay from beginning (all events including initial state) |
| `replay=<message_id>` | Replay from specific message_id onwards |

**Benefits**:
1. **Smooth Reconnection**: No UI "jump" - missed state transitions animate naturally
2. **Initial State via WebSocket**: No separate REST `/activities` endpoint needed
3. **Idempotent Replay**: JSON Patch `replace` operations are safe to replay
4. **Consistency with Spec 013**: Adaptor streaming already uses this pattern
5. **Future Audit Trail**: Event history retained in Valkey Streams (configurable TTL)

**Tradeoffs**:
- **Added Complexity**: Requires jsonpatch library on frontend and backend
- **Message Size**: ~50-70% larger than simple messages (acceptable at expected scale)
- **Gained**: Event replay, initial state via WebSocket, smooth reconnection UX

### 3.4 Real-Time Streaming via Valkey Streams

**Problem**: `ActivitySyncService` runs on the Temporal worker process, but WebSocket connections live on API server(s). A simple callback can't cross process boundaries. Additionally, we need event replay capability.

**Solution**: Use Valkey Streams (Redis-compatible) for inter-process communication with event replay:

```
Temporal Worker                    API Server(s)
┌──────────────────┐              ┌──────────────────┐
│ ActivitySync     │   XADD       │ WebSocket Handler│
│ Service          │──────────────│ (XREAD consumer) │
│                  │   Valkey     │                  │
└──────────────────┘   Streams    └──────────────────┘
                                  ┌──────────────────┐
                                  │ WebSocket Handler│
                                  │ (XREAD consumer) │
                                  └──────────────────┘
```

**Flow**:
1. `ActivitySyncService` commits activity status to database
2. After commit, publishes JSON Patch message to Valkey stream: `XADD execution:{execution_id}:events * <message>`
3. Valkey auto-generates `message_id` (format: `{milliseconds}-{sequence}`)
4. API server WebSocket handlers use `XREAD` to consume messages for their connected clients
5. Handlers support replay via `replay=<message_id>` parameter
6. Each handler broadcasts `activity_patch` message to connected WebSocket clients

**Why Valkey Streams**:
- Already in the stack (used for session state)
- Sub-millisecond latency
- Built-in event replay from any message_id
- Scales to N API server instances
- Works for both single-instance (dev) and multi-instance (production)
- Consistent with adaptor streaming (spec 013)

**Alternatives Considered**:
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Simple callback | No dependencies | Single-process only, no replay | Rejected |
| PostgreSQL LISTEN/NOTIFY | No extra dependency | Connection complexity, no replay | Rejected |
| Valkey pub/sub | Already in stack, scales | No replay capability | Rejected |
| Valkey Streams | Already in stack, replay support | Minor added complexity | **Selected** |

### 3.5 Message Types

**WebSocket Messages for Visualization**:

| Message Type | Payload | Trigger |
|-------------|---------|---------|
| `activity_patch` | `{ type, execution_id, message_id, ops: [JsonPatchOperation] }` | Activity state change in database |

> **Note**: Initial activity states are delivered via WebSocket using `op=add` operations when connecting with `replay=0`. No separate REST endpoint needed.

> **Note**: Edge status is computed client-side from node status (see Section 2.4 of data-model.md). No edge status messages are sent from the server. Edges are dotted white (pending) or solid white (passed).

---

## 4. Dependencies Analysis

### 4.1 Backend Dependencies

| Dependency | Purpose | Status |
|------------|---------|--------|
| `fastapi[websocket]` | WebSocket support | Already installed |
| `asyncio` | Async event handling | Built-in |
| `valkey` | Streams for real-time updates with replay | Already installed (session state) |
| `jsonpatch` | JSON Patch (RFC 6902) operations | **New dependency** |

**Note**: Valkey is already used for session state. We leverage Valkey Streams (XREAD/XADD) for broadcasting activity updates from the Temporal worker to API server WebSocket handlers with event replay support.

### 4.2 Frontend Dependencies

| Dependency | Purpose | Status |
|------------|---------|--------|
| `@xyflow/react` | ReactFlow graph | Already installed |
| `zustand` | State management | Already installed |
| `immer` | Immutable state updates | Already installed |
| `fast-json-patch` | JSON Patch (RFC 6902) operations | **New dependency** |

**Note**: JSON Patch operations are applied to activity state using the `fast-json-patch` library, which provides utilities like `applyPatch()` for applying JSON Patch operations to JavaScript objects.

---

## 5. Scaling Limits

| Metric | Limit | Rationale |
|--------|-------|-----------|
| Nodes per workflow | 50 | Spec constraint |
| Concurrent connections per user | 5 | Browser tab limit |
| Total concurrent connections | 1000 | WebSocket server capacity |
| Message rate per execution | 10/sec | Temporal activity rate |

---

## 6. Error Handling Strategy

### 6.1 Error Categories

| Category | Examples | Handling Strategy |
|----------|----------|-------------------|
| **Connection Errors** | Network failure, server unavailable | Auto-retry with backoff, show reconnecting state |
| **Validation Errors** | Invalid command, malformed message | Log to console, show user-friendly error |
| **Server Errors** | Internal server error | Show error toast, allow manual retry |
| **Not Found Errors** | Execution doesn't exist | Show error message, no retry |

### 6.2 User Notification Strategy

**Connection Status Indicator** (always visible):
- Location: Top-right corner of RuntimeCanvas
- States: Green dot (connected), Yellow dot (reconnecting), Red dot (failed)
- Clicking indicator shows connection details popover

**Error Toast Notifications**:
- Duration: 5 seconds (dismissible)
- Position: Bottom-right corner
- Types: Error (red), Warning (yellow), Info (blue)

**Stale Data Banner**:
- Location: Top of RuntimeCanvas, full width
- Message: "Connection lost. Data may be out of date. Reconnecting..."
- Includes manual "Retry Now" button

### 6.3 Error Flow

```
WebSocket Error Received
        │
        ▼
┌───────────────────┐
│ Categorize Error  │
└───────────────────┘
        │
        ├─── Connection Error ──▶ Set reconnecting state, auto-retry
        │
        ├─── Not Found ──▶ Show error message, stop retrying
        │
        └─── Other Error ──▶ Show toast notification, log to console
```

### 6.4 Frontend Error Handling Hook

```typescript
// Error handler integrated with Zustand store
const handleWebSocketError = (error: WebSocketError) => {
  switch (error.code) {
    case 'EXECUTION_NOT_FOUND':
      toast.error('Execution not found');
      executionStore.setError('Execution not found');
      break;
    case 'INVALID_COMMAND':
      console.warn('[WebSocket] Invalid command:', error.message);
      break;
    default:
      toast.error(error.message);
      console.error('[WebSocket]', error);
  }
};
```

---

## 7. Risk Analysis

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| WebSocket connection instability | Medium | High | Database as source of truth with auto-reconnect and REST fallback |
| Message ordering issues | Low | Medium | Idempotent status updates; reconnect fetches fresh state from REST |
| Large workflow rendering performance | Low | Medium | 50-node limit, virtualization if needed |
| Browser memory with long-running sessions | Medium | Low | State cleanup on page navigation |

---

## 8. Alternatives Considered

### 8.1 REST Polling (Rejected)

**Pros**: Simple implementation, works through all proxies
**Cons**: Latency (wait for next poll), server load, poor UX

**Decision**: Rejected - Cannot provide real-time updates reliably

### 8.2 Server-Sent Events (Rejected)

**Pros**: Native browser reconnection, simpler than WebSocket
**Cons**: Unidirectional only, no multi-topic subscription

**Decision**: Rejected - Need bidirectional for future control commands (pause/resume)

### 8.3 Separate Visualization Service (Rejected)

**Pros**: Independent scaling, isolated failure domain
**Cons**: Infrastructure complexity, additional deployment

**Decision**: Rejected - Extend existing service for simpler operations

---

## 9. Implementation Sequence

**Recommended Order**:

1. ✅ **Backend Phase 1**: ActivitySyncService + MonitoringWorkflowInterceptor (Existing)
2. ✅ **Backend Phase 2**: Workflow queries for activity input/output (Existing)
3. ✅ **Backend Phase 3**: SKIPPED and CANCELLED status values (Existing)
4. **Backend Phase 4**: WebSocket handler for push notifications (TODO)
5. **Frontend Phase 1**: Zustand store + REST hooks for initial state
6. **Frontend Phase 2**: WebSocket hook for real-time updates
7. **Frontend Phase 3**: ExecutionCanvas component with StatusBadge
8. **Integration**: End-to-end testing
9. **Polish**: Connection recovery UX

---

## References

1. [Proposal Document](resources/proposal.md) - AAP-60127 Event-Driven Real-Time Streaming
2. [Core WebSocket API](../../src/nexus/schemas/workflows/workflow-websocket-api.yaml) - Existing execution/activity/approval messaging
3. [Visualization WebSocket API](../../src/nexus/schemas/workflows/websocket-execution-streaming.yaml) - Visualization-specific schemas
4. [ReactFlow Documentation](https://reactflow.dev/) - Graph visualization library
5. [Zustand Documentation](https://zustand-demo.pmnd.rs/) - State management
