# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Claude Agent Instructions

Claude, you have access to the following skills. Use them when appropriate:

- See `.claude/skills/pr_review.md` for PR review steps

## Essential Commands

```bash
# Development
npm start                  # Start all services (UI, framework, mock API)
npm run start:nexus-ui     # Start UI only
npm run start:nexus-mock-api # Start mock API only

# Testing
npm test                   # Run all tests
npm run test:nexus-ui      # Run UI package tests
npm run test:coverage      # Run tests with coverage report
npm run test:ui            # Interactive test UI (Vitest UI)

# Run a specific test
cd packages/nexus-ui
npm run vitest -- path/to/specific/test.test.ts

# Build
npm run build              # Build all packages
npm run build:nexus-ui     # Build UI package
npm run gen                # Regenerate API contracts

# Code Quality
npm run format             # Format code
npm run format:check       # Check formatting
cd packages/nexus-ui && npm run eslint  # Run ESLint
cd packages/nexus-ui && npm run tsc     # Type check only
```

## Connecting to Real Backend

To use the real Nexus backend instead of the mock API:

1. Clone and setup the backend: `git clone https://github.com/syntara-orchestration/syntara.git`
2. Follow the backend README to start the API server
3. Export the backend URL and start the UI:

```bash
export VITE_API_URL=http://localhost:8000
npm start
```

## Architectural Context

### Core Architecture Principles

- **Modular Monorepo**: Separated packages with distinct responsibilities
- **Type-Driven Development**: Strict TypeScript and generated OpenAPI types
- **Reactive Design**: Modern React patterns with compiler-driven optimizations

### Key Architectural Components

#### Routing Strategy

- Centralized in `packages/nexus-ui/src/app/AppRoute.tsx`
- Lazy-loaded components via `navigationItems.tsx`
- Lightweight routing with Wouter
- Path params for entity selection and mode switching
- Query params for filtering and optional selections

#### State Management

- **Server State**: TanStack Query for all API data
- **Client State**: React useState/useContext for local UI state
- **Workflow State**: Zustand store (`useWorkflowStore`) for builder workflows
- Type-safe API interactions via openapi-react-query
- Automatic memoization through React Compiler

#### Component Ecosystem

- Headless UI components (Base UI)
- Shared library in `nexus-ui-framework`
- Styling: TailwindCSS 4
- Form handling: react-hook-form
- Icons: Lucide React
- Workflow canvas: ReactFlow (@xyflow/react)

#### Workflow Builder Architecture

- Plugin-based architecture for registering workflow node types
- Located in `packages/nexus-ui/src/routes/builder/registry/`
- Singleton registry pattern with `NodeRegistry` class
- **Auto-discovery system** using `import.meta.glob` - automatically registers all `register*.ts` files
- Type-safe categories with centralized metadata (`categories.ts`)

**Node Registration System:**

