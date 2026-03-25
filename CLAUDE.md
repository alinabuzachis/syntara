# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Claude Agent Instructions

Claude, you have access to the following skills. Use them when appropriate:

- See `.claude/skills/pr_review.md` for PR review steps

### Accessibility review (always)

Treat accessibility as part of every UI change, not an optional follow-up:

- **While implementing**: Prefer semantic HTML and PatternFly patterns; meaningful labels, names, and roles; keyboard operability where there is interactivity; do not rely on color alone for meaning.
- **While reviewing** (code or PR): Check new or changed UI for the above, for `eslint-plugin-jsx-a11y` / Testing Library expectations, and for tests (`vitest-axe` where appropriate). Flag regressions and missing coverage.

See **Accessibility Testing** in this file for project tooling (ESLint, axe, E2E).

### TypeScript and ESLint Guardrails

**CRITICAL: Always follow TypeScript best practices and do not introduce new ESLint warnings.**

- **TypeScript first**: Prefer strict, explicit typing and type-safe patterns. Avoid `any`, avoid unsafe casts unless absolutely necessary, and use existing shared types or contract types whenever possible.
- **Respect existing lint rules**: New or modified code should not add fresh ESLint warnings or errors, even in areas where older warnings still exist.
- **Leave files no worse than you found them**: If you touch a file, avoid increasing its warning count. When practical, reduce nearby warnings as part of the change.
- **Refactor instead of suppressing**: Prefer clearer control flow, smaller functions, extracted helpers, and stronger types over disabling rules.
- **Validate before finishing**: After substantive edits, run the relevant lint/type-check commands for the affected package and fix any issues introduced by the change.

### Pull Request Rules

All changes must follow the PR sizing and slicing policy defined in [`.github/PR_GUIDELINES.md`](.github/PR_GUIDELINES.md).

Before writing code:

1. Read the PR sizing rules
2. Propose a stacked PR plan
3. Ensure each PR fits within the limits
4. Only implement the first PR unless asked otherwise

### Documentation Must Stay in Sync with Code

**CRITICAL: Documentation must always reflect the current state of the codebase.**

- **When adding or changing code**: Review all related documentation (`docs/`, `README.md`, `CLAUDE.md`, `DEVELOPER_GUIDE.md`, `CONTRIBUTING.md`, and any in-source `README.md` files) and update them to reflect the change. New features, renamed files, changed APIs, removed dependencies, or altered behavior must be documented immediately — not deferred.
- **During code review**: Verify that documentation is accurate and consistent with the code being reviewed. Flag any PR that changes behavior without updating the corresponding docs.
- **What to check**: Architecture docs, API client references, tech stack lists, command examples, file path references, code examples, cross-document links, and any "How to" guides.
- **No stale docs**: If a document references a file, dependency, function, or pattern that no longer exists, fix it or remove the reference. Dead links and outdated examples erode trust in the documentation.

## Essential Commands

