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

## Architecture docs

For how the UI is structured (routing, backend requests/data, and how backend workflow nodes become React Flow nodes), see:

- `docs/architecture.md`
- `docs/zustand-architecture.md` (workflow store details)

If you’re working on the workflow builder, the highest-signal sections are in `docs/architecture.md`:

- **“How `registerAllNodes()` auto-discovers nodes”** (node registry auto-discovery + file patterns)
- **“Builder internals (advanced): registry, edges, and graph semantics”** (ButtonEdge, edge sync, joins/conditions, transform pipeline)

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

### Code Review: Spotting Abstraction Opportunities

**CRITICAL: Before implementing new features or during code review, actively look for patterns that indicate abstraction opportunities.**

#### Pattern Recognition Checklist

| Pattern Detected                      | Action Required                                 |
| ------------------------------------- | ----------------------------------------------- |
| **Repeated JSX structure** (2+ times) | → Create a **Component**                        |
| **Repeated logic/state** (2+ times)   | → Create a **Hook**                             |
| **Repeated utility functions**        | → Create a **shared utility**                   |
| **Similar components with variants**  | → Extend existing component with props/variants |

#### JSX Repetition → Component

**Signs you need a component:**

- Same JSX structure appears in multiple files
- Copy-pasted markup with minor variations
- Similar styling patterns repeated

```tsx
// ❌ BAD: Repeated JSX pattern
<div className="glass rounded-lg p-4">
  <h3 className="text-lg font-bold">{title1}</h3>
  <p className="text-white/60">{description1}</p>
</div>
<div className="glass rounded-lg p-4">
  <h3 className="text-lg font-bold">{title2}</h3>
  <p className="text-white/60">{description2}</p>
</div>

// ✅ GOOD: Extract to component
<InfoCard title={title1} description={description1} />
<InfoCard title={title2} description={description2} />
```

#### Logic Repetition → Hook

**Signs you need a hook:**

- Same useState + useEffect pattern repeated
- Identical data fetching logic
- Common event handling patterns
- Shared form validation logic

```tsx
// ❌ BAD: Repeated logic in multiple components
const [search, setSearch] = useState('')
const fuse = new Fuse(items, { keys: ['name'] })
const filtered = search ? fuse.search(search).map((r) => r.item) : items

// ✅ GOOD: Extract to hook
const { search, setSearch, items: filtered } = useFuse(items, ['name'])
```

#### Review Questions to Ask

When reviewing code, always ask:

1. **"Have I seen this JSX pattern before?"**
   - Search codebase for similar structures
   - Check if a framework component already exists
   - Consider if it belongs in `nexus-ui-framework`

2. **"Is this logic reusable?"**
   - Would other components benefit from this?
   - Is there already a hook for this in the codebase?
   - Should this be a framework-level hook?

3. **"Can I extend an existing component?"**
   - Does a similar component exist with different variants?
   - Can I add a prop instead of creating new component?
   - Would PatternFly variants or modifiers solve this?

#### Migration Triggers

Proactively identify migration opportunities:

```text
Codebase Search Patterns:
- Search for duplicate className patterns
- Look for repeated useState/useEffect combinations
- Find similar component structures across routes
- Check for copy-pasted utility functions
```

**When to migrate to framework:**

- Component used in 2+ unrelated features
- Hook provides generic, reusable functionality
- Pattern is not domain-specific to nexus-ui

### Testing Guidelines

#### Core Principle: Test Behavior, Not Implementation

Write tests that verify **what** your code does, not **how** it does it. Tests should survive refactoring.

#### AAA Pattern (Arrange-Act-Assert)

Structure every test with three phases:

```typescript
it('increments counter when button clicked', async () => {
  // Arrange - Set up test data and render
  const user = userEvent.setup()
  render(<Counter initialValue={0} />)

  // Act - Perform the action
  await user.click(screen.getByRole('button', { name: 'Increment' }))

  // Assert - Verify the outcome
  expect(screen.getByText('Count: 1')).toBeInTheDocument()
})
```

#### What to Test

| Type          | Focus On                                                |
| ------------- | ------------------------------------------------------- |
| **Component** | User interactions, conditional rendering, accessibility |
| **Hook**      | Return values, state transitions, callback invocations  |
| **Store**     | Actions modify state correctly, edge cases              |
| **Utility**   | Input → output transformations, boundary conditions     |

#### What NOT to Test

- Implementation details (internal state, private methods)
- Third-party library behavior
- Static content that doesn't change

#### Quick Reference

- **Components**: Use `render()`, `screen`, `userEvent` from Testing Library
- **Hooks**: Use `renderHook()` and wrap state changes in `act()`
- **Stores**: Reset state in `beforeEach`, test via `getState()` and actions
- **Mocking**: Use `vi.fn()` for callbacks, `vi.mock()` for modules

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
