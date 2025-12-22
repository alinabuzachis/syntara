# Workflow Loading and Saving

This document explains how workflows are loaded from the API, edited in the builder, and saved back to the API.

## Overview

Workflows use two different representations:

1. **API Format (Nested)**: Activities are nested within container structures (`sequence`, `loop`, `parallel`, `condition`)
2. **Builder Format (Flat)**: All activities are in a flat array, with edges defining relationships

## Data Flow

```
API (Nested) → Load → Builder (Flat) → Edit → Save → API (Nested)
```

## API Format (Nested Structure)

In the API format, the workflow structure is defined by nesting activities:

```typescript
{
  triggers: [...],
  workflow: {
    activities: [
      {
        type: 'condition',
        condition: 'some_expression',
        then: [                        // Nested activities for true branch
          { type: 'task', ... },
          { type: 'task', ... }
        ],
        else: [                        // Nested activities for false branch
          { type: 'task', ... }
        ]
      },
      {
        type: 'loop',
        loop: {
          over: 'items',
          do: [                        // Nested activities in loop body
            { type: 'task', ... }
          ]
        }
      },
      {
        type: 'parallel',
        branches: [                    // Nested activities for parallel execution
          { type: 'task', ... },
          { type: 'task', ... }
        ]
      }
    ]
  }
}
```

### Characteristics:

- Activities are **nested** within containers
- Structure defines execution flow
- No explicit edges between activities
- Hard to visualize and edit graphically

## Builder Format (Flat with Edges)

In the builder format, all activities are flattened into a single array, with edges defining relationships:

```typescript
{
  triggers: [...],
  workflow: {
    activities: [
      { id: 'condition-1', type: 'condition', condition: '...', then: [], else: [] },
      { id: 'task-1', type: 'task', ... },
      { id: 'task-2', type: 'task', ... },
      { id: 'task-3', type: 'task', ... },
      { id: 'loop-1', type: 'loop', loop: { over: 'items', do: [] } },
      { id: 'task-4', type: 'task', ... },
      { id: 'parallel_for_join-1', type: 'parallel', branches: [...] },
      { id: 'task-5', type: 'task', ... },
      { id: 'task-6', type: 'task', ... }
    ]
  },
  edges: [
    // Condition branches
    { source: 'condition-1', target: 'task-1', sourceHandle: 'true', targetHandle: 'target' },
    { source: 'condition-1', target: 'task-2', sourceHandle: 'false', targetHandle: 'target' },

    // Loop edges
    { source: 'loop-1', target: 'task-4', sourceHandle: 'loop', targetHandle: 'target' },
    { source: 'task-4', target: 'loop-1', sourceHandle: 'source', targetHandle: 'end' },

    // Sequential flow
    { source: 'task-1', target: 'task-3', sourceHandle: 'source', targetHandle: 'target' },

    // Parallel branches (join node creates parallel container)
    { source: 'task-5', target: 'join-1', sourceHandle: 'source', targetHandle: 'target' },
    { source: 'task-6', target: 'join-1', sourceHandle: 'source', targetHandle: 'target' }
  ]
}
```

### Characteristics:

- All activities in a **flat array**
- Edges define all relationships
- Condition nodes have **empty** `then`/`else` arrays during editing
- Loop nodes have **empty** `do` arrays during editing
- Easy to visualize as a graph
- ReactFlow can render directly

## Loading Process (API → Builder)

When a workflow is loaded from the API, it goes through a flattening transformation.

### File: `loadWorkflow.ts`

```typescript
export function loadWorkflow(apiWorkflow: WorkflowDefinition): LoadedWorkflow {
  // 1. Flatten the nested structure
  const { activities, edges } = WorkflowTransform.flatten(apiWorkflow.workflow.activities)

  // 2. Store in workflow store
  useWorkflowStore.getState().setWorkflow({
    ...apiWorkflow,
    workflow: { activities },
  })
  useWorkflowStore.getState().setEdges(edges)

  return { activities, edges }
}
```

### File: `workflowTransform.ts` - `flatten()` method

The `WorkflowTransform.flatten()` method:

1. **Traverses nested structures** recursively
2. **Extracts all activities** to a flat array
3. **Generates edges** representing the nesting relationships
4. **Handles converge nodes in complex workflows** (Dec 2025 improvement)