```bash
# Development
npm start                  # Start all services (UI, mock API)
npm run start:ui           # Start UI only
npm run start:mock-api     # Start mock API only

# Testing
npm test                    # Run all tests
npm run test:ui             # Run UI package tests
npm run e2e                 # Run e2e playwright tests
npm run e2e:ui              # Run e2e playwright tests in the playwright UI

# Run a specific test or coverage (from packages/nexus-ui)
cd packages/nexus-ui
npm run vitest -- path/to/specific/test.test.ts
npm run test:coverage       # Run tests with coverage report
npm run test:coverage:check # Check coverage meets 80% threshold

# Build
npm run build              # Build UI package
npm run gen                # Regenerate API contracts

# Code Quality
npm run format             # Format code
npm run format:check       # Check formatting
cd packages/nexus-ui && npm run lint   # Run ESLint
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
- [`docs/execution-visualizer-protocol.md`](docs/execution-visualizer-protocol.md) - Execution visualizer WebSocket protocol, endpoints, and data structures
- [`.github/PR_GUIDELINES.md`](.github/PR_GUIDELINES.md) - PR sizing, stacking strategy, and change isolation rules

### Quick Navigation by Task

| Working on...                | Read this section                                                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **API integration**          | [`docs/data-flow.md`](docs/data-flow.md) - OpenAPI contract generation and type-safe clients                                 |
| **Workflow transformations** | [`docs/data-flow.md`](docs/data-flow.md) - Nested to flat conversions with diagrams                                          |
| **Node registry**            | [`docs/architecture.md`](docs/architecture.md) - "How registerAllNodes() auto-discovers nodes"                               |
| **Builder internals**        | [`docs/architecture.md`](docs/architecture.md) - "Builder internals (advanced)" section                                      |
| **State management**         | [`docs/zustand-architecture.md`](docs/zustand-architecture.md) - Complete Zustand guide                                      |
| **WebSocket / real-time**    | [`docs/websocket-architecture.md`](docs/websocket-architecture.md) - Multi-channel WebSocket infrastructure                  |
| **Execution visualization**  | [`docs/execution-visualizer-protocol.md`](docs/execution-visualizer-protocol.md) - WebSocket protocol, endpoints, data specs |
| **PR sizing / stacking**     | [`.github/PR_GUIDELINES.md`](.github/PR_GUIDELINES.md) - Budget, stacked PR strategy, stop rules                             |

### Quick Reference: Common Tasks

**New to the codebase?** Here's how to do the most common development tasks:

#### How do I add a new node type to the workflow builder?

1. Create file: `packages/nexus-ui/src/routes/builder/registry/nodes/registerMyNode.ts`
2. Define your registration function (must be a **default export**):

   ```typescript
   import { RhUiMyIcon } from '@patternfly/react-icons'
   import { NodeRegistry } from '../NodeRegistry'
   import { useWorkflowStore } from '../../../../stores/useWorkflowStore'
   import { createScriptActivity } from '../../../../stores/workflowFactories'
   import { MyNodeForm } from '../../node-forms/MyNodeForm'
   import { buildNamedActivity } from '../../utils/nodeCreationHelpers'
   import { getDefaultNodeBaseName } from '../../utils/nodeNaming'

   export default function registerMyNode() {
     NodeRegistry.register({
       id: 'my-node',
       label: 'My Node',
       icon: RhUiMyIcon,
       category: 'action',
       description: 'Does something useful',
       formComponent: MyNodeForm,
       onSubmit: (data, onSuccess, onError) => {
         try {
           const baseName = getDefaultNodeBaseName('my-node')
           const { activityId, activity } = buildNamedActivity(baseName, data.name, (id, name) =>
             createScriptActivity(id, name, data.language ?? 'python', data.code ?? '')
           )
           useWorkflowStore.getState().addActivity(activity)
           onSuccess(activityId)
         } catch (error) {
           onError(error instanceof Error ? error.message : 'Failed to add node')
         }
       },
     })
   }
   ```

3. That's it! The `registerAllNodes()` auto-discovery finds files matching `register*.ts` pattern
4. See: [`docs/architecture.md`](docs/architecture.md) - "How registerAllNodes() auto-discovers nodes" for details

#### How do I add a new node form (with Zod)?

1. Create a schema file next to your form: `packages/nexus-ui/src/routes/builder/node-forms/myNodeFormSchema.ts` — define shape and validation with `z.object()` (use `.superRefine()` for conditional rules, or `z.discriminatedUnion()` for executor-type-style forms). Export the schema and `type MyFormData = z.infer<typeof myNodeFormSchema>`. Import `z` from `'zod'`.
2. For optional number fields (timeout units, max count, etc.) use `optionalNumber` from `./shared/formSchemaUtils` so empty `valueAsNumber` inputs (NaN) validate
3. In your form component: `useForm<MyFormData>({ resolver: zodResolver(myNodeFormSchema, undefined, { mode: 'sync' }), defaultValues })` — import `zodResolver` from `./shared/formSchemaUtils`
4. Keep using `useFormMutationErrorHandler(setError)` for API 422 field errors; Zod handles client-side only. See: [`docs/error-handling.md`](docs/error-handling.md) - "Client-side validation (Zod + @hookform/resolvers)"

#### How do I make API calls?

Use the type-safe clients from `client.tsx`:

```typescript
import { workflowClient } from '../client'