```typescript
// Each node type has its own registration file (e.g., registerTriggerNode.ts)
// Files matching register*.ts are automatically discovered and registered
// MUST export the registration function as default

// Basic nodes (placeholder implementations):
import { createBasicNode } from '../helpers/nodeTemplates'
import { NodeRegistry } from '../NodeRegistry'

export default function registerApprovalNode() {
  NodeRegistry.register(
    createBasicNode({
      id: 'approval',
      label: 'Approval',
      icon: UserCheckIcon,
      category: 'logic', // Type-safe - must be a valid NodeCategory
      description: 'Require human approval before continuing workflow',
      keywords: ['approve', 'approval', 'review', 'manual'],
      order: 50,
      formComponent: ApprovalNodeForm,
    })
  )
}

// Complex nodes (with workflow store integration):
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

**Adding New Nodes:**

1. Create a file matching `register*.ts` in `registry/nodes/`
2. Export your registration function as **default**
3. That's it! Auto-discovery handles the rest

**Available Templates:**

- `createBasicNode(config, errorMessage?)` - For placeholder nodes that just call onSuccess
- `createCustomNode(config, onSubmit)` - For nodes with custom submission logic

**Node Categories (Type-Safe):**
Categories are defined in `registry/categories.ts` with full metadata:

- `trigger` - Start workflow execution (order: 1)
- `action` - Execute tasks or API calls (order: 2)
- `logic` - Conditional branching and control flow (order: 3)
- `integration` - External service integrations (order: 4)
- `approval` - Human approval gates (order: 5)
- `other` - Miscellaneous nodes (order: 99)

Access category metadata: `getCategoryMetadata('trigger')` or `CATEGORY_METADATA.trigger`

**Registry API:**

```typescript
NodeRegistry.register(definition) // Register a node type
NodeRegistry.get(id) // Get node by ID
NodeRegistry.getAll() // Get all enabled nodes
NodeRegistry.search(query) // Search nodes by label/keywords
NodeRegistry.getByCategory(cat) // Get nodes by category
```

**ReactFlow Integration:**

- Layout initialization uses dagre for automatic positioning
- Separate initialization state from layout execution
- Use setTimeout(50ms) to ensure nodes are measured before layout

**Zustand State Management for Workflows:**

- `useWorkflowStore` manages current workflow state
- `workflowVersion` counter tracks workflow replacements (increments on setWorkflow)
- Actions: `addTrigger`, `removeTrigger`, `addActivity`, `removeActivity`, `updateActivity`
- **Edge Synchronization Actions**: `syncJoinBranches`, `reorderActivitiesFromEdges`
- **Atomic Batch Operations**: `batchRemoveNodesAndEdges` for removing multiple nodes/edges atomically
- Located at `packages/nexus-ui/src/stores/useWorkflowStore.ts`
- Use selective subscriptions to avoid unnecessary re-renders

**Workflow Structure - Unified Approach:**

ALL workflows use a consistent flatten-on-load, nest-on-save pattern:

**API Format (Nested):**

- Activities can be nested within `sequence`, `loop`, `parallel`, or `condition` containers
- Workflow structure defines execution flow via nesting

**Builder Format (Flat):**

- ALL activities stored in flat `activities` array during editing
- Edges define ALL flow relationships (stored separately)
- Join nodes use auto-generated `parallel_for_${joinId}` containers
- Condition nodes have empty `then`/`else` arrays - edges encode branches

**Load Path (API → Builder):**

1. `loadWorkflow()` flattens ALL workflows via `WorkflowTransform.flatten()`
2. Extracts edges from nested structures (condition branches, sequence chains, etc.)
3. Stores flat activities + edges in workflow store

**Save Path (Builder → API):**

1. `buildNestedConditionStructure()` nests condition nodes only
2. Finds edges from condition's true/false handles
3. Recursively collects downstream activities into `then`/`else` arrays
4. Other structures (sequence/loop/parallel) saved as flat with edges

**Note:** sequence/loop/parallel containers are lossy - after flatten→nest, they become flat tasks with edges. This is acceptable as the semantic meaning (execution order) is preserved.

**Edge Synchronization:**

Critical hook: `useEdgeSynchronization` (`packages/nexus-ui/src/routes/builder/hooks/useEdgeSynchronization.ts`)

- Synchronizes ReactFlow edges with workflow store on every edge change
- Re-entrance guard prevents infinite loops from workflow → edge updates
- Calls synchronization pipeline on edge changes:
  1. `syncJoinBranches()` - Wraps parallel branches in parallel containers
  2. `reorderActivitiesFromEdges()` - Topologically sorts activities based on edges

**ButtonEdge Component:**

- Custom edge type for interactive workflow edges with add-node buttons
- Maintenance hook: `useButtonEdgeMaintenance` (`packages/nexus-ui/src/routes/builder/hooks/useButtonEdgeMaintenance.ts`)
- Automatically maintains button edges when nodes/edges change
- Creates button edges for all valid connection points in the workflow
- Works in coordination with edge synchronization system

**Join Node Pattern:**

- Join nodes reference other activities by ID in `join.branches: string[]`
- When 2+ activities connect to a join, auto-generates parallel container
- Parallel container ID: `parallel_for_${joinId}`
- `syncJoinBranches()` manages parallel creation/cleanup automatically
- Orphaned activities (edges removed) restored to main activities array

**Condition Node Pattern:**

- Condition nodes remain **flat during editing**, nested only on save
- During editing: All activities in flat array, edges encode branch relationships
- Edges with `sourceHandle='true'` connect to true branch, `sourceHandle='false'` to false branch
- Two handles on node: "True" and "False" for branching connections
- Condition node structure: `{ type: 'condition', then: Activity[], else: Activity[], condition: string }`

**Serialization workflow (Save → API):**

1. `buildNestedConditionStructure(activities, edges)` - Converts flat to nested
2. Finds edges from condition's true/false handles
3. Recursively collects all downstream activities for each branch
4. Moves them into then/else arrays
5. Handles parallel*for*\* wrappers (includes wrapper, not individual branches)
6. Located in `packages/nexus-ui/src/routes/builder/utils/buildNestedStructure.ts`

**Deserialization workflow (API → Edit):**

1. `generateEdgesFromStructure(activities)` - Extracts edges from nested structure
2. Creates edges from condition nodes to then/else activities
3. Handles parallel*for*\* wrappers (creates edges to branches, not wrapper)
4. `flattenConditionStructure(activities)` - Flattens nested structure
5. Recursively extracts nested activities to top level
6. Leaves condition nodes with empty then/else arrays
7. Located in `packages/nexus-ui/src/routes/builder/utils/flattenConditionStructure.ts` and `generateEdgesFromStructure.ts`

**Key implementation details:**

- Don't follow sequential edges from activities inside parallel wrappers (prevents including join nodes in branches)
- When activity is inside parallel*for*\* wrapper, include wrapper in then/else arrays
- Example flow: `Condition1 -> Task1 -> Condition2 -> Task3`
  - During edit: All four nodes in flat activities array, edges define relationships
  - On save: Task1, Condition2, and Task3 moved into Condition1's then array

**Builder Component Pattern:**

- Separate components for new (`BuilderNew.tsx`) and edit (`BuilderEdit.tsx`) workflows
- `BuilderContent` component encapsulates all shared UI logic
- `BuilderFlow.tsx` handles workflow → graph conversion and legacy detection
- `ReactFlowProvider` wraps the entire builder UI
- Routes: `/automation-builder/new` (new) and `/automation-builder/:workflowId` (edit)

### Component Development Guidelines

**CRITICAL: Always prioritize reusing and extending existing components from `nexus-ui-framework`**

Before writing any new UI code, follow this checklist:

1. **Check for Existing Components**
   - Search `packages/nexus-ui-framework/src/components/` for existing components
   - Review current components: Button, Alert, Switch, Table, Dialog, EmptyState, Menu, Tooltip, Checkbox, etc.
   - Verify if an existing component can be reused or extended

2. **Component Location Strategy**
   - **Reusable/Generic components** → `packages/nexus-ui-framework/src/components/`
   - **Application-specific components** → `packages/nexus-ui/src/components/`
   - When in doubt, prefer framework location for better reusability

3. **Building New Framework Components**
   - ALWAYS use `@base-ui-components/react` as the foundation
   - Build headless, accessible components following Base UI patterns
   - Include comprehensive tests (see existing `.test.tsx` files)
   - Export from `packages/nexus-ui-framework/src/index.tsx`

4. **Custom Hooks**
   - Extract reusable logic into custom hooks
   - Place hooks in `packages/nexus-ui-framework/src/hooks/` (create if needed)
   - Follow naming convention: `useXxx`
   - Include TypeScript types

5. **Code Abstraction**
   - Identify and eliminate redundant code patterns
   - Create shared utilities for common operations
   - Use composition over duplication
   - Follow DRY (Don't Repeat Yourself) principles

6. **React Best Practices**
   - Leverage React 19 features
   - Use functional components and hooks
   - Use proper TypeScript typing (avoid `any`)
   - Implement proper error boundaries
   - Follow component composition patterns
   - Use proper key props for lists
   - Prefer controlled components for forms (react-hook-form)
   - Use proper semantic HTML

**Example Workflow:**

```text
User Request: "Add a confirmation dialog"
Step 1: Check nexus-ui-framework for Dialog component ✓ (exists)
Step 2: Check for ConfirmDialog variant ✓ (exists)
Step 3: Use existing ConfirmDialog from framework
Result: No new code needed, use import from 'nexus-ui-framework'
```

### Critical Development Workflows

1. Dependency Management
   - `nexus-ui-framework` must be built before `nexus-ui`
   - Automatic rebuilds in watch mode
   - Hot reloading for framework changes

2. API Contract Generation
   - Types generated from external OpenAPI specs
   - Shared between UI and Mock API
   - Update via `npm run gen`

3. Mocking Approach
   - MSW (Mock Service Worker) for consistent API mocking
   - Enables uniform development and testing environments

## Development Constraints

### Technical Boundaries

- Node.js 22+ required
- TypeScript 5.9
- React 19
- Vite build system
- npm workspaces

### Port Configuration

- UI: <http://localhost:5173>
- Mock API: <http://localhost:3000>

## Deployment Considerations

- **Containerization**: Podman (local), Docker Buildx (CI/CD)
- **Multi-architecture**: Supports linux/amd64 and linux/arm64
- **Production build**: Nginx-based (UI), Node.js (Mock API)
- **Authentication**: Basic (demo/coffee)
- **Separate containers**: UI and Mock API
- **Build script**: `./build-multiarch.sh` for multi-arch Podman builds

### Container Commands

```bash
# Build containers
npm run podman:build                    # Build all containers
npm run podman:build:nexus-ui           # Build UI container only
npm run podman:build:nexus-mock-api     # Build mock API container only

# Run containers
npm run podman:run                      # Run all containers
npm run podman:run:nexus-ui             # Run UI on port 4000
npm run podman:run:nexus-mock-api       # Run API on port 3000

# Multi-arch builds
./build-multiarch.sh                    # Build for AMD64 + ARM64
./build-multiarch.sh push               # Build and push to registry
```

## Performance Notes

- React Compiler for automatic optimization
- Vite for rapid builds
- Lazy loading of routes/components
- Vitest for lightweight testing
