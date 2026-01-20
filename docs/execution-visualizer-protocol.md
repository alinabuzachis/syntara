# Execution Visualizer - Protocol & Data Spec

**Purpose**: Technical specification for real-time workflow execution visualization.

---

## Endpoints

```
POST /api/v1/executions
WS   /ws/workflows/v1/executions/{id}?replay={eventId}
GET  /api/v1/executions/{id}?include=workflow_definition&include=activities
```

---

## Sequence: User Clicks "Run"

```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: User Action                                             │
└─────────────────────────────────────────────────────────────────┘
  User clicks "Run Automation" button on builder page
  ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: HTTP POST - Create Execution                            │
└─────────────────────────────────────────────────────────────────┘
  POST /api/v1/executions
  Body: { "workflow_id": "wf-789", "input_data": {} }
  ↓
  Response: {
    "id": "exec-123-456",
    "workflow_id": "wf-789",
    "workflow_version_id": "ver-001",
    "status": "pending",
    "created_at": "2025-01-20T10:00:00Z",
    "started_at": null,
    "completed_at": null
  }
  ↓
  UI: Store execution_id from response.id, switch to runtime mode
  ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: WebSocket Connect                                       │
└─────────────────────────────────────────────────────────────────┘
  WS /ws/workflows/v1/executions/exec-123-456?replay=0
  ↓
  Connection established
  ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: Receive Initial Snapshot                                │
└─────────────────────────────────────────────────────────────────┘
  Message Type: initial_snapshot
  {
    "type": "initial_snapshot",
    "execution_id": "exec-123-456",
    "event_id": "1737307800000-0",
    "execution": {
      "id": "exec-123-456",
      "workflow_id": "wf-789",
      "workflow_version_id": "ver-001",
      "status": "running",
      "created_at": "2025-01-20T10:00:00Z",
      "started_at": "2025-01-20T10:00:01Z",
      "completed_at": null,
      "activities": [
        { "activity_id": "manual_trigger", "status": "pending", "error_details": null, "started_at": null, "completed_at": null },
        { "activity_id": "agent_task_1", "status": "pending", "error_details": null, "started_at": null, "completed_at": null }
      ]
    },
    "timestamp": "2025-01-20T10:00:01Z"
  }
  ↓
  UI: Initialize activityStates Map, render all nodes as "pending"
  ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 5: Real-Time Activity Patches                              │
└─────────────────────────────────────────────────────────────────┘
  Message Type: activity_patch (trigger starts)
  {
    "type": "activity_patch",
    "execution_id": "exec-123-456",
    "event_id": "1737307801000-0",
    "ops": [
      { "op": "replace", "path": "/activities/manual_trigger/status", "value": "running" }
    ],
    "timestamp": "2025-01-20T10:00:02Z"
  }
  ↓
  UI: Update Map, node border → blue, badge → spinner
  ↓
  Message Type: activity_patch (trigger completes, agent starts)
  {
    "type": "activity_patch",
    "execution_id": "exec-123-456",
    "event_id": "1737307802000-0",
    "ops": [
      { "op": "replace", "path": "/activities/manual_trigger/status", "value": "completed" },
      { "op": "replace", "path": "/activities/agent_task_1/status", "value": "running" }
    ],
    "timestamp": "2025-01-20T10:00:05Z"
  }
  ↓
  UI: Update Map
    - manual_trigger: border → green, badge → checkmark
    - edge trigger→agent: dotted → solid
    - agent_task_1: border → blue, badge → spinner
  ↓
  ... more activity_patch messages as workflow executes ...
  ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 6: Receive Final Snapshot                                  │
└─────────────────────────────────────────────────────────────────┘
  Message Type: final_snapshot
  {
    "type": "final_snapshot",
    "execution_id": "exec-123-456",
    "event_id": "1737307850000-0",
    "execution": {
      "id": "exec-123-456",
      "workflow_id": "wf-789",
      "workflow_version_id": "ver-001",
      "status": "completed",
      "created_at": "2025-01-20T10:00:00Z",
      "started_at": "2025-01-20T10:00:01Z",
      "completed_at": "2025-01-20T10:05:30Z",
      "activities": [
        { "activity_id": "manual_trigger", "status": "completed", "error_details": null, "started_at": "2025-01-20T10:00:01Z", "completed_at": "2025-01-20T10:00:05Z" },
        { "activity_id": "agent_task_1", "status": "completed", "error_details": null, "started_at": "2025-01-20T10:00:05Z", "completed_at": "2025-01-20T10:05:30Z" }
      ]
    },
    "timestamp": "2025-01-20T10:05:30Z"
  }
  ↓
  UI: Set final states, show "Completed" status
  ↓
  WebSocket connection CLOSED by server
```