// In a component:
const { data, isLoading, error } = workflowClient.useQuery('get', '/workflows')

// Mutation:
const { mutate } = workflowClient.useMutation('post', '/workflows')
mutate({
  /* workflow data */
})
```

See: [`docs/data-flow.md`](docs/data-flow.md) - "Type-Safe API Clients"

#### How do I add a new route?

1. Add route constant to `packages/nexus-ui/src/app/AppRoute.tsx`
2. Add navigation item to `packages/nexus-ui/src/app/navigationItems.tsx` with lazy-loaded component
3. The router auto-discovers it from `navigationItems` - no manual route config needed

#### What is the default workflow name for new workflows?

New workflows use the default name **`new-workflow`**, defined as `DEFAULT_WORKFLOW_NAME` in `packages/nexus-ui/src/routes/builder/utils/workflowNaming.ts`. If that name already exists, the UI assigns `new-workflow-1`, `new-workflow-2`, and so on. Use the constant and `getNextDefaultWorkflowName()` when computing or displaying default names; the list query used to detect conflicts is in `workflowListQuery.ts`.

#### How do I debug the workflow builder?

- **React DevTools**: Use the React DevTools browser extension to inspect component props and Zustand state
- **Direct state inspection**: Call `useWorkflowStore.getState()` in the browser console to inspect the current workflow store
- **Common issues**:
  - Nodes not appearing → Check `NodeRegistry` has your node type
  - Edges not connecting → Verify handle IDs match (sourceHandle/targetHandle)
  - State not updating → Check Zustand store actions are called

#### How do I handle errors from API calls?

Always use error utilities:

```typescript
import { getErrorMessage } from '../utils/apiErrors'
import { useMutationErrorHandler } from '../hooks/useMutationErrorHandler'

// For queries:
const queryState = useQueryState(query, { title: 'Error loading data' })

// For mutations:
const handleError = useMutationErrorHandler()
mutate(data, {
  onError: handleError({ title: 'Failed to save' }),
})
```

See: [`docs/error-handling.md`](docs/error-handling.md) for complete error handling patterns

#### How do I format dates for display?

Use the shared date utilities (date-fns) in `packages/nexus-ui/src/utils/dateUtils.ts`:

- **formatDate(isoString)** — e.g. "Jan 15, 2024"
- **formatTime(isoString)** — 12-hour time, e.g. "2:30 PM"
- **formatDateTime(isoString?)** — medium date + short time (returns `'-'` for invalid/empty)
- **formatElapsedTime(elapsedMs)** — e.g. "1h 2m 3s"

Use for UI display only, not in logic (per i18n guidelines). Trigger-specific interval formatting stays in `utils/triggerFormatting.ts`.

#### How do I run tests for my changes?

```bash
# Run all tests (from root)
npm test

# Run specific test file (from packages/nexus-ui)
cd packages/nexus-ui
npm run vitest -- path/to/MyComponent.test.tsx

# Run with coverage (from packages/nexus-ui)
npm run test:coverage

