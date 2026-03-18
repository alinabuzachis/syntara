# Execution State Enrichment System

This directory contains the execution state inference system for the workflow builder. It enriches workflow activities and edges with execution state information for visualization in the execution view.

## Architecture Overview

The system uses two design patterns:

1. **Strategy Pattern**: Different node types (loop, converge, conditional, approval) have specialized state inferrers
2. **Orchestrator Pattern**: The `ExecutionStateEnricher` class coordinates all inferrers and provides a unified API

## File Structure

```text
executionState/
├── README.md                    # This file
├── index.ts                     # Public API exports
├── ExecutionStateEnricher.ts    # Main orchestrator class
├── edgeHelpers.ts               # Shared edge utilities
├── traversal.ts                 # Workflow graph traversal logic
├── nodeStateInference.ts        # Node-specific state inferrers
└── __tests__/                   # Comprehensive test suite
    ├── ExecutionStateEnricher.test.ts
    ├── edgeHelpers.test.ts
    ├── traversal.test.ts
    ├── LoopNodeStateInferrer.test.ts
    ├── ConvergeNodeStateInferrer.test.ts
    └── ConditionalNodeStateInferrer.test.ts
```

## Core Components

### ExecutionStateEnricher (Orchestrator)

The main entry point for all execution state operations. Create a singleton instance and use it to enrich activities and determine edge statuses.

```typescript
import { ExecutionStateEnricher } from './utils/executionState'

// Create singleton instance
const enricher = new ExecutionStateEnricher()

// Enrich an activity with execution state
const enrichedActivity = enricher.enrichActivity(activity, executionStatus, activityStates, edges)

// Determine edge execution status
const edgeStatus = enricher.determineEdgeStatus(
  { source: 'task-1', target: 'task-2', sourceHandle: 'source' },
  activityStates
)
```

**Methods:**

- `enrichActivity<T>(activity, executionStatus, activityStates, edges): ActivityWithMetadata<T>`
  - Adds execution badge metadata
  - Adds backend state if available
  - Infers state for structural nodes (loop, converge, conditional)
  - Marks nodes as skipped when on non-taken branches
  - Sets default pending state for structural nodes

- `determineEdgeStatus(edge, activityStates): 'passed' | 'pending'`
  - For branching edges: checks if target has started (indicates branch was taken)
  - For trigger and converge outgoing edges: checks if target has started
  - For regular edges: checks if source reached a terminal status

### Node State Inferrers (Strategy Pattern)

Each structural node type has a dedicated inferrer implementing the `NodeStateInferrer` interface:

#### LoopNodeStateInferrer

Infers execution state for loop nodes based on their outgoing edges:

- **Completed**: Done edge target has started execution
- **Running**: Loop body edge target has started execution
- **Null**: Cannot infer (defaults to pending or skipped)

#### ConvergeNodeStateInferrer

Infers execution state for converge nodes based on incoming nodes:

- **Running**: At least one incoming node is completed or failed
- **Completed**: All incoming nodes are completed/failed OR any outgoing node has started
- **Null**: All incoming nodes are pending

#### ConditionalNodeStateInferrer

Infers execution state for conditional and approval nodes based on branch targets:

- **Completed**: Any branch target (true/false or approved/rejected) has started
- **Null**: No branch has been taken yet

Used for both `condition` and `approval` node types.

### Edge Helpers

Utility functions for working with edges:

```typescript
import { EdgeHelpers } from './edgeHelpers'

// Find edges from a specific handle
const doneEdges = EdgeHelpers.findEdgesBySourceHandle('loop-1', edges, 'done')

// Check if edge target has started
const hasStarted = EdgeHelpers.hasTargetStarted(edge, activityStates)

// Get all incoming/outgoing edges
const incoming = EdgeHelpers.getIncomingEdges('task-1', edges)
const outgoing = EdgeHelpers.getOutgoingEdges('task-1', edges)
```

### Workflow Traversal

Graph traversal utilities for detecting skipped nodes and downstream state:

```typescript
import { WorkflowTraversal } from './traversal'

// Check if any downstream nodes are pending/running
const hasPending = WorkflowTraversal.hasDownstreamPendingNodes('loop-1', activityStates, edges)

// Check if node should be marked as skipped
const isSkipped = WorkflowTraversal.shouldMarkAsSkipped('task-false', activityStates, edges)
```

## Execution State Inference Algorithm

The enrichment algorithm follows these steps:

1. **Direct Backend State**: If the activity has state from the backend, use it directly
2. **Structural Node Inference**: For loop/converge/conditional nodes, use the appropriate inferrer
3. **Skip Detection**: If node is on a non-taken branch or unreachable, mark as skipped
4. **Default Pending**: Structural nodes with no other state default to pending

## Edge Status Determination

Edges can be in two states:

- **Passed** (solid line): Execution has traversed this path
- **Pending** (dashed line): Execution hasn't reached this yet

### Branching Edges

For edges with branch handles (`true`, `false`, `approved`, `rejected`, `done`, `loop`):

- Status determined by checking if **target** node has started
- This indicates which branch was actually taken during execution

### Regular Edges

For normal edges without special handles:

- Status determined by checking if **source** node has reached a terminal status (completed, failed, or cancelled)

### Trigger Edges

Edges from trigger nodes (`trigger-0`, `trigger-1`, etc.):

- Marked as `passed` only after the target node has started

## Adding a New Node Type

To add execution state inference for a new node type:

1. **Create an Inferrer**: Implement `NodeStateInferrer` interface in `nodeStateInference.ts`

   ```typescript
   export class MyNewNodeStateInferrer implements NodeStateInferrer {
     inferState(
       activity: Activity,
       edges: EdgeConnection[],
       activityStates: Map<string, ActivityState>
     ): ExecutionState | null {
       // Your inference logic here
       return null
     }
   }
   ```

2. **Register in Orchestrator**: Add to `ExecutionStateEnricher` constructor

   ```typescript
   constructor() {
     this.nodeInferrers = new Map([
       ['loop', new LoopNodeStateInferrer()],
       ['converge', new ConvergeNodeStateInferrer()],
       ['condition', new ConditionalNodeStateInferrer()],
       ['approval', new ConditionalNodeStateInferrer()],
       ['mynewnode', new MyNewNodeStateInferrer()], // Add your inferrer
     ])
   }
   ```

3. **Write Tests**: Create `MyNewNodeStateInferrer.test.ts` in `__tests__/`

## Design Decisions

### Why Strategy Pattern?

- **Isolated Logic**: Each node type's inference logic is self-contained and testable
- **Easy Extension**: Adding new node types doesn't require modifying existing code
- **Clear Responsibilities**: Each inferrer has a single, well-defined purpose

### Why Orchestrator Pattern?

- **Unified API**: BuilderFlow only interacts with one class (`ExecutionStateEnricher`)
- **Encapsulation**: All execution state logic is separated from the UI component
- **Testability**: The orchestrator can be tested independently from React components

### Why Singleton Instance?

- **Performance**: Avoids creating new inferrer instances on every enrichment call
- **Stateless**: Inferrers have no state, so a single instance is safe to reuse
- **Memory Efficiency**: Reduced object allocation during rendering

## Testing

All components have comprehensive test coverage (71 tests total):

- **ExecutionStateEnricher**: 18 tests
- **edgeHelpers**: 18 tests
- **traversal**: 17 tests
- **LoopNodeStateInferrer**: 6 tests
- **ConvergeNodeStateInferrer**: 7 tests
- **ConditionalNodeStateInferrer**: 7 tests

Run tests:

```bash
npm --workspace=@ansible/nexus-ui run vitest -- executionState
```

## Performance Considerations

- **Memoization**: Traversal functions use visited sets to avoid redundant graph walks
- **Early Returns**: Inferrers return as soon as state is determined
- **Minimal Re-renders**: Only creates new objects when state actually changes

## Common Scenarios

### Scenario 1: Loop Execution

```text
Loop → [loop] → Body Task → [loop-back] → Loop → [done] → Done Task
```

1. Loop starts pending
2. Body task starts → Loop becomes "running"
3. Body task completes, loops back
4. Done task starts → Loop becomes "completed"

### Scenario 2: Conditional Branch

```text
Condition → [true] → Task True
         → [false] → Task False
```

1. Condition starts pending
2. Task True starts → Condition becomes "completed", true edge "passed"
3. Task False never starts → Marked as "skipped", false edge remains "pending"

### Scenario 3: Converge

```text
Task A ↘
Task B → Converge → Task Next
Task C ↗
```

1. Converge starts pending
2. Task A completes → Converge becomes "running"
3. Tasks B and C complete → Converge becomes "completed"
4. OR: Task Next starts → Converge immediately becomes "completed"

## Related Documentation

- [Main Architecture Guide](../../../../../../../docs/architecture.md)
- [Workflow Builder Internals](../../../../../../../docs/architecture.md#builder-internals-advanced)
- [Execution Visualizer Protocol](../../../../../../../docs/execution-visualizer-protocol.md)