#### Converge Node Handling (Dec 2025)

The flatten method now includes sophisticated converge node handling to support complex workflows where the backend may reorder activities or nest branch activities separately from converge nodes.

**Three-Pass Algorithm:**

1. **First Pass**: Find all converge nodes and determine what should come after them
   - Handles backend reordering (e.g., `[C, M, J]` instead of `[C, J, M]`)
   - Creates edges from converge nodes to their following activities
   - Looks backward if converge is last in array to find non-branch activities

2. **Second Pass**: Create sequential edges and handle parallel branches
   - For parallel nodes followed by converge nodes: creates edges only from branches listed in `converge.branches`
   - Supports **partial convergence** (not all branches need to converge)
   - Uses `getAllLastActivityIds()` to handle condition nodes within parallel branches

3. **Third Pass**: Handle converge nodes referencing nested activities
   - Creates edges from branch activities to converge nodes even when not adjacent in array
   - Example: `[C(containing A,B), M, J]` where `J.converge.branches=['A','B']` → creates A→J, B→J edges

#### For Condition Nodes:

```typescript
// From nested:
{
  type: 'condition',
  then: [task1, task2],
  else: [task3]
}

// To flat + edges:
activities: [
  { type: 'condition', then: [], else: [] },
  task1,
  task2,
  task3
]
edges: [
  { source: 'condition', target: 'task1', sourceHandle: 'true' },
  { source: 'task1', target: 'task2', sourceHandle: 'source' },
  { source: 'condition', target: 'task3', sourceHandle: 'false' }
]
```

#### For Loop Nodes:

```typescript
// From nested:
{
  type: 'loop',
  loop: {
    over: 'items',
    do: [task1, task2]
  }
}

// To flat + edges:
activities: [
  { type: 'loop', loop: { over: 'items', do: [] } },
  task1,
  task2
]
edges: [
  { source: 'loop', target: 'task1', sourceHandle: 'loop' },
  { source: 'task1', target: 'task2', sourceHandle: 'source' },
  { source: 'task2', target: 'loop', sourceHandle: 'source', targetHandle: 'end' }
]
```

#### For Parallel Nodes:

```typescript
// From nested:
{
  type: 'parallel',
  branches: [task1, task2, condition(task3)]
}

// To flat + edges:
activities: [
  task1,
  task2,
  condition, // With empty then/else
  task3,
  convergeNode
]
edges: [
  { source: 'task1', target: 'convergeNode' },
  { source: 'task2', target: 'convergeNode' },
  { source: 'task3', target: 'convergeNode' }, // Found via getLastActivityId(condition)
  { source: 'condition', target: 'task3', sourceHandle: 'true' }
]
```

**Key Detail**: When a parallel branch contains a condition node, `getLastActivityId()` recursively drills into the condition's `then`/`else` branches to find the actual last activity. This ensures edges to converge nodes are created correctly.

## Editing in Builder

While editing in the builder:

### Condition Nodes

- Remain **flat** with empty `then`/`else` arrays
- Edges encode branch relationships:
  - `sourceHandle: 'true'` → true branch
  - `sourceHandle: 'false'` → false branch

### Loop Nodes

- Have **empty** `do` arrays
- Edges encode loop structure:
  - `sourceHandle: 'loop'` → enters loop body
  - `targetHandle: 'end'` → exits loop back to loop node

### Parallel Execution (Join Nodes)

- Managed by **join nodes** (`type: 'converge'`)
- When 2+ activities connect to a join:
  - `syncConvergeNodeBranches()` updates the converge node's `branches` array with source activity IDs
  - Parallel containers (`parallel_for_${joinId}`) are only referenced during cleanup when removing converge nodes
  - Branch activities remain in the main activities array during editing

### Edge Synchronization

File: `useEdgeSynchronization.ts`

Every time edges change:

```typescript
// 1. Sync converge node branches (parallel wrappers)
useWorkflowStore.getState().syncConvergeNodeBranches()

// 2. Reorder activities based on edge topology
useWorkflowStore.getState().reorderActivitiesFromEdges()
```

#### `syncConvergeNodeBranches()`