# Check if your changes meet coverage threshold (from packages/nexus-ui)
npm run test:coverage:check
```

**Coverage requirement**: All new/modified code must meet 80% coverage (lines, statements, functions, branches)

### Component Development Guidelines

#### PatternFly First

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
   - For PatternFly form controls (TextInput, TextArea, FormSelect, FormGroup), use `validated={hasError ? 'error' : 'default'}` so the non-error state is explicit; do not use `undefined` for the default case

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

#### Enum Checklist

Before writing conditional logic with strings:

1. ✅ Is this string from an API response or TypeScript type? → **Safe to use**
2. ✅ Is this an internal constant/identifier? → **Safe to use**
3. ❌ Is this string shown to users in the UI? → **Do NOT use in logic**
4. ❌ Would this string be translated to other languages? → **Do NOT use in logic**

### Prefer Enum Constants Over String Literals

**CRITICAL: Use centralized enum constants instead of string literals for discriminators and identifiers to prevent typos.**

String literals in comparisons and assignments are error-prone. A single typo in a string comparison (`activity.type === 'converge'` vs `activity.type === 'convege'`) will silently fail without any TypeScript error, leading to bugs that are hard to track down.

#### Why Use Enum Constants

**Problem with string literals:**

```typescript
// ❌ BAD: Typo-prone, no compile-time safety
if (activity.type === 'condition') {
  // ✓ works
  // ...
}
if (activity.type === 'condtion') {
  // ✗ typo! No TypeScript error
  // This condition will never match - silent bug
}

// ❌ BAD: Inconsistent casing
if (edge.sourceHandle === 'Loop') {
  // ✗ Should be 'loop'
  // Never matches - silent bug
}
```

**Solution with enum constants:**

```typescript
// ✅ GOOD: TypeScript catches typos at compile time
if (activity.type === ActivityTypeEnum.CONDITION) {
  // ✓ autocomplete + type checking
  // ...
}
if (activity.type === ActivityTypeEnum.CONDTION) {
  // ✗ TypeScript error!
  // Property 'CONDTION' does not exist
}
```

#### Available Enum Constants

The codebase provides centralized enum constants in `@ansible/nexus-contracts`:

```typescript
import { ActivityTypeEnum, TriggerTypeEnum, ExecutorTypeEnum, EdgeHandleEnum } from '@ansible/nexus-contracts'

// Activity types
ActivityTypeEnum.TASK // 'task'
ActivityTypeEnum.PARALLEL // 'parallel'
ActivityTypeEnum.SEQUENCE // 'sequence'
ActivityTypeEnum.CONDITION // 'condition'
ActivityTypeEnum.LOOP // 'loop'
ActivityTypeEnum.CONVERGE // 'converge'
ActivityTypeEnum.APPROVAL // 'approval'

// Trigger types
TriggerTypeEnum.MANUAL // 'manual'
TriggerTypeEnum.SCHEDULED // 'scheduled'
TriggerTypeEnum.EVENT // 'event'

// Executor types
ExecutorTypeEnum.SCRIPT // 'script'
ExecutorTypeEnum.API // 'api'
ExecutorTypeEnum.AGENTIC // 'agentic'
ExecutorTypeEnum.CONNECTOR // 'connector'
ExecutorTypeEnum.AAP_JOB_TEMPLATE // 'aap_job_template'

// Edge handles
EdgeHandleEnum.SOURCE // 'source'
EdgeHandleEnum.TARGET // 'target'
EdgeHandleEnum.LOOP // 'loop'
EdgeHandleEnum.DONE // 'done'
EdgeHandleEnum.END // 'end'
EdgeHandleEnum.TRUE // 'true'
EdgeHandleEnum.FALSE // 'false'
EdgeHandleEnum.APPROVED // 'approved'
EdgeHandleEnum.REJECTED // 'rejected'
```

#### When to Use Enum Constants

**Always use enum constants for:**

1. **Type discriminators** - `activity.type`, `trigger.type`, `task.executor`
2. **Handle identifiers** - `edge.sourceHandle`, `edge.targetHandle`
3. **Type assignments** - Creating new activities, edges, triggers
4. **Switch statements** - Pattern matching on discriminated unions

**Examples:**

```typescript
// ✅ GOOD: Comparisons
if (activity.type === ActivityTypeEnum.LOOP) {
  // ...
}

if (edge.sourceHandle === EdgeHandleEnum.LOOP) {
  // ...
}

switch (activity.type) {
  case ActivityTypeEnum.CONDITION:
    return handleCondition(activity)
  case ActivityTypeEnum.LOOP:
    return handleLoop(activity)
}

// ✅ GOOD: Assignments
const activity = {
  type: ActivityTypeEnum.TASK,
  id: generateId(),
  name: 'My Task',
}

