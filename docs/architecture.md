# UI Architecture (nexus-ui)

> **Reading time**: ~30 minutes  
> **Diagrams**: 18 Mermaid diagrams for visual learners  
> **Audience**: New team members joining the Nexus UI project

This document explains **how the Nexus UI is organized**, **how it fetches data from the backend**, and **how backend workflow activities become canvas steps** (implemented as React Flow **nodes**) on the builder.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Key Terms (Glossary)](#key-terms-glossary)
3. [At a Glance (Mental Model)](#at-a-glance-mental-model)
4. [Core Architecture Principles](#core-architecture-principles)
5. [Technology Stack](#technology-stack)
6. [Diagrams](#diagrams)
7. [Your First Day](#your-first-day)
8. [Repository Layout](#repository-layout-monorepo)
9. [App Startup](#app-startup-where-everything-begins)
10. [Routing](#routing-wouter)
11. [State Management](#state-management)
12. [Backend Requests + Data Flow](#backend-requests--data-flow-tanstack-query--openapi-clients)
13. [Workflow Builder](#workflow-builder-backend-workflow--ui-graph-react-flow)
14. [React Flow Integration](#react-flow-integration-nodes-edges-and-layout)
15. [Where to Look for Common Changes](#where-to-look-for-common-changes)
16. [Related Docs](#related-docs)

---

## Prerequisites

Before diving in, you should be comfortable with:

- **React 19** (or strong React fundamentals) — functional components, hooks, context
- **TypeScript** — generics, type inference
- **Basic state management concepts** — you don't need to know Zustand specifically yet

Nice to have (but we'll explain the basics):

- TanStack Query (React Query)
- React Flow

---

## Key Terms (Glossary)

| Term                  | What it is                                                                                                                  | Learn more                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Zustand**           | Lightweight state management library (like Redux but simpler). We use it for workflow editing state.                        | [Zustand docs](https://zustand-demo.pmnd.rs/)              |
| **TanStack Query**    | Server-state library that handles fetching, caching, and synchronizing backend data. Replaces manual `useEffect` + `fetch`. | [TanStack Query docs](https://tanstack.com/query/latest)   |
| **React Flow**        | Library for building node-based editors (like our workflow canvas). Nodes + edges = graph.                                  | [React Flow docs](https://reactflow.dev/)                  |
| **Wouter**            | Tiny router (~1KB). Like React Router but minimal.                                                                          | [Wouter docs](https://github.com/molefrog/wouter)          |
| **OpenAPI**           | Specification for REST APIs. We generate TypeScript types from the backend's OpenAPI spec.                                  | [OpenAPI spec](https://swagger.io/specification/)          |
| **Dagre**             | Graph layout algorithm. Automatically positions nodes so the workflow looks organized.                                      | [Dagre wiki](https://github.com/dagrejs/dagre/wiki)        |
| **useWebSocketStore** | Zustand store that manages WebSocket connections, reconnection, and message routing.                                        | [`websocket-architecture.md`](./websocket-architecture.md) |
| **Activity**          | A single step in a workflow (e.g., a task, condition, loop). Backend term.                                                  |                                                            |
| **Step**              | User-facing term for a workflow unit on the canvas. In code, each step is rendered as a React Flow **node**.                |                                                            |
| **Node**              | React Flow API term for a vertex on the graph (`Node`, `nodes[]`). Prefer **step** in UI copy and user-facing docs.         |                                                            |
| **Edge**              | React Flow term for a connection line between nodes (between workflow steps on the canvas).                                 |                                                            |

---

## At a Glance (Mental Model)

**Three things to remember:**

1. **Routing**: Wouter + a `navigationItems` tree → `AppRouter` maps it into routes.
2. **Backend data**: Typed OpenAPI clients (`openapi-react-query`) → TanStack Query cache.
3. **Workflow builder**:
   - API v2 uses **flat** nodes + edges (same as the builder's internal model)
   - `processExistingWorkflow()` receives a `WorkflowWithVersion` object, extracts `workflow.version!.workflow_definition!` (the nested v2 payload containing nodes and edges), and loads them into the store
   - `BuilderFlow` renders React Flow nodes/edges from the store
   - `buildWorkflowDefinition()` builds the v2 save payload

---

## Core Architecture Principles

- **Modular Monorepo**: Separated packages with distinct responsibilities
- **Type-Driven Development**: Strict TypeScript and generated OpenAPI types
- **Reactive Design**: Modern React patterns with compiler-driven optimizations

---

## Technology Stack

| Layer               | Technology                              | Notes                                         |
| ------------------- | --------------------------------------- | --------------------------------------------- |
| **UI Components**   | PatternFly 6                            | Enterprise UI component framework             |
| **Styling**         | PatternFly 6                            | Enterprise UI component framework             |
| **Forms**           | react-hook-form                         | Performant form handling                      |
| **Icons**           | PatternFly Icons (prefer RhUi-prefixed) | PatternFly icon library, prefer RhUi icons    |
| **Workflow Canvas** | React Flow (`@xyflow/react`)            | Step-based workflow editor (React Flow graph) |
| **State (Server)**  | TanStack Query                          | Caching, fetching, synchronizing API data     |
| **State (Client)**  | Zustand                                 | Lightweight store for workflow editing        |
| **WebSocket**       | Pure Zustand store                      | Real-time communication with backend          |
| **Routing**         | Wouter                                  | Minimal router (~1KB)                         |
| **Build**           | Vite                                    | Fast dev server and bundler                   |
| **Testing**         | Vitest + Testing Library                | Unit and component testing                    |

---

## Diagrams

### App startup + routing

```mermaid
flowchart TD
  A[main.tsx] --> B[registerAllNodes]
  A --> C[Lazy load App]
  C --> D[App.tsx]
  D --> E[QueryClientProvider]
  E --> F[AppRouter.tsx wouter]
  F --> G[navigationItems.tsx]
  G --> H[Route elements lazy screens]
```

### Backend request flow (typical screen)

```mermaid
flowchart LR
  subgraph Frontend["Frontend (Browser)"]
    A["React Component"]
    B["workflowClient.useQuery()"]
    C["TanStack Query Cache"]
  end

  subgraph Dev["Dev Server"]
    D["Vite Proxy<br/>/api/* → backend"]
  end

  subgraph Backend["Backend"]
    E["REST API"]
  end

  A -->|"1. call hook"| B
  B -->|"2. check cache"| C

  C -->|"3a. HIT: return data"| A

  C -.->|"3b. MISS"| D
  D -.->|"4. forward"| E
  E -.->|"5. JSON response"| D
  D -.->|"6. response"| C
  C -.->|"7. cache + return"| A

  style A fill:#e1f5fe
  style E fill:#fff3e0
```

> **Solid lines** = cache hit (fast path) | **Dashed lines** = cache miss (network request)

### Workflow builder: backend workflow → UI graph

```mermaid
flowchart LR
  A[Backend Workflow<br/>v2 flat: nodes + edges] --> B[processExistingWorkflow]
  B --> C[Zustand store<br/>flat activities + edges]
  C --> D[BuilderFlow]
  D --> E[React Flow nodes + edges]

  E -->|edit| C
  C -->|save| F[buildWorkflowDefinition]
  F --> G["API payload<br/>v2: triggers, nodes, edges"]
```

---

## Your First Day

Here's a suggested path to get oriented:

### 1. Run the app locally (5 min)

```bash
# From repo root
npm ci
npm start
```

Open http://localhost:5173 — you'll see the UI with mock data.

Notes:

- `npm start` (repo root) starts the UI and the mock API together.
- To point the UI at a real backend, set `VITE_API_URL` (see “Backend Requests + Data Flow” below).

### 2. Explore these 3 files (15 min)

| File                                                   | Why                                                    |
| ------------------------------------------------------ | ------------------------------------------------------ |
| `packages/nexus-ui/src/app/App.tsx`                    | Entry point — see how routing and providers are set up |
| `packages/nexus-ui/src/client.tsx`                     | How we make API calls — pattern you'll use everywhere  |
| `packages/nexus-ui/src/routes/builder/BuilderFlow.tsx` | The "big" file — workflow canvas rendering             |

### 3. Make a small change (10 min)

Let's add a console.log to understand the data flow:

**Task**: See what data flows through the workflow builder

1. **Open**: `packages/nexus-ui/src/routes/builder/BuilderFlow.tsx`
2. **Find**: The `BuilderFlow` function (around line 80)
3. **Add** this line at the top of the function:

   ```typescript
   console.log('🔍 BuilderFlow rendered with:', { nodeCount: nodes.length, edgeCount: edges.length })
   ```

4. **Go to**: <http://localhost:5173/workflows> in your browser
5. **Click** any workflow to open the builder
6. **Open DevTools** (F12 → Console tab)
7. **Watch** the console log appear when you interact with the canvas
8. **Remove** the console.log when done

**Success criteria**: ✅ You see console messages showing node/edge counts in browser DevTools

**Try also** (optional):

- Change the page title in `Workflows.tsx` (look for `AppPageHeader`)
- Add a `console.log` in `BuilderContent.tsx` inside the `useEffect` that loads the workflow

### 4. Read the workflow builder section below

The workflow builder is the most complex part. Understanding the flat ↔ nested transformation is key.

---

## Repository Layout (monorepo)

```
packages/
├── nexus-ui/           ← The actual web app (React + Vite)
├── nexus-contracts/    ← Generated TypeScript types from OpenAPI
└── nexus-mock-api/     ← Local mock server for development
```

### Package Dependency Graph

```mermaid
flowchart TB
  subgraph Packages
    UI[nexus-ui<br/>Main App]
    Contracts[nexus-contracts<br/>API Types]
    Mock[nexus-mock-api<br/>Dev Server]
  end

  UI --> Contracts
  Mock --> Contracts

  subgraph External
    PatternFly[PatternFly 6]
    ReactFlow["@xyflow/react"]
    TanStack[TanStack Query]
  end

  UI --> PatternFly
  UI --> ReactFlow
  UI --> TanStack
```

Within `packages/nexus-ui/src/`:

| Directory                                 | Purpose                                                               |
| ----------------------------------------- | --------------------------------------------------------------------- |
| `app/`                                    | App shell, layout, routing                                            |
| `client.tsx`                              | Typed API clients (OpenAPI → TanStack Query hooks)                    |
| `routes/`                                 | Feature areas: builder, workflows, executions, configuration          |
| `stores/`                                 | Client state (Zustand) — workflow store                               |
| `lib/websocket/`                          | WebSocket infrastructure (store, hooks, types, utils)                 |
| `components/`                             | App-specific components                                               |
| `constants/`, `hooks/`, `utils/`, `test/` | Shared utilities (date formatting, error parsing, trigger formatting) |

---

## App Startup (where everything begins)

**Entry**: `packages/nexus-ui/src/main.tsx`

```tsx
// Simplified view of main.tsx
registerAllNodes() // Auto-discovers and registers workflow step types (NodeRegistry)
const App = lazy(() => import('./app/App'))
createRoot(document.getElementById('root')!).render(<App />)
```

### How `registerAllNodes()` auto-discovers step types

`registerAllNodes()` is implemented in `packages/nexus-ui/src/routes/builder/registry/nodes/index.ts`.
It uses Vite's `import.meta.glob` to synchronously import all registration modules at startup:

```mermaid
flowchart LR
  subgraph Startup["App Startup (main.tsx)"]
    A[registerAllNodes]
  end

  subgraph Vite["Vite import.meta.glob"]
    B["Scan registry/nodes/"]
    C["Find register*.ts files"]
  end

  subgraph Files["Registration Files"]
    D[registerActionNode.ts]
    E[registerLogicNode.ts]
    F[registerTriggerNode.ts]
    G[registerApprovalNode.ts]
    H["registerAIAgentNode.ts<br/>registerAAPNode.ts<br/>registerGenericNode.ts"]
  end

  subgraph Registry["NodeRegistry (singleton)"]
    I["Map<id, NodeDefinition>"]
  end

  A --> B
  B --> C
  C --> D & E & F & G & H
  D & E & F & G & H -->|"export default"| I
```

- **Directory**: `packages/nexus-ui/src/routes/builder/registry/nodes/`
- **Filename pattern**: `register*.ts`
- **Export contract**: each `register*.ts` file must `export default function registerXxx() { ... }`
- **When it runs**: `packages/nexus-ui/src/main.tsx` calls `registerAllNodes()` before rendering the app

This is why adding a new canvas step type is usually just "create a new `registerMyNode.ts` file with a default export"
—no central list to edit.

**App root**: `packages/nexus-ui/src/app/App.tsx`

- Creates a single `QueryClient` for server state
- Renders the global layout and mounts `AppRouter`

---

## Routing (Wouter)

```mermaid
flowchart LR
  subgraph Definition["Route Definition"]
    AR[AppRoute.tsx<br/>path constants]
    NI[navigationItems.tsx<br/>nav tree + lazy components]
  end

  subgraph Router["AppRouter.tsx"]
    Map["Map navigationItems"]
    Route["<Route> elements"]
    Map --> Route
  end

  subgraph URL["Browser URL"]
    U["/workflows"]
    U2["/workflow-builder/:workflowId"]
    U3["/configuration/settings"]
  end

  AR --> NI
  NI --> Router
  URL --> Router
  Router -->|"match"| Component["Lazy-loaded Component"]
```

| File                      | Role                                                                       |
| ------------------------- | -------------------------------------------------------------------------- |
| `app/AppRoute.tsx`        | Route path constants (e.g., `/workflows`, `/workflow-builder/:workflowId`) |
| `app/navigationItems.tsx` | Defines nav tree + lazy-loaded route components                            |
| `app/AppRouter.tsx`       | Maps `navigationItems` into `<Route>` elements                             |

> **Note**: The `/dashboard` route is defined in `AppRoute.tsx` and appears in navigation, but has no component mounted (placeholder for future implementation).

**Common patterns:**

```tsx
// Navigate programmatically
const [, navigate] = useLocation()
navigate('/workflows')

// Read URL params
const { workflowId } = useParams()
```

**Routing strategy details:**

- Path params for entity selection and mode switching
- Query params for filtering and optional selections

---

## State Management

| Type                | Technology                    | Purpose                                              |
| ------------------- | ----------------------------- | ---------------------------------------------------- |
| **Server State**    | TanStack Query                | All API data — fetching, caching, background updates |
| **Client State**    | React useState/useContext     | Local UI state (modals, forms, selections)           |
| **Workflow State**  | Zustand (`useWorkflowStore`)  | Builder workflow editing state                       |
| **WebSocket State** | Zustand (`useWebSocketStore`) | Real-time connection state and messages              |

```mermaid
flowchart TB
  subgraph Server["Server State (TanStack Query)"]
    API[Backend API]
    Cache[Query Cache]
    API <--> Cache
  end

  subgraph Client["Client State (React)"]
    useState[useState]
    useContext[useContext]
  end

  subgraph Workflow["Workflow State (Zustand)"]
    Store[useWorkflowStore]
    Actions[Actions]
    Selectors[Selectors/Hooks]
    Store --> Actions
    Store --> Selectors
  end

  Component[React Component]
  Component --> Server
  Component --> Client
  Component --> Workflow
```

**Key characteristics:**

- Type-safe API interactions via `openapi-react-query`
- Automatic memoization through React Compiler

### WebSocket State

For real-time features, we use a pure Zustand architecture (no Context/Provider needed):

```mermaid
flowchart TB
  subgraph Backend["Backend WebSocket Server"]
    WS[WebSocket Endpoint]
  end

  subgraph WebSocketInfra["WebSocket Infrastructure (lib/websocket/)"]
    Store[useWebSocketStore<br/>Zustand - connection logic]
    Hooks[useWebSocket]
  end

  subgraph Component["React Component"]
    UI[Component UI]
  end

  WS <-->|"messages"| Store
  Store --> Hooks
  Hooks --> UI
```

**Quick usage:**

```tsx
import { useWebSocket } from '../../lib/websocket'

function ChatComponent() {
  // Single hook for connect, send, and receive
  const { sendRaw, isConnected } = useWebSocket(
    { id: 'chat', path: '/ws/example/v1/chat' },
    { onMessage: (msg) => console.log('Received:', msg) }
  )

  return (
    <button onClick={() => sendRaw({ message: 'Hello' })} disabled={!isConnected}>
      Send
    </button>
  )
}
```

> 📚 **See [`docs/websocket-architecture.md`](./websocket-architecture.md) for comprehensive WebSocket documentation.**

### Zustand Quick Reference

> 📚 **See [docs/zustand-architecture.md](./zustand-architecture.md) for comprehensive documentation** on the Zustand store architecture, best practices, and usage patterns.

**Quick reference:**

- **Store location**: `packages/nexus-ui/src/stores/useWorkflowStore.ts`
- **Factory functions**: `packages/nexus-ui/src/stores/workflowFactories.ts`
- Use custom hooks (`useWorkflowVersion()`, `useActivities()`, etc.) for reading state
- Use `useWorkflowStoreActions()` for dispatching actions without re-renders
- Use atomic batch operations for coupled state changes

---

## Backend Requests + Data Flow (TanStack Query + OpenAPI clients)

### Making API calls

All backend calls go through typed clients in `src/client.tsx`:

```tsx
// Reading data
const { data, isLoading, error } = workflowClient.useQuery('get', '/workflows/{workflow_id}', {
  params: { path: { workflow_id: id } },
})

// Writing data
const mutation = workflowClient.useMutation('post', '/workflows')
mutation.mutate({ body: workflowPayload })
```

### Available clients

| Client              | Base URL                | Used for                                     |
| ------------------- | ----------------------- | -------------------------------------------- |
| `workflowClient`    | `/api/v1/`              | Workflow definitions and CRUD                |
| `executionsClient`  | `/api/v1/`              | Execution list, detail, and run              |
| `toolManagerClient` | `/api/v1/tool_manager/` | Tool manager (tools & providers unified API) |
| `approvalsClient`   | `/api/v1/`              | Approval requests and responses              |

**Note:** File uploads use a direct fetch call via the `useFileUploadWithProgress` hook (not a generated client) since `openapi-react-query` doesn't support upload progress tracking.

### Where does the backend URL come from?

- UI uses relative paths (`/api/v1/...`)
- Vite proxies `/api/*` to `VITE_API_URL` (or `localhost:3000` by default)
- See `packages/nexus-ui/vite.config.ts`

### Local ports (defaults)

- **UI (Vite dev server)**: `http://localhost:5173`
- **Mock API**: `http://localhost:3000`

---

## Workflow Builder: backend workflow → UI graph (React Flow)

> This is the most complex part of the codebase. Take your time here.

### The key insight: v2 flat format

With the v2 API, both the backend and builder use the **same flat format**: `{ triggers: [], nodes: [], edges: [] }`. No nested↔flat transformation is needed.

| Concept      | Description                                                      |
| ------------ | ---------------------------------------------------------------- |
| **Nodes**    | Flat array of all workflow activities (tasks, conditions, loops) |
| **Edges**    | Explicit connections between nodes (with ports for branching)    |
| **Triggers** | Workflow entry points (manual, scheduled, event-driven)          |

The builder edits nodes + edges directly in the Zustand store. On save, `buildWorkflowDefinition()` produces the v2 API payload.

### Builder entry points

| Route                           | File              | Purpose                |
| ------------------------------- | ----------------- | ---------------------- |
| `/workflow-builder/new`         | `BuilderNew.tsx`  | Create new workflow    |
| `/workflow-builder/:workflowId` | `BuilderEdit.tsx` | Edit existing workflow |

### Load path: API → store → canvas

```
1. Fetch workflow from API (v2 flat format: triggers, nodes, edges)
       ↓
2. processExistingWorkflow() maps API edges to React Flow edges
       ↓
3. loadWorkflowWithEdges() atomically updates Zustand store
       ↓
4. BuilderFlow converts store → React Flow nodes + edges
       ↓
5. React Flow renders the canvas
```

### Save path: canvas → store → API

```
1. User clicks Save
       ↓
2. Read flat activities + edges from Zustand
       ↓
3. Validate the graph
       ↓
4. buildWorkflowDefinition() builds v2 payload (triggers, nodes, edges)
       ↓
5. Submit to API via mutation
```

### Key files

| File                                              | Responsibility                                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `BuilderContent.tsx`                              | Orchestrates load/save, wraps canvas                                                                                     |
| `BuilderFlow.tsx`                                 | Converts store → React Flow nodes/edges, handles layout                                                                  |
| `workflows/canvas/CanvasControls.tsx`             | Bottom canvas toolbar (zoom, fit, layout, expand/collapse) and toggle for the legend                                     |
| `workflows/canvas/CanvasLegend.tsx`               | Floating legend: step categories and approval branch colors                                                              |
| `workflows/canvas/semanticZoom.ts`                | Semantic zoom threshold (`SEMANTIC_ZOOM_MAX_SCALE`) and `semanticZoomActivityTitle()` for consistent empty-name tooltips |
| `workflows/canvas/semanticZoomTypes.ts`           | Shared `SemanticZoomBranchSource` type for branch handles at semantic zoom                                               |
| `workflows/canvas/nodes/hooks/useSemanticZoom.ts` | LOD flag via typed `useStore` selector + `updateNodeInternals` when crossing the zoom threshold                          |
| `workflows/canvas/nodes/common/NodeComponent.tsx` | Shared canvas step shell; semantic zoom swaps to color blocks + tooltips (title + type)                                  |
| `utils/processExistingWorkflow.ts`                | Load API workflow → flat store format (maps v2 edges to React Flow edges)                                                |
| `utils/workflowDefinitionBuilder.ts`              | Build v2 save payload (nodes, edges, triggers) with security validation                                                  |
| `utils/buildNestedStructure.ts`                   | Legacy wrapper (identity function in v2 — returns activities as-is)                                                      |
| `utils/validation/`                               | Validation rules                                                                                                         |

Floating canvas surfaces (controls, legend, step nodes, undo/redo) use [`AppPanel`](../packages/nexus-ui/src/components/AppPanel.tsx) so they stay readable under the glass theme: compact overlays use `variant="raised"`; large flat panels (for example the node editor shell) use `opaqueFloatingFill` instead of raised chrome.

### Builder internals (advanced): registry, edges, and graph semantics

This section is the “how it really works” view of the builder. It’s here so newcomers can debug issues without spelunking `BuilderFlow.tsx` immediately.

#### Step registry — `NodeRegistry` (the "Add step" panel)

- **Goal**: decouple the "available step types + forms" list from the UI so new steps can be added without editing a central switch statement.
- **Core types**: `routes/builder/registry/NodeRegistry.ts` + helpers in `routes/builder/registry/helpers/`.
- **Registration flow**:
  - Registration modules live in `routes/builder/registry/nodes/`.
  - Any file matching **`register*.ts`** is loaded at startup (see "How `registerAllNodes()` auto-discovers step types" above).
  - Each registration module must export a **default** function that calls `NodeRegistry.register(...)`.
- **Templates**:
  - `createCustomNode(...)`: use this helper when you want shared registration ergonomics plus custom submit logic.
  - Or call `NodeRegistry.register(...)` directly for simple registrations without helper wrappers.
- **Categories**:
  - Categories are type-safe and provide UI metadata (ordering/grouping/search). See `routes/builder/registry/categories.ts`.

**Step registration system (code examples):**

```typescript
// Each canvas step type has its own registration file (e.g., registerTriggerNode.ts)
// Files matching register*.ts are automatically discovered and registered
// MUST export the registration function as default

// Simple registrations can call NodeRegistry.register() directly:
import { NodeRegistry } from '../NodeRegistry'

export default function registerApprovalNode() {
  NodeRegistry.register({
    id: 'approval',
    label: 'Approval',
    icon: RhUiUserCheckIcon,
    category: 'logic', // Type-safe - must be a valid NodeCategory
    description: 'Require human approval before continuing workflow',
    keywords: ['approve', 'approval', 'review', 'manual'],
    order: 50,
    formComponent: ApprovalNodeForm,
    onSubmit: (_data, onSuccess) => {
      onSuccess()
    },
  })
}

// Complex registrations (workflow store integration):
import { createCustomNode } from '../helpers/nodeTemplates'

export default function registerTriggerNode() {
  NodeRegistry.register(
    createCustomNode<TriggerFormData>(
      {
        id: 'trigger',
        label: 'Triggers',
        icon: PlayIcon,
        category: 'trigger', // Type-safe category
        description: 'Start workflow execution',
        keywords: ['start', 'begin', 'manual', 'schedule'],
        order: 10,
        formComponent: TriggerNodeForm,
      },
      (data, onSuccess, onError) => {
        // Custom submission logic
        const trigger = createManualTrigger(data.requiresApproval)
        useWorkflowStore.getState().addTrigger(trigger)
        onSuccess()
      }
    )
  )
}

// AUTO-REGISTRATION: registerAllNodes() automatically discovers and calls
// all registration functions - no manual imports needed!
```

**Adding new step types:**

1. Create a file matching `register*.ts` in `registry/nodes/`
2. Export your registration function as **default**
3. That's it! Auto-discovery handles the rest

**Available registration patterns:**

- `NodeRegistry.register({ ... })` - Good for direct/simple registrations
- `createCustomNode(config, onSubmit)` - Good for step types with shared helper behavior and custom submission logic

**Step categories (type-safe):**

Categories are defined in `registry/categories.ts` with full metadata:

| Category      | Description                            | Order |
| ------------- | -------------------------------------- | ----- |
| `trigger`     | Start workflow execution               | 1     |
| `action`      | Execute tasks or API calls             | 2     |
| `logic`       | Conditional branching and control flow | 3     |
| `integration` | External service integrations          | 4     |
| `approval`    | Human approval gates                   | 5     |
| `other`       | Miscellaneous step types               | 99    |

Access category metadata: `getCategoryMetadata('trigger')` or `CATEGORY_METADATA.trigger`

**Registry API:**

```typescript
NodeRegistry.register(definition) // Register a step type for the Add panel
NodeRegistry.get(id) // Get definition by registry id
NodeRegistry.getAll() // Get all enabled step types
NodeRegistry.search(query) // Search step types by label/keywords
NodeRegistry.getByCategory(cat) // Get step types by category
```

#### "Flat nodes + edges" is the canonical model (v2)

With the v2 API, both the backend and builder share the same flat representation:

```mermaid
flowchart TB
  subgraph API["V2 API Format (Flat)"]
    direction TB
    A1["triggers: [manual_trigger]"]
    A2["nodes: [condition, task1, task2, task3]"]
    A3["edges: [
      condition→task1 (from_port: when_true),
      task1→task2,
      condition→task3 (from_port: when_false)
    ]"]
  end

  subgraph Store["Builder Store (Flat)"]
    direction TB
    S1["activities: [condition, task1, task2, task3]"]
    S2["edges: [
      condition→task1 (sourceHandle: true),
      task1→task2,
      condition→task3 (sourceHandle: false)
    ]"]
  end

  API <-->|"port ↔ handle mapping"| Store
```

The only transformation between API and builder is **port name mapping** (e.g., `from_port: 'when_true'` ↔ `sourceHandle: 'true'`).

#### Load + save pipeline (v2)

```mermaid
flowchart TB
  subgraph Load["Load Path (API → Builder)"]
    direction TB
    L1[API Response<br/>v2 flat workflow] --> L2[processExistingWorkflow.ts]
    L2 --> L3["Map v2 ports to React Flow handles<br/>Enrich activities with metadata"]
    L3 --> L6[Zustand Store<br/>flat activities + edges]
  end

  subgraph Save["Save Path (Builder → API)"]
    direction TB
    S1[Zustand Store<br/>flat activities + edges] --> S2[Validation]
    S2 --> S3[workflowDefinitionBuilder.ts]
    S3 --> S4["Map handles to v2 ports<br/>Resolve trigger display IDs<br/>Sanitize inputs"]
    S4 --> S5["API Payload<br/>{ schema_version: '2.0.0', triggers, nodes, edges }"]
  end

  Load -.->|"user edits"| Save
```

- **Load** (`processExistingWorkflow.ts`): Reads `workflowDef.nodes` and `workflowDef.edges` directly. Maps v2 port names (`when_true`, `iterate`) to React Flow handles (`true`, `loop`). Enriches activities with UI metadata.
- **Save** (`workflowDefinitionBuilder.ts`): Validates all IDs (security), maps React Flow handles back to v2 ports, resolves trigger display IDs (`trigger-0`) to definition IDs, sanitizes names, and produces the v2 payload.
- **Legacy wrapper** (`buildNestedStructure.ts`): The `buildNestedConditionStructure()` function is now an identity operation — it returns activities unchanged since v2 is already flat.

#### Edge synchronization (keeping store + React Flow consistent)

The builder maintains two representations of connections:

- **React Flow edges** (what you see + manipulate on the canvas)
- **Store edges** (what the builder saves/validates and uses for derived behavior)

```mermaid
flowchart LR
  subgraph Canvas["React Flow Canvas"]
    RF[React Flow Edges<br/>visual + interactive]
  end

  subgraph Hook["useEdgeSynchronization"]
    Guard[Re-entrance Guard]
    Sync[Sync Pipeline]
  end

  subgraph Store["Zustand Store"]
    SE[Store Edges<br/>save/validate]
  end

  RF -->|"onEdgesChange"| Guard
  Guard -->|"if not re-entering"| Sync
  Sync -->|"1. syncConvergeNodeBranches"| SE
  Sync -->|"2. reorderActivities"| SE
  SE -.->|"derived updates"| RF
```

The synchronization logic lives in `routes/builder/hooks/useEdgeSynchronization.ts` and is designed to:

- avoid feedback loops (store updates triggering edge updates triggering store updates)
- keep derived structures up to date (like converge branches and activity ordering)

**Synchronization pipeline on edge changes:**

1. `syncConvergeNodeBranches()` - Updates the `branches` array on converge nodes with incoming activity IDs
2. `reorderActivitiesFromEdges()` - Topologically sorts activities based on edges

The hook uses a re-entrance guard to prevent infinite loops from workflow → edge updates.

**Note:** Unlike parallel containers (which are only created during API transformations), `syncConvergeNodeBranches()` only updates the `converge.branches` array during editing — it does not create `parallel_for_*` containers. Parallel containers exist only in the API format (nested structure), not during editing.

#### Button edges (interactive "+" edges)

Builder edges aren't purely visual. `ButtonEdge` is the "add a step here" affordance:

```mermaid
flowchart LR
  subgraph Canvas["Workflow Canvas"]
    N1[Task 1]
    BE["[ + ]<br/>ButtonEdge"]
    N2[Task 2]
    N1 --> BE --> N2
  end

  subgraph Hook["useButtonEdgeMaintenance"]
    M1["Monitor React Flow nodes/edges"]
    M2["Find valid insertion points"]
    M3["Insert/remove ButtonEdges"]
  end

  Canvas <--> Hook

  BE -->|"click"| Panel["Add step panel"]
```

- **Edge type**: `routes/builder/edges/ButtonEdge.tsx`
- **Maintenance**: `routes/builder/hooks/useButtonEdgeMaintenance.ts`
- **Behavior**: as nodes/edges change, the builder inserts/removes these button edges at valid insertion points so users always have a place to add the next step.

#### Converge nodes (fan-in) and parallel wrappers

Converge nodes (also called "join" nodes) are "merge points" with special semantics:

```mermaid
flowchart TB
  subgraph Editing["During Editing: Flat with edges"]
    B1[Task A] --> BJ["Converge<br/>branches: A, B, C"]
    B2[Task B] --> BJ
    B3[Task C] --> BJ
  end

  subgraph API["On Save: Nested with parallel wrapper"]
    direction TB
    P["parallel_for_converge1<br/>(auto-generated)"]
    A1[Task A]
    A2[Task B]
    A3[Task C]
    AJ[Converge]
    P --> A1 & A2 & A3
    A1 & A2 & A3 --> AJ
  end

  Editing -->|"buildWorkflowDefinition()"| API
```

**During Editing:**

- Converge nodes store incoming branch activity IDs in `converge.branches: string[]`
- `syncConvergeNodeBranches()` updates this array when edges change
- **No parallel containers are created** — only the `branches` array is updated
- Activities remain in the flat `activities` array

**On Save (v2):**

- `buildWorkflowDefinition()` sends the flat nodes + edges directly
- Converge nodes and their `branches` array are preserved as-is in the v2 payload

**On Load (v2):**

- `processExistingWorkflow()` reads flat nodes + edges from the API
- Converge nodes are loaded directly with their `branches` array intact

#### Condition nodes (branching) and source handles

Condition nodes stay flat while editing; their branch structure is expressed by edges:

```mermaid
flowchart TB
  subgraph Editing["During Editing (Flat)"]
    direction TB
    C1["Condition
    ────────────
    [True] [False]"]
    T1[Task 1]
    T2[Task 2]
    T3[Task 3]

    C1 -->|"sourceHandle='true'"| T1
    T1 --> T2
    C1 -->|"sourceHandle='false'"| T3
  end

  subgraph Saved["On Save (V2 Flat)"]
    direction TB
    CS["nodes: [Condition, Task1, Task2, Task3]
    edges: [
      Condition→Task1 (from_port: when_true),
      Task1→Task2,
      Condition→Task3 (from_port: when_false)
    ]"]
  end

  Editing -->|"buildWorkflowDefinition"| Saved
```

- Condition nodes stay flat in both editing and save — v2 API uses the same flat format.
- Edges with `sourceHandle='true'` connect to true branch, `sourceHandle='false'` to false branch.
- Two handles on node: "True" and "False" for branching connections.
- On save, `buildWorkflowDefinition()` maps `sourceHandle: 'true'` → `from_port: 'when_true'`.

#### Where to look when debugging "graph weirdness"

```mermaid
flowchart TB
  subgraph Issues["Common Issues"]
    I1["Nodes not laying out correctly"]
    I2["Edges duplicating/missing"]
    I3["Join/parallel drift"]
    I4["Save payload wrong"]
  end

  subgraph Files["Where to Look"]
    F1["BuilderFlow.tsx<br/>+ Dagre setup"]
    F2["useButtonEdgeMaintenance.ts<br/>+ edge components"]
    F3["useEdgeSynchronization.ts<br/>+ sync helpers"]
    F4["buildNestedStructure.ts<br/>+ validation rules"]
  end

  I1 --> F1
  I2 --> F2
  I3 --> F3
  I4 --> F4
```

- **Nodes not laying out correctly**: `BuilderFlow.tsx` layout + Dagre setup
- **Edges duplicating / missing button edges**: `useButtonEdgeMaintenance.ts` + edge type components
- **Join/parallel drift**: `useEdgeSynchronization.ts` (and any join/branch sync helpers it calls)
- **Save payload looks wrong**: `utils/buildNestedStructure.ts` and the validation rules

---

## React Flow Integration (nodes, edges, and layout)

### Canvas step types (React Flow `nodeTypes`)

Defined in `routes/workflows/canvas/nodes/NodeType.tsx`:

```tsx
const nodeTypes = {
  task: TaskNode,
  condition: ConditionNode,
  loop: LoopNode,
  converge: ConvergeNode,
  // ... etc
}
```

Builder adds extra types like `placeholder` for drop targets.

**Visual coding (builder canvas):**

- **Type-colored top bar + icon**: `routes/workflows/canvas/nodeTypeColors.ts` (`getNodeTypeColor`, `NODE_TYPE_COLORS`) maps node / executor types to PatternFly non-status tokens. `NodeComponent` accepts optional `topBarColor` for a 4px top border; when a node is **selected**, the full brand border replaces the top bar (same as nodes without a type bar). Icons use the same token via `renderNodeIcon(..., color)`.
- **Semantic zoom (Topology-style LOD)**: When the React Flow viewport `zoom` is at or below `SEMANTIC_ZOOM_MAX_SCALE` (defined in `semanticZoom.ts`), `NodeComponent` renders a compact horizontal block filled with the same accent as `topBarColor`, with a PatternFly `Tooltip` showing **title** (heading weight) and **type** (`semanticZoomSummary` from each node). For performance, LOD logic lives in **`useSemanticZoom`** (`nodes/hooks/useSemanticZoom.ts`): a **`useStore`** selector typed with **`ReactFlowState`** reads `transform[2]` (zoom) and returns a boolean so nodes re-render only when crossing the threshold—not on every pan/zoom frame like **`useViewport`** would (see [React Flow `useStore`](https://reactflow.dev/api-reference/hooks/use-store)). The primary title uses **`semanticZoomActivityTitle`** (trimmed name, else a stable fallback): structural nodes use **`Untitled ${metadata.label}`**; task-shaped nodes use **`Untitled task`** with the executor label on the second line. Tooltip copy uses **`--pf-t--global--text--color--inverse`** for both lines so it stays readable on PatternFly’s inverse tooltip surface (see `NodeSemanticZoomBody.tsx`). Branching nodes pass **`semanticZoomBranchSources`** so multiple source handles stay on the **same bar height** with **no branch labels** (handles on the right edge; `SemanticZoomBranchSourceHandles.tsx`). `useUpdateNodeInternals` runs when toggling so edge anchors stay correct. New semantic-zoom UI should include **`vitest-axe`** coverage per the **Accessibility Testing** section in `CLAUDE.md`.
- **Add step panel**: `getAddNodePanelColor` uses registry ids; builder registry ids are centralized in `src/constants/registryNodeIds.ts` (`RegistryNodeId`, `RegistryNodeIdUnion`).
- **Approval branches**: `BranchHandle` and `EdgePath` / `DefaultEdge` / `ButtonEdge` color approved vs rejected handles and edges using success/danger tokens.

### Edge types

| Registry              | Location                                     |
| --------------------- | -------------------------------------------- |
| Canvas (read-only)    | `routes/workflows/canvas/edges/EdgeType.tsx` |
| Builder (interactive) | `routes/builder/edges/*.tsx`                 |

Builder edges include: `ButtonEdge`, `DefaultEdge`, `LoopBackEdge`, `LoopDoneEdge`, `LoopOutgoingEdge`.

### Layout (Dagre)

`BuilderFlow` uses Dagre to auto-position nodes. See `getLayoutedElements()` in `BuilderFlow.tsx`.

```mermaid
flowchart TB
  subgraph Input["Input"]
    N[Nodes array]
    E[Edges array]
  end

  subgraph Dagre["Dagre Layout Algorithm"]
    G["Create Graph"]
    AN["Add steps with dimensions"]
    AE["Add edges"]
    L["dagre.layout()"]
    G --> AN --> AE --> L
  end

  subgraph Special["Special Handling"]
    Loop["Loop nodes → position body to RIGHT"]
    Skip["Skip loop-back edges in layout"]
  end

  subgraph Output["Output"]
    PN["Positioned nodes<br/>(x, y coordinates)"]
  end

  N & E --> Dagre
  Dagre --> Special
  Special --> Output
```

Special handling for loops: loop body nodes are positioned to the right (not below) to avoid circular layout issues.

**ReactFlow initialization details:**

```mermaid
sequenceDiagram
  participant BF as BuilderFlow
  participant RF as React Flow
  participant D as Dagre

  BF->>RF: Render nodes (unmeasured)
  Note over RF: Nodes rendered at (0,0)
  RF-->>BF: onNodesChange
  BF->>BF: setTimeout(50ms)
  Note over BF: Wait for measurement
  BF->>D: getLayoutedElements()
  D-->>BF: Positioned nodes
  BF->>RF: setNodes(positioned)
  RF->>RF: fitView()
```

- Layout initialization uses dagre for automatic positioning.
- Separate initialization state from layout execution.
- Use `setTimeout(50ms)` to ensure nodes are measured before layout.
- `ReactFlowProvider` wraps the entire builder UI.

### Builder Component Pattern

```mermaid
flowchart TB
  subgraph Routes["Route Entry Points"]
    R1["/workflow-builder/new"]
    R2["/workflow-builder/:workflowId"]
  end

  subgraph Components["Component Hierarchy"]
    BN[BuilderNew.tsx]
    BE[BuilderEdit.tsx]
    BC[BuilderContent.tsx<br/>shared UI logic]
    RFP[ReactFlowProvider]
    BF[BuilderFlow.tsx<br/>graph conversion + layout]
    RF[React Flow Canvas]
  end

  R1 --> BN
  R2 --> BE
  BN --> BC
  BE --> BC
  BC --> RFP
  RFP --> BF
  BF --> RF
```

- Separate components for new (`BuilderNew.tsx`) and edit (`BuilderEdit.tsx`) workflows.
- `BuilderContent` component encapsulates all shared UI logic.
- `BuilderFlow.tsx` handles workflow → graph conversion and legacy detection.
- Routes: `/workflow-builder/new` (new) and `/workflow-builder/:workflowId` (edit).

---

## Where to Look for Common Changes

### Add a new screen/route

1. Add path constant in `app/AppRoute.tsx`
2. Add lazy route entry in `app/navigationItems.tsx`
3. `AppRouter.tsx` picks it up automatically

### Add a new API call

```tsx
// In your component
const { data } = workflowClient.useQuery('get', '/your-endpoint', { ... })

// After mutation, invalidate related queries
queryClient.invalidateQueries({ queryKey: ['get', '/workflows'] })
```

### Add a new workflow step type

1. Create `register*.ts` in `routes/builder/registry/nodes/`
2. `NodeRegistry` auto-discovers it at startup
3. Add/extend the React Flow node component in `routes/workflows/canvas/nodes/` (maps activities to canvas steps)

---

## Related Docs

| Doc                                                             | Content                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------ |
| [`docs/zustand-architecture.md`](./zustand-architecture.md)     | Deep dive into workflow store, actions, and state management |
| [`docs/websocket-architecture.md`](./websocket-architecture.md) | WebSocket infrastructure, hooks, and real-time patterns      |
| [`CLAUDE.md`](../CLAUDE.md)                                     | Quick reference for AI assistants and developers             |