- Finds all join/converge nodes
- Looks at incoming edges
- Updates each converge node's `branches` array with source activity IDs from incoming edges
- Does NOT create parallel containers - branch activities remain in main activities array

#### `reorderActivitiesFromEdges()`

- Builds graph from edges
- Performs topological sort
- Reorders top-level activities
- **Filters out structural edges**:
  - `sourceHandle: 'loop'` (loop body edges)
  - `sourceHandle: 'true'/'false'` (condition branches)
  - `targetHandle: 'end'` (loop-back edges)

## Saving Process (Builder → API)

When saving, the flat structure with edges is converted back to nested format.

### File: `buildNestedStructure.ts`

The save process only nests **condition nodes**. Other structures remain flat with edges.

```typescript
export function buildNestedConditionStructure(activities: Activity[], edges: EdgeConnection[]): Activity[] {
  // For each condition node:
  // 1. Find edges from 'true' handle
  // 2. Recursively collect downstream activities → then array
  // 3. Find edges from 'false' handle
  // 4. Recursively collect downstream activities → else array
  // 5. Handle parallel_for_* wrappers (include wrapper, not branches)
}
```

### Condition Node Nesting Algorithm

```typescript
// Start with flat condition + edges:
activities: [
  { id: 'cond-1', type: 'condition', then: [], else: [] },
  { id: 'task-1', type: 'task' },
  { id: 'task-2', type: 'task' }
]
edges: [
  { source: 'cond-1', target: 'task-1', sourceHandle: 'true' },
  { source: 'cond-1', target: 'task-2', sourceHandle: 'false' }
]

// Algorithm:
1. Find true edge: cond-1 --true--> task-1
2. Collect downstream from task-1 → [task-1]
3. Find false edge: cond-1 --false--> task-2
4. Collect downstream from task-2 → [task-2]

// Result - nested:
{
  id: 'cond-1',
  type: 'condition',
  then: [{ id: 'task-1', type: 'task' }],
  else: [{ id: 'task-2', type: 'task' }]
}
```

### Parallel Wrapper Handling

If an activity inside a parallel wrapper is collected:

```typescript
// If task-1 is wrapped in parallel_for_join-1:
if (activityToParentParallelMap.has('task-1')) {
  // Include the wrapper, not the individual branch
  then.push(parallelWrapper)
} else {
  then.push(task1)
}
```

### What Gets Saved (Lossy Transformation)

| Structure     | Editing (Flat)       | Save (Nested)             | Note                                 |
| ------------- | -------------------- | ------------------------- | ------------------------------------ |
| **Condition** | Flat with edges      | Nested `then`/`else`      | ✅ Fully preserved                   |
| **Loop**      | Flat with empty `do` | Flat with edges           | ⚠️ Lossy - `do` array not rebuilt    |
| **Parallel**  | Flat with join nodes | `parallel_for_*` wrappers | ⚠️ Lossy - becomes flat after reload |
| **Sequence**  | Flat with edges      | Flat with edges           | ⚠️ Lossy - not nested                |

**Note**: The lossy transformation is acceptable because:

- The **semantic meaning** (execution order) is preserved via edges
- The graph visualization is more important than the API structure
- Future save operations can improve nesting if needed

## Special Handle Types

### Condition Node Handles

- `sourceHandle: 'true'` - True branch connection
- `sourceHandle: 'false'` - False branch connection

### Loop Node Handles

- `sourceHandle: 'loop'` - Enters loop body (restricted to ONE connection)
- `sourceHandle: 'done'` - Exits loop after completion (unlimited connections)
- `targetHandle: 'end'` - Loop-back edge (returns to loop start)

### Standard Handles

- `sourceHandle: 'source'` - Default outgoing connection
- `targetHandle: 'target'` - Default incoming connection

## Edge Validation

File: `validateConnection.ts`

### Loop Handle Restriction

Only **one edge** can go out from the `loop` handle:

```typescript
if (connection.sourceHandle === 'loop' && existingEdges) {
  const hasExistingLoopEdge = existingEdges.some(
    (edge) =>
      edge.source === connection.source &&
      edge.sourceHandle === 'loop' &&
      edge.type !== 'buttonEdge' &&
      !edge.id.startsWith('button-')
  )
  if (hasExistingLoopEdge) return false // Prevent second connection
}
```

This ensures only one path enters the loop body.