const edge = {
  source: nodeId,
  target: targetId,
  sourceHandle: EdgeHandleEnum.LOOP,
  targetHandle: EdgeHandleEnum.END,
}

// ✅ GOOD: Function parameters
function createEdge(sourceHandle: string = EdgeHandleEnum.SOURCE) {
  // ...
}
```

#### Benefits

1. **Autocomplete** - IDE suggests available values
2. **Type safety** - TypeScript catches typos at compile time
3. **Refactoring** - Rename all usages in one place
4. **Documentation** - Single source of truth for valid values
5. **Consistency** - Prevents case mismatches (`'Loop'` vs `'loop'`)

#### Quick Checklist

Before writing a string comparison or assignment:

1. ❓ Is this a type discriminator, handle identifier, or status value?
2. ✅ If yes → Check if an enum constant exists (ActivityTypeEnum, TriggerTypeEnum, etc.)
3. ✅ If enum exists → Use it instead of string literal
4. ❌ If no enum exists → Consider creating one if the value is reused

### Code Readability Enforcement

ESLint enforces readability constraints that keep functions small, files focused, and logic simple. All are set to `error` — CI will block violations. **New code must respect these limits.**

These thresholds are based on industry standards (Code Complete, SonarQube, BiomeJS):

| Rule                     | Limit              | Purpose & Research Basis                                                 |
| ------------------------ | ------------------ | ------------------------------------------------------------------------ |
| `max-lines`              | 500 lines/file     | One responsibility per file                                              |
| `max-lines-per-function` | 200 lines/function | Maintainability degrades beyond ~200 lines (Code Complete, SonarQube)    |
| `complexity`             | 20 (cyclomatic)    | Balanced threshold used by many enterprise configs; catches complex code |
| `max-depth`              | 4 levels           | Use early returns, not pyramids                                          |
| `max-params`             | 5 parameters       | Use a typed options object for 6+ params                                 |
| `max-nested-callbacks`   | 4 levels           | Flatten with named functions or async/await                              |

Additional code quality rules (enforced as `error` — CI will block violations):

| Rule                                             | What it enforces                                             |
| ------------------------------------------------ | ------------------------------------------------------------ |
| `@typescript-eslint/prefer-optional-chain`       | Use `a?.b?.c` instead of `a && a.b && a.b.c`                 |
| `@typescript-eslint/prefer-nullish-coalescing`   | Use `??` instead of `\|\|` to avoid bugs with `0`/`''`       |
| `@typescript-eslint/require-array-sort-compare`  | Require a compare function for `Array.sort()`                |
| `@typescript-eslint/switch-exhaustiveness-check` | Ensure all union/enum cases are handled in switch statements |
| `@typescript-eslint/prefer-includes`             | Use `.includes()` instead of `.indexOf() !== -1`             |
| `react-hooks/exhaustive-deps`                    | Require all dependencies in React hook dependency arrays     |
| `react/jsx-no-useless-fragment`                  | Remove unnecessary `<>{child}</>` wrappers                   |
| `react/no-array-index-key`                       | Avoid using array index as React `key` prop                  |
| `react/self-closing-comp`                        | Use `<Icon />` instead of `<Icon></Icon>`                    |
| `unicorn/no-nested-ternary`                      | Prevent unreadable nested ternary expressions                |
| `import-x/no-cycle`                              | Detect circular dependencies (max depth: 2)                  |
| `import-x/no-self-import`                        | Catch accidental self-imports                                |

Blank lines and comments are excluded from counts. Test files are exempt from size limits and complexity.

**Refactoring strategies when a limit is hit:**

- **Long function** → Extract sub-components, custom hooks, or helper functions
- **Deep nesting** → Early returns / guard clauses
- **High complexity** → Split into predicate functions or lookup tables
- **Many params** → Group into `{ options }` object with a TypeScript type
- **Large file** → Split into co-located modules (e.g., `utils.ts`, `hooks.ts`, sub-components)

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

Coverage is enforced on changed files in PRs via `scripts/check-pr-coverage.js`. Run locally from `packages/nexus-ui`:

```bash
cd packages/nexus-ui
npm run test:coverage        # Generate coverage report
npm run test:coverage:check  # Check coverage for changed files (fails if below 80%)
```

CI automatically runs this check and **blocks PRs** where any changed source file falls below 80% on any of the four metrics (lines, statements, functions, branches). All new and modified source files must meet the threshold to merge.

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

**Playwright E2E** - Full workflow tests in real browser:

- File naming: `*.spec.ts` under `packages/nexus-ui/e2e`
- Use for: end-to-end user flows, routing, and integration with mock API
- Environment: Playwright + Chromium (mock API + UI started by Playwright config)
- Commands:
  - `npm run e2e` - Run headless
  - `npm run e2e:ui` - Run with Playwright UI

**When to use Playwright E2E:**

- Multi-step workflows that cross routes or screens
- Integration with the mock API or real backend flows
- Validating full user journeys (create, edit, save, delete)
- Smoke tests for critical paths before releases

**Default to jsdom** unless you specifically need browser APIs - it's much faster.

**Why the distinction matters:**

- jsdom/happy-dom **simulate** browser behavior in Node.js and can miss cross-page issues
- E2E runs in a **real browser** with routing, network, and storage in place
- Trade-off: E2E is slower but validates full user journeys

**Example - When Playwright E2E is Required:**

```ts
// ✅ Use Playwright for a multi-step workflow
// File: packages/nexus-ui/e2e/automations.spec.ts
import { test, expect } from '@playwright/test'

