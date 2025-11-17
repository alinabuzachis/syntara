# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
- Located at `packages/nexus-ui/src/stores/useWorkflowStore.ts`
- Use selective subscriptions to avoid unnecessary re-renders

**Builder Component Pattern:**

- Separate components for new (`BuilderNew.tsx`) and edit (`BuilderEdit.tsx`) workflows
- `BuilderContent` component encapsulates all shared UI logic
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

## Performance Notes

- React Compiler for automatic optimization
- Vite for rapid builds
- Lazy loading of routes/components
- Vitest for lightweight testing