### Enforcement

The restriction is enforced in two places:

1. **`validateConnection()`** - Prevents edge creation in ReactFlow
2. **`onConnectStart()` in BuilderFlow** - Prevents drag start if handle already connected

```typescript
// BuilderFlow.tsx - onConnectStart
if (handleId === 'loop') {
  const hasExistingLoopConnection = edges.some(
    (edge) => edge.source === params.nodeId && edge.sourceHandle === 'loop' && edge.type !== 'buttonEdge'
  )
  if (hasExistingLoopConnection) {
    return // Don't start drag
  }
}
```

## Key Files

| File                        | Purpose                                     |
| --------------------------- | ------------------------------------------- |
| `loadWorkflow.ts`           | Entry point for loading workflows from API  |
| `workflowTransform.ts`      | Bidirectional transformation (flatten/nest) |
| `buildNestedStructure.ts`   | Nests condition nodes for save              |
| `useEdgeSynchronization.ts` | Syncs edges with workflow store             |
| `useWorkflowStore.ts`       | Central state management                    |
| `validateConnection.ts`     | Edge validation rules                       |
| `BuilderFlow.tsx`           | ReactFlow integration and edge handling     |

## Common Patterns

### Detecting Loop Body Activities

Activities in a loop body are identified by:

1. Edge from loop node with `sourceHandle: 'loop'`
2. Transitive closure following `sourceHandle: 'source'` edges
3. Until edge with `targetHandle: 'end'` back to loop

### Detecting Condition Branches

Activities in condition branches are identified by:

1. Edge from condition with `sourceHandle: 'true'` or `'false'`
2. Transitive closure following sequential edges
3. Until reaching another structural node or end

### Detecting Parallel Branches

Activities in parallel execution are identified by:

1. Multiple edges targeting same join/converge node
2. Listed in the converge node's `branches` array
3. Managed by `syncConvergeNodeBranches()` which updates branches from incoming edges

## Troubleshooting

### Issue: Loop body not populated after save/load

**Cause**: Loop bodies are not re-nested during save
**Solution**: This is expected - loop structure is preserved via edges only

### Issue: Activities appear in wrong order

**Cause**: `reorderActivitiesFromEdges()` uses topological sort
**Solution**: Check edge topology - activities follow edge order

### Issue: Multiple edges from loop handle

**Cause**: Validation not enforced or bypassed
**Solution**: Check `validateConnection()` and `onConnectStart()` are both working

### Issue: Nested condition structure lost after edit

**Cause**: Conditions flattened during load, need manual save
**Solution**: This is expected - save to re-nest conditions

### Issue: Missing edge from condition branch to converge node (FIXED - Dec 2025)

**Cause**: When a parallel branch contains a condition node (e.g., `parallel → [A, B, condition(C)] → J`), the edge from C to J was not being created during flattening. This happened because `getLastActivityId()` only handled sequence nodes, not condition nodes.

**Example**:

- Workflow: `parallel(sequence(A, L, E), B, condition(then: C)) → J`
- J's converge branches: `[E, B, C]`
- Expected edges: E→J, B→J, C→J
- Bug: Only E→J and B→J were created, C→J was missing

**Root Cause**: When processing the parallel's third branch (the condition node), `getLastActivityId(condition)` returned the condition's ID instead of drilling down to find C. This caused the converge check `convergeBranchSet.has(conditionId)` to fail.

**Solution**: Extended `getLastActivityId()` to `getAllLastActivityIds()` which recursively traverses condition nodes and returns ALL possible endpoints (from both then and else branches):

```typescript
private static getAllLastActivityIds(activity: Activity): string[] {
  if (activity.type === 'condition') {
    const thenActivities = activity.then || []
    const elseActivities = activity.else || []
    const lastIds: string[] = []

    if (thenActivities.length > 0) {
      lastIds.push(...this.getAllLastActivityIds(thenActivities[thenActivities.length - 1]))
    }

    if (elseActivities.length > 0) {
      lastIds.push(...this.getAllLastActivityIds(elseActivities[elseActivities.length - 1]))
    }

    return lastIds.length > 0 ? lastIds : [activity.id]
  }

  // Handle sequences recursively
  if (activity.type === 'sequence') {
    const sequence = activity as Extract<Activity, { type: 'sequence' }>
    if (sequence.activities && sequence.activities.length > 0) {
      const lastActivity = sequence.activities[sequence.activities.length - 1]
      return this.getAllLastActivityIds(lastActivity)
    }
  }

  return [activity.id]
}
```