test('user creates an automation', async ({ page }) => {
  await page.goto('/automations')
  await page.getByRole('button', { name: 'Create automation' }).click()
  await page.getByPlaceholder('Workflow name').fill('Example workflow')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Workflow created successfully')).toBeVisible()
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
├─ Yes → Use Playwright E2E (`packages/nexus-ui/e2e/*.spec.ts`)
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

#### Accessibility Testing

The project enforces accessibility at three levels: linting, unit tests, and E2E tests.

##### Accessible Test Queries (eslint-plugin-testing-library)

`eslint-plugin-testing-library` is configured for all test files and enforces Testing Library best practices. Prefer accessible queries in this priority order:

1. `getByRole` — queries accessible roles (best for buttons, headings, links)
2. `getByLabelText` — queries form elements by their label
3. `getByPlaceholderText` — queries by placeholder text
4. `getByText` — queries by visible text content
5. `getByTestId` — last resort when no accessible query works

```typescript
// ✅ GOOD: Accessible queries
screen.getByRole('button', { name: 'Submit' })
screen.getByLabelText('Email address')
screen.getByRole('heading', { name: /welcome/i })

// ❌ BAD: Avoid generic queries when accessible alternatives exist
screen.getByTestId('submit-button')
container.querySelector('.my-button')
```

Rules with many pre-existing violations are set to `warn` (not `error`) to allow gradual migration. New test code should follow the recommended patterns.

##### Automated Accessibility Assertions (vitest-axe)

Use `vitest-axe` to assert that rendered components have no accessibility violations. The `toHaveNoViolations()` matcher is globally available via the test setup.

```typescript
import { render } from '@testing-library/react'
import { axe } from 'vitest-axe'

it('has no accessibility violations', async () => {
  const { container } = render(<MyComponent />)

  const results = await axe(container)
  expect(results).toHaveNoViolations()
})
```

**When to add axe assertions:**

- Every new component should include at least one `toHaveNoViolations()` test
- Test multiple states (default, with actions, error states) for thorough coverage
- axe tests are async — always `await axe(container)`

**Important:** vitest-axe requires `jsdom` as the test environment (not happy-dom).

##### E2E Accessibility Testing (@axe-core/playwright)

`@axe-core/playwright` runs axe-core scans in real browser E2E tests. Tests live in `e2e/accessibility.spec.ts`.

```typescript
import AxeBuilder from '@axe-core/playwright'
import { type Page } from '@playwright/test'
import { test, expect, toAppUrl } from './fixtures'

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const

async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze()
  expect(results.violations).toEqual([])
}

test('page has no a11y violations', async ({ app }) => {
  await app.goto(toAppUrl('/automations'))
  await expect(app.getByRole('heading', { name: /automations/i })).toBeVisible()

  await expectNoA11yViolations(app)
})
```

**Running accessibility E2E tests:**

```bash
npm run e2e                          # Run all E2E tests including accessibility
npm run e2e -- accessibility.spec.ts # Run only accessibility tests
npm run e2e:ui                       # Run with Playwright UI for debugging
```

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
- WebSocket: `ws://localhost:8000` (real backend only; override with `VITE_WS_URL` if needed)

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
npm run podman:build              # Build all containers
npm run podman:build:ui           # Build UI container only
npm run podman:build:mock-api     # Build mock API container only

# Run containers
npm run podman:run                # Run all containers
npm run podman:run:ui             # Run UI on port 4000
npm run podman:run:mock-api       # Run API on port 3000

# Multi-arch builds
./build-multiarch.sh              # Build for AMD64 + ARM64
./build-multiarch.sh push         # Build and push to registry
```

## Error Handling with RFC 9457 Problem Details

The application uses RFC 9457 Problem Details for API error responses:

### Error Format

All API errors follow the RFC 9457 Problem Details format:

```typescript
{
  type: "https://api.nexus.com/errors/validation-error",
  title: "Validation Error",
  detail: "Field 'name' must be between 1 and 255 characters",
  code: "VALIDATION_ERROR",
  retryable: false,
  instance: "/api/v1/workflows"
}
```

### Error Handling Utilities

**Always use error utilities** - never access error fields directly:

```typescript
import {
  getErrorMessage,
  getErrorTitle,
  getErrorCode,
  isRetryableError,
  isServiceUnavailableError,
  isValidationError,
  isConflictError,
} from '../utils/apiErrors'

// ✅ GOOD
const message = getErrorMessage(error)
const title = getErrorTitle(error)

// ❌ BAD
const message = error.detail || error.message // Don't access directly
```

### Error Codes

| Code                    | HTTP Status | Description                      | Retryable |
| ----------------------- | ----------- | -------------------------------- | --------- |
| VALIDATION_ERROR        | 422         | Input validation failed          | No        |
| WORKFLOW_NAME_CONFLICT  | 409         | Workflow name already exists     | No        |
| WORKFLOW_DISABLED       | 400         | Cannot execute disabled workflow | No        |
| PROVIDER_NAME_CONFLICT  | 409         | Provider name already exists     | No        |
| FILE_TOO_LARGE          | 413         | File exceeds size limit          | No        |
| LLM_CONFIGURATION_ERROR | 503         | LLM service not configured       | Yes       |
| TEMPORAL_UNAVAILABLE    | 503         | Workflow engine unavailable      | Yes       |
| INTERNAL_ERROR          | 500         | Internal server error            | Yes       |

### Retry Support

For retryable errors, pass an `onRetry` callback:

```typescript
// Query retry support
const query = workflowClient.useQuery('get', '/workflows')
const queryState = useQueryState(query, {
  title: 'Error loading workflows',
  onRetry: () => query.refetch(),
})

// Mutation retry support
const handleError = useMutationErrorHandler()
const { mutate } = workflowClient.useMutation('post', '/workflows')

mutate(data, {
  onError: handleError({
    title: 'Failed to create workflow',
    onRetryable: () => setShowRetry(true),
  }),
})
```

### Retry Button in Error States

The `ErrorState` component automatically shows a retry button for retryable errors when `onRetry` is provided:

```typescript
// Retry button appears automatically for 5xx errors or errors with retryable=true
<ErrorState
  title="Failed to load data"
  message={error}
  onRetry={() => refetch()}
/>
```

## Performance Notes

- React Compiler for automatic optimization
- Vite for rapid builds
- Lazy loading of routes/components
- Vitest for lightweight testing
