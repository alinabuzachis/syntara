# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Claude Agent Instructions

Claude, you have access to the following skills. Use them when appropriate:

- See `.claude/skills/pr_review.md` for PR review steps

## Essential Commands

```bash
# Development
npm start                  # Start all services (UI, mock API)
npm run start:nexus-ui     # Start UI only
npm run start:nexus-mock-api # Start mock API only

# Testing
npm test                   # Run all tests
npm run test:nexus-ui      # Run UI package tests
npm run test:coverage      # Run tests with coverage report
npm run test:ui            # Interactive test UI (Vitest UI)
npm run test:browser       # Run browser mode tests (Playwright)
npm run test:browser:ui    # Browser tests with Vitest UI
npm run test:browser:headed # Browser tests visible (not headless)

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

## Architecture Documentation

For how the UI is structured, see these comprehensive guides:

- [`docs/architecture.md`](docs/architecture.md) - Main architecture guide covering routing, state management, and the workflow builder
- [`docs/data-flow.md`](docs/data-flow.md) - Deep dive into OpenAPI contract generation, type-safe API clients, and workflow transformations (nested ↔ flat)
- [`docs/zustand-architecture.md`](docs/zustand-architecture.md) - Workflow store details, state management patterns, and best practices
- [`docs/websocket-architecture.md`](docs/websocket-architecture.md) - WebSocket infrastructure, multi-channel architecture, and real-time features
- [`docs/execution-visualizer-protocol.md`](docs/execution-visualizer-protocol.md) - **NEW!** Execution visualizer WebSocket protocol, endpoints, and data structures

### Quick Navigation by Task

| Working on...                  | Read this section                                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **API integration**            | [`docs/data-flow.md`](docs/data-flow.md) - OpenAPI contract generation and type-safe clients                                 |
| **Workflow transformations**   | [`docs/data-flow.md`](docs/data-flow.md) - Nested to flat conversions with diagrams                                          |
| **Node registry**              | [`docs/architecture.md`](docs/architecture.md) - "How registerAllNodes() auto-discovers nodes"                               |
| **Builder internals**          | [`docs/architecture.md`](docs/architecture.md) - "Builder internals (advanced)" section                                      |
| **State management**           | [`docs/zustand-architecture.md`](docs/zustand-architecture.md) - Complete Zustand guide                                      |
| **WebSocket / real-time**      | [`docs/websocket-architecture.md`](docs/websocket-architecture.md) - Multi-channel WebSocket infrastructure                  |
| **Execution visualization** 🆕 | [`docs/execution-visualizer-protocol.md`](docs/execution-visualizer-protocol.md) - WebSocket protocol, endpoints, data specs |

### Component Development Guidelines

**CRITICAL: Always prioritize using PatternFly components directly**

Before writing any new UI code, follow this checklist:

1. **Check for Existing Components**
   - Search `packages/nexus-ui/src/components/` for existing application-specific components
   - Check PatternFly documentation for available components: Button, Alert, Switch, Table, Dialog, EmptyState, Menu, Tooltip, Checkbox, etc.
   - Verify if a PatternFly component or existing app component can be reused or extended

2. **Component Location Strategy**
   - **Application-specific components** → `packages/nexus-ui/src/components/`
   - Use PatternFly components directly from `@patternfly/react-core` and related packages
   - When in doubt, prefer PatternFly components over custom implementations

3. **Building New Components**
   - ALWAYS use PatternFly components as the foundation
   - Build accessible components following PatternFly patterns and design system
   - Include comprehensive tests (see existing `.test.tsx` files)
   - Place in `packages/nexus-ui/src/components/` for app-specific components

4. **Custom Hooks**
   - Extract reusable logic into custom hooks
   - Place hooks in `packages/nexus-ui/src/hooks/` (create if needed)
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
Step 1: Check PatternFly for Dialog/Modal component ✓ (exists)
Step 2: Check app components for ConfirmDialog variant ✓ (may exist)
Step 3: Use PatternFly Modal or existing app component
Result: Use PatternFly Modal component or extend existing app component
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
   - Check if a PatternFly component or existing app component already exists
   - Consider if it should be an app-specific component or use PatternFly directly

2. **"Is this logic reusable?"**
   - Would other components benefit from this?
   - Is there already a hook for this in the codebase?
   - Should this be extracted to a shared hook?

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

**When to extract to shared components:**

- Component used in 2+ unrelated features
- Hook provides generic, reusable functionality
- Pattern is not domain-specific to nexus-ui

### Internationalization (i18n) Guidelines

**CRITICAL: Never use user-facing translatable strings in conditional logic or comparisons.**

User-facing strings that will be translated should only be used for display purposes. Using them in logic creates bugs when the application is localized to other languages.

#### Anti-Pattern: Comparing Display Strings

```typescript
// ❌ BAD: Using translatable string in logic
const cadence = durationToHumanReadableCadence(parsed.cadence)
if (cadence !== 'Does not repeat') {
  // This breaks when translated to other languages
  parts.push(`Repeats ${cadence.toLowerCase()}`)
}