---

## Other Scenarios

### Historical Execution

```
GET /api/v1/executions/exec-123?include=workflow_definition&include=activities
→ Returns: workflow structure + final activity states
→ NO WebSocket connection needed
```

### Reconnection (After Disconnect)

```
WS /ws/workflows/v1/executions/exec-123?replay={lastEventId}
→ Receive: Missed events since lastEventId
→ Continue receiving live stream
```

---

## WebSocket Messages

### Message Types

| Type               | When                       | Purpose                         |
| ------------------ | -------------------------- | ------------------------------- |
| `initial_snapshot` | On connect with `replay=0` | Set initial activity states     |
| `activity_patch`   | On every status change     | Update specific activity fields |
| `heartbeat`        | Every 30s                  | Keep-alive                      |
| `final_snapshot`   | Execution complete         | Final state before disconnect   |

### 1. Initial Snapshot

```json
{
  "type": "initial_snapshot",
  "execution_id": "exec-123-456",
  "event_id": "1737307800000-0",
  "execution": {
    "id": "exec-123-456",
    "workflow_id": "wf-789",
    "workflow_version_id": "ver-001",
    "status": "running",
    "created_at": "2025-01-20T10:00:00Z",
    "started_at": "2025-01-20T10:00:01Z",
    "completed_at": null,
    "activities": [
      {
        "activity_id": "trigger",
        "status": "pending",
        "error_details": null,
        "started_at": null,
        "completed_at": null
      },
      { "activity_id": "agent", "status": "pending", "error_details": null, "started_at": null, "completed_at": null }
    ]
  },
  "timestamp": "2025-01-20T10:00:01Z"
}
```

**Action**: Initialize `Map<activity_id, ActivityState>`

### 2. Activity Patch (JSON Patch RFC 6902)

```json
{
  "type": "activity_patch",
  "execution_id": "exec-123-456",
  "event_id": "1737307801000-0",
  "ops": [
    {
      "op": "replace",
      "path": "/activities/trigger/status",
      "value": "running"
    }
  ],
  "timestamp": "2025-01-20T10:00:02Z"
}
```

**Action**: Parse path → Update Map

**Path Format**: `/activities/{activity_id}/{field}`

**Fields**:

- `status` → `"pending" | "running" | "completed" | "failed" | "skipped" | "cancelled" | "retrying"`
- `error_details` → `string`
- `started_at` → `ISO8601 timestamp`
- `completed_at` → `ISO8601 timestamp`

### 3. Heartbeat

```json
{
  "type": "heartbeat",
  "execution_id": "exec-123-456",
  "timestamp": "2025-01-20T10:02:30Z"
}
```

**Action**: No-op (keep connection alive)

### 4. Final Snapshot

```json
{
  "type": "final_snapshot",
  "execution_id": "exec-123-456",
  "event_id": "1737307850000-0",
  "execution": {
    "id": "exec-123-456",
    "workflow_id": "wf-789",
    "workflow_version_id": "ver-001",
    "status": "completed",
    "created_at": "2025-01-20T10:00:00Z",
    "started_at": "2025-01-20T10:00:01Z",
    "completed_at": "2025-01-20T10:05:30Z",
    "activities": [
      {
        "activity_id": "trigger",
        "status": "completed",
        "error_details": null,
        "started_at": "2025-01-20T10:00:01Z",
        "completed_at": "2025-01-20T10:00:05Z"
      },
      {
        "activity_id": "agent",
        "status": "completed",
        "error_details": null,
        "started_at": "2025-01-20T10:00:05Z",
        "completed_at": "2025-01-20T10:05:30Z"
      }
    ]
  },
  "timestamp": "2025-01-20T10:05:30Z"
}
```

**Action**: Set final states → Connection closes

---

## Data Structures

### TypeScript Types

```typescript
// WebSocket message types
interface JsonPatchOp {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test'
  path: string // e.g., "/activities/fetch_data/status"
  value?: unknown
  from?: string
}

interface ActivityData {
  activity_id: string
  status: string
  error_details: string | null
  started_at: string | null
  completed_at: string | null
}

interface Execution {
  id: string // REST API uses 'id' from BaseResource
  workflow_id: string
  workflow_version_id: string
  status: string
  created_at: string
  started_at: string | null
  completed_at: string | null
  activities: ActivityData[]
}

interface ExecutionSnapshotMessage {
  type: 'initial_snapshot' | 'final_snapshot'
  execution_id: string
  event_id: string
  execution: Execution
  timestamp: string
}

interface ActivityPatchMessage {
  type: 'activity_patch'
  execution_id: string
  event_id: string
  ops: JsonPatchOp[]
  timestamp: string
}

interface HeartbeatMessage {
  type: 'heartbeat'
  execution_id: string
  timestamp: string
}

type WebSocketMessage = ExecutionSnapshotMessage | ActivityPatchMessage | HeartbeatMessage
```