Now `getAllLastActivityIds(condition(C))` correctly returns C's ID (and any other branch endpoints), allowing the edges to converge nodes to be created correctly.

### Issue: Duplicate converge node error with partial convergence (FIXED - Dec 2025)

**Cause**: When parallel branches diverge from an external source (like a trigger) with partial convergence (only some branches converge at a join node), the converge node was being duplicated in the branch sequences during nesting. For example:

- Workflow: trigger → (A→L→E || B || C) where only E and B converge at J
- After deleting C→J edge, J would appear in both sequence(A,L,E,J) and sequence(B,J)

**Root Cause**: `findParallelFromExternalSource` was using `findConvergencePoint` which returns `null` for partial convergence (not ALL branches converge). Without a convergence point, it used `collectAllDownstream` which included the converge node in each branch's activities.

**Solution**: Fixed in `workflowTransform.ts` with multiple improvements:

1. **Enhanced converge node detection using `findPartialConvergeNode()`**: When `findConvergencePoint` returns `null`, check for converge nodes that list at least 2 of the divergence targets in their `converge.branches` array. This supports partial convergence.

2. **Prevent duplicate collection in `collectSequentialActivities()`**:
   - When collecting activities sequentially, check if converge nodes have incoming edges from unvisited sources and skip them if so
   - Uses a `visited` set to track which activities have already been processed
   - This ensures converge nodes are collected only once

3. **Mark branch activities as visited in `collectBranchActivities()`**:
   - When collecting activities after a parallel container, mark all branch activities as visited before collecting downstream activities
   - This prevents converge nodes from being duplicated when processing subsequent branches

4. **Distinguish structural nodes**: Only return converge nodes for truly external sources (triggers). For condition/loop nodes detected by structural handles (true/false/loop), let `findBranchActivities` collect the converge node into the branch.

**Example scenario**:

- Parallel with 3 branches from trigger: (A→L→E), B, and C
- E and B converge at J (partial convergence - J has `converge.branches: [E, B]`)
- C does not converge at J (edge was deleted)
- **Before fix**: J appeared in both sequence(A,L,E,J) and sequence(B,J) → duplicate error
- **After fix**: J collected only once and placed after the parallel container in top-level result

### Issue: Converge node ordering and backend reordering (FIXED - Dec 2025)

**Cause**: The backend may return activities in unexpected orders, such as `[C(nested activities), M, J(converge)]` where the converge node appears last but M should actually come after J in the workflow.

**Example**:

- Backend returns: `[C(containing A, L, E nested), M, J(converge)]`
- J's converge branches: `[E, B]` (E is nested inside C)
- Expected flow: C (with A→L→E) → J → M
- Bug: Without special handling, M might be connected incorrectly

**Solution**: Three-pass flatten algorithm handles this:

1. **First Pass - Converge to Next Activity**: Determines what comes after each converge node
   - If converge is NOT last in array → connect to next activity
   - If converge IS last in array → look backward for an activity NOT in the converge's branches
   - Example: For `[C, M, J]`, recognizes M is not in J's branches, so J → M edge is correct

2. **Second Pass - Sequential Edges**: Skips creating edges FROM or TO converge nodes (handled separately)

3. **Third Pass - Branches to Converge**: Creates edges from branch activities to converge nodes
   - Searches ALL flattened activities to find branch activities (even if nested in C)
   - Creates edges like E→J and B→J even though E is nested inside C and J is last in array

**Benefits**:

- Handles any backend activity ordering
- Correctly connects nested branch activities to converge nodes
- Preserves intended workflow semantics regardless of API structure

## Future Improvements

1. **Nest loop bodies during save** - Currently lossy, could rebuild `do` arrays from edges
2. **Nest sequence structures** - Could detect sequential chains and wrap in `sequence`
3. **Preserve parallel structures** - Could maintain parallel nesting instead of flattening
4. **Round-trip validation** - Ensure load→edit→save produces identical structure
5. **Edge order preservation** - Maintain original order when possible