// ❌ BAD: Using label text in comparisons
if (label === 'Active') {
  // Breaks in non-English locales
  return 'success'
}
```

#### Correct Patterns

##### 1. Compare Raw/Internal Values

```typescript
// ✅ GOOD: Check the raw value before translation
if (parsed.cadence) {
  // parsed.cadence is the ISO duration like 'P1D', not 'Daily'
  parts.push(`Repeats ${cadence.toLowerCase()}`)
}

// ✅ GOOD: Use enum/constant values from API
if (status === 'active') {
  // 'active' is from API contract, not a display string
  return 'success'
}
```

##### 2. Use TypeScript Enums or Union Types

```typescript
// ✅ GOOD: Define internal constants separate from display
type CadenceValue = 'none' | 'daily' | 'weekly' | 'monthly' | 'annually'

// Compare internal values
if (cadence === 'daily') {
  return 'P1D'
}

// Map to display strings separately
const cadenceLabels: Record<CadenceValue, string> = {
  none: 'Does not repeat',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  annually: 'Annually',
}
```

##### 3. Use Value-to-Label Mapping

```typescript
// ✅ GOOD: Separate logic values from display labels
const statusMap: Record<StatusValue, { label: string; variant: 'success' | 'danger' }> = {
  approved: { label: 'Approved', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'danger' },
  pending: { label: 'Pending', variant: 'warning' },
}

// Use the value for logic
const config = statusMap[apiStatus]
```

#### Allowed String Comparisons

These types of strings are **safe** to use in logic (they won't be translated):

- **API contract values**: `type === 'converge'`, `status === 'success'`, `executor === 'script'`
- **TypeScript enum values**: `nodeType === NodeType.Task`
- **Internal constants**: `mode === 'development'`, `edge.type === 'buttonEdge'`
- **Technical identifiers**: `file.endsWith('.tsx')`, `id.startsWith('parallel_')`

#### Quick Checklist

Before writing conditional logic with strings:

1. ✅ Is this string from an API response or TypeScript type? → **Safe to use**
2. ✅ Is this an internal constant/identifier? → **Safe to use**
3. ❌ Is this string shown to users in the UI? → **Do NOT use in logic**
4. ❌ Would this string be translated to other languages? → **Do NOT use in logic**

### Testing Guidelines

#### Core Principle: Test Behavior, Not Implementation

Write tests that verify **what** your code does, not **how** it does it. Tests should survive refactoring.

#### Coverage Requirements

**All new and modified files must meet 80% coverage threshold** across:

- **Statements**: 80%
- **Branches**: 80%
- **Functions**: 80%
- **Lines**: 80%

This is enforced incrementally - existing files can improve gradually, but new code should meet the standard.

**Coverage enforcement:**

Coverage is enforced on changed files in PRs via `scripts/check-pr-coverage.js`. Run locally:

```bash
npm run test:coverage        # Generate coverage report
npm run test:coverage:check  # Check coverage for changed files (fails if <80%)
```

CI automatically runs this check and **blocks PRs** where changed source files have less than 80% line coverage.

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

#### Test Modes: jsdom vs Browser Mode

**Default (jsdom)** - Fast, lightweight for most tests:

- File naming: `*.test.ts` or `*.test.tsx`
- Use for: Component rendering, user interactions, form validation, hooks, utilities
- Environment: Simulated DOM via jsdom

**Browser Mode** - Real browser for specific needs:

- File naming: `*.browser.test.tsx`
- Use for: IntersectionObserver, ResizeObserver, Canvas API, real layout calculations
- Environment: Chromium via Playwright
- Commands:
  - `npm run test:browser` - Run headless
  - `npm run test:browser:headed` - Watch in browser
  - `npm run test:browser:ui` - Vitest UI

**When to use browser mode:**

- Testing components that use IntersectionObserver, ResizeObserver, MutationObserver
- Canvas/WebGL rendering
- Accurate layout/positioning with getBoundingClientRect
- Real drag-and-drop with DataTransfer API
- Screenshot/visual regression testing
- Testing focus management and keyboard navigation that requires real browser behavior
- Components that rely on CSS-driven behavior (animations, transitions, media queries)

**Default to jsdom** unless you specifically need browser APIs - it's much faster.

**Why the distinction matters:**

- jsdom/happy-dom **simulate** browser behavior in Node.js but can produce false positives/negatives
- Browser mode runs tests in **real browsers** for accurate, reliable results
- Trade-off: Browser mode is slower to start but eliminates simulation gaps
- See [Vitest Browser Mode docs](https://vitest.dev/guide/browser/) and [Why Browser Mode](https://vitest.dev/guide/browser/why.html) for details

**Example - When Browser Mode is Required:**

```typescript
// ✅ Use browser mode for IntersectionObserver
// File: LazyImage.browser.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import { expect, test } from 'vitest'
import { LazyImage } from './LazyImage'