### Zustand Store

```typescript
interface ExecutionStore {
  // State
  activityStates: Map<string, ActivityState>
  lastEventId: string
  isConnected: boolean

  // Actions
  applyPatch(ops: JsonPatchOp[]): void
  setInitialState(activities: ActivityData[]): void
}

interface ActivityState {
  status: ActivityStatus
  error_details?: string
  started_at?: string
  completed_at?: string
}
```

### ReactFlow Nodes

```typescript
const nodes = activities.map((activity) => ({
  id: activity.id,
  data: {
    // Static
    name: activity.name,
    type: activity.type,

    // Dynamic - updates from Map
    activityState: activityStates.get(activity.id),
  },
}))
```

### Edge Status (Client-Side Derived)

```typescript
const edgeStatus = ['completed', 'failed', 'cancelled'].includes(sourceNode.status)
  ? 'passed' // Solid line
  : 'pending' // Dotted line
```

---

## Visual Mapping

**Node Status Colors** (theme-agnostic hex values):

| Status      | Border           | Badge   | Animation | Style      |
| ----------- | ---------------- | ------- | --------- | ---------- |
| `pending`   | `#6B7280` Gray   | `[...]` | None      | Solid      |
| `running`   | `#3B82F6` Blue   | `[⟳]`   | Spin      | Solid      |
| `completed` | `#10B981` Green  | `[✓]`   | None      | Solid      |
| `failed`    | `#EF4444` Red    | `[!]`   | Pulse     | Solid      |
| `skipped`   | `#9CA3AF` Gray   | None    | None      | **Dashed** |
| `cancelled` | `#F97316` Orange | `[⊘]`   | None      | Solid      |

_Note: Colors are theme-agnostic and should work on both light and dark backgrounds. Implementation may need to adjust opacity or add contrast enhancements based on theme._

**Edge Visual**:

- Source `pending/running` → Dotted line
- Source `completed/failed/cancelled` → Solid line

_Note: Edge color should adapt to theme (e.g., white/light gray for dark theme, dark gray for light theme)._

---

## Implementation

### Apply JSON Patch

```typescript
function applyPatch(ops: JsonPatchOp[]) {
  for (const op of ops) {
    if (op.op === 'replace' || op.op === 'add') {
      const [, activityId, field] = op.path.match(/^\/activities\/([^/]+)\/(.+)$/)

      activityStates.set(activityId, {
        ...activityStates.get(activityId),
        [field]: op.value,
      })
    }
  }
}
```

### Handle Messages

```typescript
function handleMessage(msg: WebSocketMessage) {
  switch (msg.type) {
    case 'initial_snapshot':
      msg.execution.activities.forEach((a) =>
        activityStates.set(a.activity_id, {
          status: a.status,
          error_details: a.error_details,
          started_at: a.started_at,
          completed_at: a.completed_at,
        })
      )
      lastEventId = msg.event_id
      break

    case 'activity_patch':
      applyPatch(msg.ops)
      lastEventId = msg.event_id
      break

    case 'heartbeat':
      // No-op, connection is alive
      break

    case 'final_snapshot':
      // Set final states, connection will close
      msg.execution.activities.forEach((a) =>
        activityStates.set(a.activity_id, {
          status: a.status,
          error_details: a.error_details,
          started_at: a.started_at,
          completed_at: a.completed_at,
        })
      )
      lastEventId = msg.event_id
      break
  }
}
```

### Reconnect

```typescript
// Store event_id on every message
let lastEventId = '0'

// On disconnect
connectWebSocket(executionId, lastEventId)
// → WS /ws/workflows/v1/executions/{id}?replay={lastEventId}
```

---

## Update Flow

```
WebSocket Message
  ↓
Parse JSON Patch (path → activityName, field)
  ↓
Update Map: activityStates.set(name, { ...prev, [field]: value })
  ↓
Zustand triggers React re-render
  ↓
ReactFlow nodes get new data.activityState
  ↓
Nodes re-render with new border/badge
```

---

## Protocol Rules

1. **Always store `event_id`** from every message (for reconnection)
2. **Backend does NOT send edge status** (derive from source node)
3. **No extra GET for live run** (workflow already in Zustand)
4. **WebSocket closes after `final_snapshot`**
5. **Reconnect with `?replay={lastEventId}`** to catch up

---
