# Data Flow: From OpenAPI to Canvas Steps

> **Reading time**: ~15 minutes
> **Audience**: Developers working on the workflow builder or API integration

This document explains **how data flows from the backend API to the UI**, focusing on OpenAPI contract generation, type-safe API calls, and the transformation of backend workflow structures into **canvas steps** (each rendered as a React Flow **node** in code).

---

## Table of Contents

1. [Overview](#overview)
2. [OpenAPI Contract Generation](#openapi-contract-generation)
3. [Type-Safe API Clients](#type-safe-api-clients)
4. [Data Flow: Backend to UI](#data-flow-backend-to-ui)
5. [Workflow Transformation: Nested to Flat](#workflow-transformation-nested-to-flat)
6. [Canvas Rendering](#canvas-rendering)
7. [Saving: Flat to Nested](#saving-flat-to-nested)

---

## Overview

The Nexus UI follows a **type-driven architecture** where TypeScript types are automatically generated from the backend's OpenAPI specification. This ensures type safety from the API all the way to the UI components.

```mermaid
flowchart TB
    subgraph Backend["Backend Repository"]
        Y[OpenAPI YAML Specs]
    end

    subgraph Contracts["nexus-contracts Package"]
        G[npm run gen]
        TS[TypeScript Types]
    end

    subgraph UI["nexus-ui Package"]
        C[API Clients<br/>client.tsx]
        Q[TanStack Query Hooks]
        S[Zustand Store]
        R[React Components]
    end

    Y -->|"Clone & Extract"| G
    G -->|"openapi-typescript"| TS
    TS --> C
    C --> Q
    Q --> S
    S --> R
```

---

## OpenAPI Contract Generation

### The Generation Process

Types are generated from OpenAPI specs in the backend repository:

```mermaid
flowchart LR
    subgraph Backend["syntara-orchestration/syntara repo"]
        W[workflows/openapi.yaml]
        TM[tool_manager/openapi.yaml]
        F[files/openapi.yaml]
        A[approvals/openapi.yaml]
        E[workflows/executions_openapi.yaml]
    end

    subgraph Gen["Generation Process"]
        Clone[git clone nexus]
        OT["openapi-typescript"]
    end

    subgraph Output["Generated Types"]
        WT[workflow-api.ts]
        TMT[tool-manager.ts]
        FT[files-api.ts]
        AT[approvals-api.ts]
        ET[executions-api.ts]
    end

    W --> Clone
    TM --> Clone
    F --> Clone
    A --> Clone
    E --> Clone
    Clone --> OT
    OT --> WT
    OT --> TMT
    OT --> FT
    OT --> AT
    OT --> ET
```

### How to Regenerate Types

When the backend API changes:

```bash
# From the repository root
npm run gen
```

**What happens:**

1. **Clone backend repo** - Downloads latest OpenAPI specs from `syntara-orchestration/syntara`
2. **Generate types** - Runs `openapi-typescript` on each YAML spec
3. **Create TypeScript files** - Outputs type definitions to `packages/nexus-contracts/src/`
4. **Copy examples** - Copies workflow examples for the mock API
5. **Clean up** - Removes cloned repository
6. **Format** - Runs prettier on generated files

### Location of Files

```text
packages/nexus-contracts/
├── package.json           # Generation scripts
└── src/
    ├── workflow-api.ts    # Generated workflow types
    ├── tool-manager.ts    # Generated tool manager types (unified tools & providers)
    ├── files-api.ts       # Generated files API types
    ├── approvals-api.ts   # Generated approvals types
    ├── interfaces.ts      # Shared interfaces and enum constants
    └── index.ts           # Exports all types
```

---

## Type-Safe API Clients

### Client Creation

The UI creates API clients using the generated types:

```typescript
// packages/nexus-ui/src/client.tsx

import type { ApprovalsAPI, ExecutionsAPI, ToolManagerAPI, WorkflowAPI } from '@ansible/nexus-contracts'
import createFetchClient from 'openapi-fetch'
import createClient from 'openapi-react-query'

// Workflow API client
const workflowFetchClient = createFetchClient<WorkflowAPI.paths>({
  baseUrl: '/api/v1/',
})
export const workflowClient = createClient(workflowFetchClient)

// Executions API client
const executionsFetchClient = createFetchClient<ExecutionsAPI.paths>({
  baseUrl: '/api/v1/',
})
export const executionsClient = createClient(executionsFetchClient)

// Tool Manager API client (unified tools & providers)
const toolManagerFetchClient = createFetchClient<ToolManagerAPI.paths>({
  baseUrl: '/api/v1/tool_manager/',
})
export const toolManagerClient = createClient(toolManagerFetchClient)

// Approvals API client
const approvalsFetchClient = createFetchClient<ApprovalsAPI.paths>({
  baseUrl: '/api/v1/',
})
export const approvalsClient = createClient(approvalsFetchClient)
```

> **Note:** File uploads use a direct fetch call via the `useFileUploadWithProgress` hook (not a generated client), since `openapi-react-query` doesn't support upload progress tracking.

### Type Safety Benefits

```mermaid
flowchart TB
    subgraph API["OpenAPI Spec"]
        E1["GET /workflows/{workflow_id}"]
        E2["POST /workflows"]
        E3["PATCH /workflows/{workflow_id}"]
    end

    subgraph Gen["Generated Types"]
        P1[WorkflowAPI.paths]
        P2["components.schemas.WorkflowDefinition"]
        P3["parameters.path.workflow_id"]
    end

    subgraph Code["TypeScript Code"]
        C1["workflowClient.useQuery('get', '/workflows/{workflow_id}', ...)"]
        C2["workflowClient.useMutation('post', '/workflows')"]
        C3["workflowClient.useMutation('patch', '/workflows/{workflow_id}')"]
    end

    E1 --> P1
    E2 --> P1
    E3 --> P1
    P1 --> C1
    P1 --> C2
    P1 --> C3

    style C1 fill:#c8e6c9
    style C2 fill:#c8e6c9
    style C3 fill:#c8e6c9
```

**TypeScript will catch errors if:**

- Wrong HTTP method used
- Incorrect endpoint path
- Missing required parameters
- Wrong request body structure
- Invalid response handling

---

## Data Flow: Backend to UI

### Complete Flow Diagram

```mermaid
sequenceDiagram
    participant C as React Component
    participant Q as TanStack Query
    participant F as Fetch Client
    participant P as Vite Proxy
    participant B as Backend API
    participant Z as Zustand Store
    participant R as React Flow Canvas

    C->>Q: workflowClient.useQuery('get', '/workflows/{workflow_id}')
    Q->>Q: Check cache

    alt Cache HIT
        Q-->>C: Return cached data
    else Cache MISS
        Q->>F: Fetch request
        F->>P: HTTP GET /api/v1/workflows/{workflow_id}
        P->>B: Forward request
        B-->>P: WorkflowDefinition (nested)
        P-->>F: Response
        F-->>Q: Typed response
        Q->>Q: Cache response
        Q-->>C: Return data
    end

    C->>C: loadWorkflow(workflow)
    C->>Z: WorkflowTransform.flatten(workflow)
    Z->>Z: Store flat activities + edges
    Z-->>R: Notify subscribers
    R->>R: Render nodes from store
```

### Request Example

```typescript
// In a React component
function BuilderEdit() {
  const { workflowId } = useParams()

  // Type-safe query with auto-complete
  const {
    data: workflow,
    isLoading,
    error,
  } = workflowClient.useQuery('get', '/workflows/{workflow_id}', {
    params: {
      path: { workflow_id: workflowId },
    },
  })

  // workflow is fully typed as WorkflowDefinition
  if (workflow) {
    // Load into store with transformation
    loadWorkflow(workflow)
  }
}
```

### Mutation Example

```typescript
// Saving a workflow
function handleSave() {
  // Note: Uses PATCH, not PUT
  const mutation = workflowClient.useMutation('patch', '/workflows/{workflow_id}')

  const workflow = useWorkflowStore.getState().currentWorkflow
  const edges = useWorkflowStore.getState().edges

  // Convert flat → nested using the wrapper function
  const nestedActivities = buildNestedConditionStructure(workflow.activities, edges)

  mutation.mutate({
    params: {
      path: { workflow_id: workflow.id },
    },
    body: {
      ...workflow,
      activities: nestedActivities,
    },
  })
}
```

**Note:** The actual implementation uses `buildNestedConditionStructure()` as a thin wrapper around `WorkflowTransform.nest()`. Validation happens before that call in `BuilderContent`.

---

## Workflow Transformation: Nested to Flat

### Why Transform?

**Backend format (nested):**

```typescript
{
  activities: [
    {
      id: 'condition1',
      type: 'condition',
      condition: {
        then: [
          { id: 'task1', type: 'task' },
          { id: 'task2', type: 'task' },
        ],
        else: [{ id: 'task3', type: 'task' }],
      },
    },
  ]
}
```

**Builder format (flat):**

```typescript
{
  activities: [
    { id: "condition1", type: "condition", condition: { then: [], else: [] } },
    { id: "task1", type: "task" },
    { id: "task2", type: "task" },
    { id: "task3", type: "task" }
  ],
  edges: [
    { source: "condition1", target: "task1", sourceHandle: "true" },
    { source: "task1", target: "task2" },
    { source: "condition1", target: "task3", sourceHandle: "false" }
  ]
}
```

**Why flat?** Visual editors work better with a flat list of graph vertices (React Flow `nodes[]`) plus explicit edges.

### Transformation Flow

```mermaid
flowchart TB
    subgraph Load["Loading Workflow"]
        API1[Backend API<br/>Nested Structure]
        Flat1[WorkflowTransform.flatten]
        Store1[Zustand Store<br/>Flat Structure]

        API1 --> Flat1
        Flat1 --> Store1
    end

    subgraph Edit["Editing"]
        Store2[User edits via canvas]
        Edge[Edge changes]
        Graph[Canvas graph changes]

        Store2 --> Edge
        Store2 --> Graph
    end

    subgraph Save["Saving Workflow"]
        Store3[Zustand Store<br/>Flat Structure]
        Nest[WorkflowTransform.nest]
        API2[Backend API<br/>Nested Structure]

        Store3 --> Nest
        Nest --> API2
    end

    Store1 --> Store2
    Edge --> Store3
    Graph --> Store3
```

### Flatten Operation

Located in `packages/nexus-ui/src/routes/builder/utils/workflowTransform.ts`:

> ⚠️ **Complexity Note**: The actual `flatten()` implementation is significantly more sophisticated than the simplified example below. The production code (~550 lines across `flatten()` and its private helpers) includes:
>
> - Three-pass algorithm for converge (join) step handling
> - Support for partial convergence (not all parallel branches converge)
> - Backend activity reordering detection
> - Nested branch activity edge creation
> - Complex edge tracking for loops, conditions, and approvals
>
> The example below shows the conceptual approach. See [`workflow-loading-saving.md`](./workflow-loading-saving.md) for detailed converge / join handling (`converge` activities and edges).

```typescript
/**
 * Converts nested workflow structure to flat representation.
 *
 * This operation:
 * 1. Extracts all activities from nested structures (condition.then/else, parallel.branches)
 * 2. Generates edges representing the nesting relationships
 * 3. Returns completely flat structure suitable for editing
 */
static flatten(nestedActivities: Activity[]): FlatWorkflow {
  const activities: Activity[] = []
  const edges: EdgeConnection[] = []

  // Process each activity
  for (const activity of nestedActivities) {
    if (activity.type === 'condition') {
      // Add condition with empty then/else
      activities.push({
        ...activity,
        condition: { ...activity.condition, then: [], else: [] }
      })

      // Create edges for true branch
      activity.condition.then.forEach((child, index) => {
        if (index === 0) {
          edges.push({
            source: activity.id,
            target: child.id,
            sourceHandle: 'true'
          })
        }
        // Recursively flatten children
        const childFlat = flatten([child])
        activities.push(...childFlat.activities)
        edges.push(...childFlat.edges)
      })

      // Create edges for false branch
      // ... similar logic
    }
    // Handle parallel, loop, etc.
  }

  return { activities, edges }
}
```

### Key Transformations

```mermaid
flowchart TB
    subgraph Nested["Nested: Condition"]
        NC["Condition<br/>then: A, B<br/>else: C"]
    end

    subgraph Flat["Flat: Condition"]
        FC["Condition<br/>then: empty<br/>else: empty"]
        FA[Task A]
        FB[Task B]
        FCC[Task C]

        FC -->|"sourceHandle='true'"| FA
        FA --> FB
        FC -->|"sourceHandle='false'"| FCC
    end

    Nested -->|"flatten()"| Flat
```

```mermaid
flowchart TB
    subgraph Nested2["Nested: Parallel"]
        NP["Parallel<br/>branches: A, B, C"]
    end

    subgraph Flat2["Flat: Parallel"]
        FD[Diverge Node]
        FP1[Task A]
        FP2[Task B]
        FP3[Task C]
        FJ["Converge/Join Node<br/>branches: A, B, C"]

        FD --> FP1 & FP2 & FP3
        FP1 & FP2 & FP3 --> FJ
    end

    Nested2 -->|"flatten()"| Flat2
```

---

## Canvas Rendering

### From Store to React Flow

Once the workflow is in the Zustand store, `BuilderFlow` converts it to React Flow format:

```mermaid
flowchart LR
    subgraph Store["Zustand Store"]
        A["activities: Activity[ ]"]
        E["edges: EdgeConnection[ ]"]
    end

    subgraph BuilderFlow["BuilderFlow Component"]
        T[Transform to React Flow format]
        L[Apply Dagre layout]
    end

    subgraph ReactFlow["React Flow Canvas"]
        N["nodes: Node[ ]"]
        RE["edges: Edge[ ]"]
    end

    A --> T
    E --> T
    T --> L
    L --> N
    L --> RE
```

### Activity type → React Flow component mapping

```typescript
// Each activity type maps to a React Flow node `type` string + component
const nodeTypes = {
  task: TaskNode,
  condition: ConditionNode,
  loop: LoopNode,
  converge: ConvergeNode,
  parallel: ParallelNode,
  // ... etc
}

// BuilderFlow creates React Flow nodes
const nodes = activities.map((activity) => ({
  id: activity.id,
  type: activity.type,
  data: activity,
  position: { x: 0, y: 0 }, // Set by Dagre layout
}))
```

### Layout with Dagre

```mermaid
flowchart TB
    subgraph Input["Input"]
        N["Nodes<br/>unmeasured"]
        E[Edges]
    end

    subgraph Dagre["Dagre Algorithm"]
        G[Create directed graph]
        M[Add steps with measurements]
        AE[Add edges]
        L[Calculate layout]
    end

    subgraph Output["Output"]
        P["Positioned nodes<br/>x, y coordinates"]
    end

    N --> G
    E --> G
    G --> M
    M --> AE
    AE --> L
    L --> P
```

Special handling:

- **Loop steps**: Body positioned to the right (not below) to avoid circular layout
- **Button edges**: Inserted between canvas steps (React Flow nodes) as "add a step here" affordances

---

## Saving: Flat to Nested

### Nest Operation

When saving, the flat structure is converted back to nested. The implementation uses a wrapper function:

```typescript
// packages/nexus-ui/src/routes/builder/utils/buildNestedStructure.ts

/**
 * Wrapper function for converting flat → nested.
 * This is the actual function called during save.
 */
export function buildNestedConditionStructure(
  activities: Activity[],
  edges: EdgeConnection[]
): Activity[] {
  return WorkflowTransform.nest(activities, edges)
}

/**
 * WorkflowTransform.nest() - Core transformation logic
 *
 * IMPORTANT: This is a 4-step hierarchical nesting process!
 *
 * The nest() operation processes structural activities (condition, loop, converge, etc.) in this specific order:
 * Step 1: PARALLEL - Find and wrap outermost parallel groups recursively (lines 349-356)
 * Step 2: LOOP - Nest loops, which can contain conditions and approvals (lines 360, 614-664)
 * Step 3: APPROVAL - Nest approvals, which can contain conditions (lines 363, 718-805)
 * Step 4: CONDITION - Finally nest conditions (lines 368, 810-925)
 *
 * This order is critical because:
 * - Parallel groups must be identified first (they can contain any other structure)
 * - Loops are nested before approvals/conditions (a loop can contain them)
 * - Approvals are nested before conditions (an approval can contain conditions)
 * - Conditions are nested last (they're the innermost structures)
 *
 * Each step modifies the activities array and recursively processes nested structures.
 *
 * See workflowTransform.ts for the full ~600 line implementation with support for
 * partial convergence, recursive nesting, and complex edge tracking.
 */
static nest(flatActivities: Activity[], edges: EdgeConnection[]): Activity[] {
  // Simplified example of Step 4 (condition nesting):
  const nested: Activity[] = []

  for (const activity of flatActivities) {
    if (activity.type === 'condition') {
      // Find edges from true/false handles
      const trueEdges = edges.filter(e =>
        e.source === activity.id && e.sourceHandle === 'true'
      )
      const falseEdges = edges.filter(e =>
        e.source === activity.id && e.sourceHandle === 'false'
      )

      // Collect all activities in each branch
      const thenActivities = collectDownstream(trueEdges, edges, flatActivities)
      const elseActivities = collectDownstream(falseEdges, edges, flatActivities)

      // Reconstruct nested condition
      nested.push({
        ...activity,
        condition: {
          ...activity.condition,
          then: thenActivities,
          else: elseActivities
        }
      })
    }
    // Steps 1-3 handle parallel, loop, and approval nesting...
  }

  return nested
}
```

### Save Flow

```mermaid
sequenceDiagram
    participant U as User
    participant C as BuilderContent
    participant S as Zustand Store
    participant V as Validation
    participant T as buildNestedConditionStructure
    participant M as Mutation
    participant Q as QueryClient
    participant B as Backend

    U->>C: Click Save
    C->>S: Get current state
    S-->>C: { activities, edges }
    C->>V: validateSavePath() + validateWorkflow()

    alt Invalid
        V-->>C: Validation errors
        C-->>U: Show errors in toast
    else Valid
        V-->>C: OK
        C->>T: buildNestedConditionStructure(activities, edges)
        T-->>C: Nested activities
        C->>C: getWorkflowDefinition() - merge metadata
        C->>M: mutation.mutate(payload)
        M->>B: PATCH /workflows/{workflow_id}
        B-->>M: Success
        M->>Q: invalidateQueries(['workflows'])
        M-->>U: Show success toast
    end
```

**Save flow details:**

1. **Validation**: `validateSavePath()` checks graph connectivity, `validateWorkflow()` checks data integrity
2. **Transformation**: `buildNestedConditionStructure()` converts flat activities + edges to nested format
3. **Metadata merge**: `getWorkflowDefinition()` combines activities with workflow metadata (name, description, is_enabled, labels). Tags are stored only in `workflow.labels` (key = tag name, value = '') and sent on PATCH/POST so the list API returns them for the Tags column.
4. **HTTP Method**: Uses `PATCH`, not `PUT`
5. **Cache invalidation**: After success, `queryClient.invalidateQueries()` refreshes the workflow list

---

## Summary

### Key Concepts

1. **OpenAPI Contracts** - Types generated from backend YAML specs
2. **Type-Safe Clients** - Full TypeScript support from API to UI
3. **Flat vs Nested** - Builder uses flat + edges, API uses nested structures
4. **WorkflowTransform** - Handles bidirectional conversion
5. **TanStack Query** - Manages server state, caching, mutations
6. **Zustand Store** - Holds workflow during editing
7. **React Flow** - Renders visual canvas

### Critical Files

| File                                                                                                                                    | Purpose                      |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| [`packages/nexus-contracts/package.json`](../packages/nexus-contracts/package.json)                                                     | Type generation scripts      |
| [`packages/nexus-ui/src/client.tsx`](../packages/nexus-ui/src/client.tsx)                                                               | API client creation          |
| [`packages/nexus-ui/src/routes/builder/utils/workflowTransform.ts`](../packages/nexus-ui/src/routes/builder/utils/workflowTransform.ts) | Flatten/nest transformations |
| [`packages/nexus-ui/src/routes/builder/BuilderFlow.tsx`](../packages/nexus-ui/src/routes/builder/BuilderFlow.tsx)                       | Canvas rendering             |
| [`packages/nexus-ui/src/stores/useWorkflowStore.ts`](../packages/nexus-ui/src/stores/useWorkflowStore.ts)                               | Workflow state management    |

### Data Flow Summary

```
Backend YAML Specs
    ↓ [npm run gen]
TypeScript Types
    ↓ [createClient]
API Clients
    ↓ [useQuery/useMutation]
TanStack Query
    ↓ [WorkflowTransform.flatten]
Zustand Store (flat)
    ↓ [BuilderFlow]
React Flow Canvas
    ↓ [User edits]
Zustand Store (updated)
    ↓ [WorkflowTransform.nest]
API Payload
    ↓ [mutation]
Backend API
```