test('loads image when scrolled into view', async () => {
  render(<LazyImage src="/image.jpg" alt="Lazy loaded" />)

  const img = screen.getByAltText('Lazy loaded')

  // Scroll element into view - IntersectionObserver needs real browser
  img.scrollIntoView()

  await waitFor(() => {
    expect(img).toHaveAttribute('src', '/image.jpg')
  })
})
```

**Example - When jsdom is Sufficient:**

```typescript
// ✅ Use jsdom for user interactions and state changes
// File: Counter.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { Counter } from './Counter'

test('increments count on button click', async () => {
  const user = userEvent.setup()
  render(<Counter />)

  await user.click(screen.getByRole('button', { name: /increment/i }))

  expect(screen.getByText('Count: 1')).toBeInTheDocument()
})
```

**Decision Tree:**

```text
Does the component use browser-specific APIs?
├─ Yes → Use browser mode (*.browser.test.tsx)
│  └─ Examples: IntersectionObserver, ResizeObserver, Canvas, real layout
└─ No → Use jsdom (*.test.tsx)
   └─ Examples: Rendering, clicks, state, forms, most user interactions
```

#### What to Test

| Type          | Focus On                                                | Coverage Target |
| ------------- | ------------------------------------------------------- | --------------- |
| **Component** | User interactions, conditional rendering, accessibility | 80%+            |
| **Hook**      | Return values, state transitions, callback invocations  | 80%+            |
| **Store**     | Actions modify state correctly, edge cases              | 80%+            |
| **Utility**   | Input → output transformations, boundary conditions     | 90%+            |

#### What NOT to Test

- Implementation details (internal state, private methods)
- Third-party library behavior
- Static content that doesn't change
- Generated files (`**/*.d.ts`, `**/mockData`, API contracts)

#### Quick Reference

- **Components**: Use `render()`, `screen`, `userEvent` from Testing Library
- **Hooks**: Use `renderHook()` and wrap state changes in `act()`
- **Stores**: Reset state in `beforeEach`, test via `getState()` and actions
- **Mocking**: Use `vi.fn()` for callbacks, `vi.mock()` for modules

#### Industry Best Practices for Test Coverage

**Bare Minimum (80%):**

- **Happy path**: Test the most common user flow
- **Error cases**: Test at least one error scenario
- **Edge cases**: Test boundary conditions (empty, null, max values)
- **User interactions**: Test all clickable elements and form inputs

**Example - Button Component:**

```typescript
// ✅ Meets 80% threshold
describe('Button', () => {
  it('renders with label', () => {
    /* ... */
  }) // Happy path
  it('calls onClick when clicked', () => {
    /* ... */
  }) // Interaction
  it('renders as disabled when disabled prop', () => {}) // Edge case
  it('shows loading state', () => {
    /* ... */
  }) // State variation
})
```

**Why 80%?**

- Industry standard (Google, Airbnb, Netflix use 80-90%)
- Catches most bugs without diminishing returns
- Balances thoroughness with development velocity
- Forces testing of critical paths without testing getters/setters

### Critical Development Workflows

1. Dependency Management
   - PatternFly components are consumed directly from npm packages
   - Automatic rebuilds in watch mode
   - Hot reloading for component changes

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
- WebSocket: `ws://localhost:8000` (real backend) or via mock API

### Demo Pages

- **WebSocket Demo**: <http://localhost:5173/demo-ws> — Test WebSocket channels (Coffee, Chat, Agent Events, Tokens)

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
