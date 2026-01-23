# BuilderContent Execution Badge Integration Tests

## Overview

This document describes the expected behavior of execution badge rendering in BuilderContent.tsx. These tests verify the critical race condition fix implemented for badge display.

## Context

Execution status badges are visual indicators on workflow nodes showing activity execution status (pending, running, completed, failed, etc.). The implementation had a race condition where:

- Activity data loads from REST API quickly
- React Flow loads nodes asynchronously later via `queueMicrotask()`
- The execution state effect needs to wait for nodes to load before applying badges

## Fix Implementation (BuilderContent.tsx)

### Node Initialization Tracking

```typescript
const nodesInitialized = useNodesInitialized() // React Flow hook
const [nodeCount, setNodeCount] = useState(0)

// Monitor when nodes are loaded
useEffect(() => {
  if (nodesInitialized) {
    const nodes = reactFlowInstance.getNodes()
    if (nodes.length !== nodeCount) {
      setNodeCount(nodes.length)
    }
  }
}, [nodesInitialized, reactFlowInstance, nodeCount])
```

### Execution State Application

```typescript
useEffect(() => {
  const nodes = reactFlowInstance.getNodes()

  // Skip if no nodes loaded yet (race condition)
  if (nodes.length === 0) {
    return
  }

  // Apply __executionState to nodes for badge rendering
  // ...
}, [activityStates, executionViewOpen, isExecutionView, reactFlowInstance, currentWorkflow, nodeCount])
```

## Test Scenarios

### 1. Node Initialization Detection

**Given**: A workflow with activities is loaded
**When**: BuilderContent renders
**Then**: `useNodesInitialized()` hook is called to monitor node initialization

### 2. Node Count Tracking

**Given**: Nodes are not yet initialized (`nodesInitialized = false`)
**When**: Nodes load asynchronously (`nodesInitialized = true`, `getNodes()` returns nodes)
**Then**: `nodeCount` state updates, triggering execution state effect

### 3. Execution State Application with Loaded Nodes

**Given**:

- `isExecutionView = true`
- Activity executions exist in store
- Nodes are initialized and loaded

**When**: Execution state effect runs
**Then**:

- `getNodes()` is called
- Nodes with matching activity IDs get `__executionState` added to their data
- ExecutionStatusBadge components render on nodes

### 4. Race Condition: Activities Load Before Nodes

**Given**:

- Activity executions loaded into store
- Nodes not yet initialized (`nodesInitialized = false`, `getNodes()` returns `[]`)

**When**: Execution state effect runs
**Then**:

- Effect skips (no nodes to apply state to)
- When `nodeCount` changes (nodes load), effect re-runs
- Badges applied correctly after nodes load

### 5. Builder Overlay Mode

**Given**:

- `executionViewOpen = true` in store (builder overlay mode)
- Activity states in execution store
- Nodes loaded

**When**: Execution state effect runs
**Then**: Activity states from store applied to nodes (same as execution view)

### 6. No Activities

**Given**: Workflow has no activities (empty workflow definition)
**When**: BuilderContent renders
**Then**: No errors, renders empty canvas

### 7. Null Workflow

**Given**: No workflow loaded (`workflow = undefined`)
**When**: BuilderContent renders
**Then**: No errors, shows new workflow creation UI

## Data Flow

```
REST API → ExecutionDetail.tsx
  ↓
  setActivityExecutions(activities)
  ↓
useExecutionStore (activityStates Map)
  ↓
BuilderContent.tsx (activityStates from store)
  ↓
Execution State Effect
  ↓
Wait for nodesInitialized = true  ← React Flow async loading
  ↓
Apply __executionState to nodes
  ↓
Node renders ExecutionStatusBadge
```

## Edge Cases Covered

1. **Direct URL Load**: User navigates directly to `/executions/{id}` URL
   - Activities load before React Flow initializes
   - `nodeCount` tracking ensures effect re-runs when nodes finally load

2. **Empty Activities Array**: Execution just started, no activity executions yet
   - ExecutionDetail.tsx creates pending states from workflow definition
   - All nodes show pending badges

3. **Switching Between Executions**: User selects different execution in history panel
   - `clearExecutionState()` clears previous activity states
   - New activity states loaded
   - Effect re-runs with new data

## Verification Points

### Component Must Call:

- `useNodesInitialized()` - to detect node initialization
- `reactFlowInstance.getNodes()` - to check for loaded nodes
- Check `nodes.length > 0` before applying execution state

### Effect Dependencies Must Include:

- `activityStates` - from execution store
- `executionViewOpen` - builder overlay mode flag
- `isExecutionView` - execution page mode flag
- `nodeCount` - triggers re-run when nodes load
- `reactFlowInstance` - for accessing nodes
- `currentWorkflow` - workflow data

### State Flow:

1. `nodesInitialized` changes from `false` to `true`
2. `nodeCount` changes from `0` to `N` (number of nodes)
3. Execution state effect runs with nodes available
4. Nodes updated with `__executionState` data
5. ExecutionStatusBadge components render

## Related Files

- `BuilderContent.tsx:873-890` - Node initialization tracking
- `BuilderContent.tsx:939` - Execution state effect dependencies
- `ExecutionDetail.tsx:189-204` - Pending activities initialization
- `useExecutionStore.ts:185-193` - setActivityExecutions action
- `ExecutionStatusBadge.tsx` - Badge rendering component

## Manual Testing Steps

1. Start a workflow execution from automation builder
2. Navigate directly to `/executions/{id}?history=open`
3. Verify all nodes show execution status badges
4. Open history panel and select different execution
5. Verify badges update correctly
6. Start new execution (pending states)
7. Verify all nodes show pending badges
