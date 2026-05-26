# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Claude Agent Instructions

Claude, you have access to the following skills. **Do not load them all at once** -- read each skill file on-demand when its trigger condition is met. If a loaded skill (e.g., `frontend_specialist.md`) tells you to read another skill you have already loaded in this conversation, skip the re-read.

> **Enforced by hook:** `.claude/hooks/skill-gate.sh` blocks `Edit`/`Write` until required skills are read. Mapping: [`.claude/skill-triggers.json`](.claude/skill-triggers.json).

| Trigger                                                                             | Skill file to read                                                         |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Before implementing, reviewing, or refactoring any frontend code**                | `.claude/skills/frontend_specialist.md`                                    |
| **Before writing or modifying any component, page, or UI code**                     | `.claude/skills/patternfly-ux-design-system.md`                            |
| **Before writing or reviewing any test file** (unit, integration, or accessibility) | `.claude/skills/testing_guidelines.md`                                     |
| **Before writing or reviewing any E2E / Playwright test**                           | `.claude/skills/playwright_e2e.md`                                         |
| **Before committing code or reporting a task as done**                              | `.claude/skills/pr_review.md` (self-review against PR checklist)           |
| **Before writing or modifying any component, hook, or pattern**                     | `.claude/skills/coding_standards.md`                                       |
| **Before writing code using React, Zod, Zustand, Vitest, Vite, or TanStack Query**  | `.claude/skills/library_references.md` (fetch the relevant `llms.txt` URL) |

> **To add or change skill triggers:** Edit [`.claude/skill-triggers.json`](.claude/skill-triggers.json). The hook and this table should stay in sync -- the JSON is what the hook enforces at runtime.

### Storybook MCP (when available)

When the Storybook MCP is available in the session, use its tools for all component and story work — it surfaces live documentation, rendered previews, and story conventions without requiring you to read source files.

**CRITICAL: Never hallucinate component properties.** Before using any prop on a component — including seemingly obvious ones like `shadow`, `size`, `variant` — you must verify it is actually documented. A story name may not reflect the underlying prop name, so always check the documentation, not just story names.

**Workflow:**

1. Call `list-all-documentation` to discover component IDs.
2. Call `get-documentation` for the specific component to see all documented props and examples. Only use props that appear there.
3. If a prop is not documented, **do not assume it exists based on naming conventions or patterns from other libraries** — ask the user instead.
4. Before creating or editing any `.stories.*` file, call `get-storybook-story-instructions` for current conventions.
5. After any component or story change, call `preview-stories` and **always include every returned preview URL in your response**.
6. If `get-documentation` doesn't show the variant you need, call `get-documentation-for-story` for that specific story.
7. **Before implementing any confirmation dialog**, call `get-documentation` with id `"components-dialogs-nxconfirmationdialog"` — the `NxConfirmationDialog` stories are the primary source of truth for tier selection, prop usage, title format, body copy, checkbox labels, and button labels.

### Shell Command Rules

**Never use bare `cd pkg && command`** — shell state does not persist between Bash calls and this pattern fails under `eval`. Use a subshell or `--prefix` instead:

```bash
(cd packages/nexus-ui && npx eslint 'src/**/*.ts')  # subshell
npm --prefix packages/nexus-ui run lint              # npm script
npx --prefix packages/nexus-ui vitest run path/to/test.test.ts
```

### Accessibility review (always)

Treat accessibility as part of every UI change, not an optional follow-up:

- **While implementing**: Prefer semantic HTML and PatternFly patterns; meaningful labels, names, and roles; keyboard operability where there is interactivity; do not rely on color alone for meaning.
- **While reviewing** (code or PR): Check new or changed UI for the above, for `eslint-plugin-jsx-a11y` / Testing Library expectations, and for tests (`vitest-axe` where appropriate). Flag regressions and missing coverage.
- See [`.claude/skills/testing_guidelines.md`](.claude/skills/testing_guidelines.md) — "Accessibility Testing" for project tooling (ESLint, vitest-axe, E2E axe-core).

### TypeScript and ESLint Guardrails

**CRITICAL: Always follow TypeScript best practices and do not introduce new ESLint warnings.**

- **TypeScript first**: Prefer strict, explicit typing and type-safe patterns. Avoid `any`, avoid unsafe casts unless absolutely necessary, and use existing shared types or contract types whenever possible.
- **Respect existing lint rules**: New or modified code should not add fresh ESLint warnings or errors, even in areas where older warnings still exist.
- **Leave files no worse than you found them**: If you touch a file, avoid increasing its warning count. When practical, reduce nearby warnings as part of the change.
- **Refactor instead of suppressing**: Prefer clearer control flow, smaller functions, extracted helpers, and stronger types over disabling rules.
- **Validate before finishing**: After substantive edits, run the relevant lint/type-check commands for the affected package and fix any issues introduced by the change.
- **No nested ternary operators**: ESLint enforces `sonarjs/no-nested-conditional` (Sonar typescript:S3358), aligned with SonarCloud. Prefer `if`/`else`, early returns, or precomputed values instead of `a ? b : c ? d : e`. The full list of enforced readability rules is in [`.claude/skills/coding_standards.md`](.claude/skills/coding_standards.md).
- **No `void` operator**: Do not use JavaScript's unary `void` (for example `void promise()` or `void someFn()`). It is easy to misread, is flagged by Sonar (S3735), and is forbidden by ESLint `no-void`. For promises you intentionally do not await, use `detachPromise(...)` from `packages/nexus-ui/src/utils/detachPromise.ts` (wraps with `Promise.resolve` so mocks that return `undefined` are safe) or `await` / `return` the promise when the caller should handle errors. This is separate from TypeScript's `void` return type (e.g. `function cleanup(): void`).

### Common PR Mistakes — Quick Checklist

**CRITICAL: Address ALL of these before opening a PR. For detailed examples, see [`.claude/skills/coding_standards.md`](.claude/skills/coding_standards.md).**

1. **No raw `fetch()`** — use typed API clients (`workflowClient`, `credentialsClient`, etc.)
2. **`useQueryState` object form** — always pass `{ title, onRetry }` with `detachPromise(query.refetch())`, never bare string
3. **No unsafe `as` casts on API responses** — use typed client responses or type guards
4. **`vitest-axe` test for every new component** — at least one `toHaveNoViolations()`
5. **`userEvent` over `fireEvent`** — full browser event sequence, use `userEvent.setup()`
6. **Accessible queries first** — `getByRole` > `getByLabelText` > `getByText` > `getByTestId`; never `querySelector`
7. **`ErrorState` component** — never raw error markup; pass raw error object + `onRetry`
8. **Zod + react-hook-form** — never manual `useState` per field; use `zodResolver`
9. **Reset `defaultValues` in edit modals** — `reset()` in `useEffect` keyed on `[isOpen, item]`
10. **Extract shared patterns** — use `NxConfirmationDialog`, `useDialogState`, `useDeleteAction`, `useCursorPagination`
11. **UI PRs must include screenshots** or screen recordings showing key states
12. **New API endpoints need mock handlers** in `packages/nexus-mock-api/src/handlers.ts`
13. **Use enum constants** from `@ansible/nexus-contracts` — never string literals for discriminators
14. **Never compare display strings in logic** — compare API values or enum constants, not translatable labels
15. **Use PF6 design tokens** — never hardcoded `px` for spacing/colors; use `var(--pf-t--global--*)`
16. **No unary `void` operator** — use `detachPromise(...)` for intentionally unawaited promises; `void` is forbidden by ESLint `no-void`
17. **No nested ternary operators** — use `if`/`else` or intermediate variables; ESLint `sonarjs/no-nested-conditional` (Sonar S3358)
18. **No nested React components (Sonar S6478)** — do not declare components inside another component; for PatternFly `toggle` / similar props use a **module-scoped** child component and pass data as props (see [`.claude/skills/coding_standards.md`](.claude/skills/coding_standards.md) §18)
19. **`showSuccess`/`showError` object parameter** — pass `{ title, description? }`, not positional args; use sentence case for alert titles (see [`.claude/skills/coding_standards.md`](.claude/skills/coding_standards.md) §19)
20. **No raw HTML for text** — use PF `Content`, `HelperText`, `Label`, or `Title` instead of raw `<span>`/`<p>`/`<div>` for text content; use PF `List` / `ListItem` instead of raw `<ul>`/`<ol>`/`<li>` (see [`.claude/skills/coding_standards.md`](.claude/skills/coding_standards.md) §20; `nexus/prefer-pf-text-components` and `nexus/prefer-pf-list-components` in ESLint)
21. **`useMemo` for derived data in hooks** — wrap computed maps/arrays/filtered lists from query results in `useMemo` to avoid new references on every render (see [`.claude/skills/coding_standards.md`](.claude/skills/coding_standards.md) §21)
22. **New hooks need test files** — every new `use*.ts` hook must have a dedicated `use*.test.ts(x)` with coverage, not just indirect coverage from a component test
23. **No unnecessary `useEffect`** — never use `useEffect` to compute derived state, chain state updates, or handle user events; use event handlers, `useMemo`, or inline calculations instead ([React docs](https://react.dev/learn/you-might-not-need-an-effect), [`.claude/skills/coding_standards.md`](.claude/skills/coding_standards.md) §23)
24. **Cascading form field resets belong in `onChange`** — when one field change should reset another, put the `setValue()` calls in the field's `onChange` handler, not in a `useEffect` watching the field value
25. **E2E tests must be self-contained** — every E2E test must create ALL resources it needs and delete ALL created resources in a `try-finally` block; no `test.skip()` for missing seed data (see [`.claude/skills/playwright_e2e.md`](.claude/skills/playwright_e2e.md))
26. **Use `isPending` from mutation hooks** — never use `formState.isSubmitting` (it only covers the synchronous `handleSubmit` wrapper, not the async mutation lifecycle); use `isPending` from `useMutation` instead
27. **Use `RhUi*` icons for action buttons** — never use PatternFly icons like `PlusCircleIcon` directly; use `RhUiAddIcon`, `RhUiDuplicate`, etc. from `@patternfly/react-icons`
28. **CSS module classes over inline style objects** — prefer `.module.css` classes over `style={{ ... }}` props; CSS modules are more DOM-efficient, cacheable, and keep styles co-located
29. **No mutable counters in `.map()`** — do not use `let` counters inside `.map()` or `.forEach()`; pre-compute indices immutably or use the callback's index parameter
30. **`aria-label` only on interactive/widget/landmark elements** — do not put `aria-label` on generic `<span>` or `<div>`; use it on buttons, inputs, `role="region"`, images, or landmarks
31. **`eslint-disable` comments must include a reason** — every suppression needs a `-- reason` comment explaining why the rule cannot be followed; no unexplained suppressions
32. **Conditional hook execution uses wrapper components** — hooks must be called unconditionally per React rules; if a hook's result is used conditionally, extract to a wrapper component that is conditionally rendered (see [`.claude/skills/coding_standards.md`](.claude/skills/coding_standards.md) §29)

### Feature Preservation Rules

- Never remove existing features or UI elements unless explicitly instructed
- Before removing any component, function, or route, confirm with the user
- When rebasing or resolving conflicts, always prefer keeping both sides' features unless told otherwise
- If unsure whether something should be removed, ASK

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
npm run e2e:visual-regression        # Page screenshot visual regression (mock API + UI via Playwright webServer)
npm run e2e:visual-regression:update # Same, with --update-snapshots (see packages/nexus-ui/VISUAL_REGRESSION.md)

# Run a specific test or coverage
(cd packages/nexus-ui && npm run vitest -- path/to/specific/test.test.ts)
npm --prefix packages/nexus-ui run test:coverage

# Build
npm run build              # Build UI package
npm run gen                # Regenerate API contracts

# Code Quality
npm run format             # Format code
npm run format:check       # Check formatting
npm run lint                           # Run ESLint
npm run tsc                              # Type check only
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

### Quick Navigation by Task

| Working on...                       | Read this                                                                                                                                                                                                                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **New here / onboarding**           | [`docs/ai-assisted-development.md`](docs/ai-assisted-development.md) -- AI agent prompts, screenshot workflow, full example                                                                                                                                            |
| **API integration**                 | [`docs/data-flow.md`](docs/data-flow.md) -- OpenAPI contracts and type-safe clients                                                                                                                                                                                    |
| **Workflow transformations**        | [`docs/data-flow.md`](docs/data-flow.md) -- Nested to flat conversions                                                                                                                                                                                                 |
| **Step registry (`NodeRegistry`)**  | [`docs/architecture.md`](docs/architecture.md) -- auto-discovery of step types                                                                                                                                                                                         |
| **Builder internals**               | [`docs/architecture.md`](docs/architecture.md) -- "Builder internals (advanced)"                                                                                                                                                                                       |
| **State management**                | [`docs/zustand-architecture.md`](docs/zustand-architecture.md) -- Zustand guide                                                                                                                                                                                        |
| **WebSocket / real-time**           | [`docs/websocket-architecture.md`](docs/websocket-architecture.md) -- multi-channel infrastructure                                                                                                                                                                     |
| **Execution visualization**         | [`docs/execution-visualizer-protocol.md`](docs/execution-visualizer-protocol.md) -- protocol, endpoints, data specs                                                                                                                                                    |
| **PR sizing / stacking**            | [`.github/pull_request_template.md`](.github/pull_request_template.md) -- PR template and guidelines                                                                                                                                                                   |
| **List page with pagination**       | [`.claude/skills/coding_standards.md`](.claude/skills/coding_standards.md) -- `useCursorPagination` pattern                                                                                                                                                            |
| **Full list (dropdowns, settings)** | [`.claude/skills/coding_standards.md`](.claude/skills/coding_standards.md) -- section 22: `fetchAllPages` + `useAll*` hooks (not `limit: 100` single queries)                                                                                                          |
| **Confirmation dialogs**            | [`.claude/skills/coding_standards.md`](.claude/skills/coding_standards.md) -- `NxConfirmationDialog` component; for content patterns (tier copy, checkbox labels, button labels) use Storybook MCP: `get-documentation` -> `"components-dialogs-nxconfirmationdialog"` |
| **Sonar S6478 / PF `toggle` props** | [`.claude/skills/coding_standards.md`](.claude/skills/coding_standards.md) -- nested components and PatternFly render props                                                                                                                                            |
| **Dialog state management**         | [`.claude/skills/coding_standards.md`](.claude/skills/coding_standards.md) -- `useDialogState` hook                                                                                                                                                                    |
| **Error handling patterns**         | [`docs/error-handling.md`](docs/error-handling.md) -- RFC 9457, error utilities, retry support                                                                                                                                                                         |
| **Testing standards**               | [`.claude/skills/testing_guidelines.md`](.claude/skills/testing_guidelines.md) -- coverage, queries, accessibility                                                                                                                                                     |
| **Visual regression testing**       | [`packages/nexus-ui/VISUAL_REGRESSION.md`](packages/nexus-ui/VISUAL_REGRESSION.md) -- page registry, baselines, CI screenshots                                                                                                                                         |
| **New workflow step type**          | `packages/nexus-ui/src/routes/builder/registry/nodes/QUICK_START.md`                                                                                                                                                                                                   |
| **UX / PatternFly design system**   | [`.claude/skills/patternfly-ux-design-system.md`](.claude/skills/patternfly-ux-design-system.md) -- PF6 patterns                                                                                                                                                       |
| **Library docs / llms.txt links**   | [`.claude/skills/library_references.md`](.claude/skills/library_references.md) -- fetch before writing React, Zod, Zustand, Vitest, Vite, or TanStack Query code                                                                                                       |
| **Page content frame (`NxPanel`)**  | `packages/nexus-ui/src/components/layout/NxPanel.tsx` -- `Panel` -> `PanelMain` -> `PanelMainBody`; see JSDoc (glass vs `opaqueFloatingFill` vs `variant="raised"`) and [patternfly-react#12372](https://github.com/patternfly/patternfly-react/pull/12372)            |

### Quick Reference: Common Tasks

#### How do I make API calls?

Use the type-safe clients from `client.tsx`:

```typescript
import { workflowClient } from '../client'

const { data, isLoading, error } = workflowClient.useQuery('get', '/workflows')
const { mutate } = workflowClient.useMutation('post', '/workflows')
```

See: [`docs/data-flow.md`](docs/data-flow.md) — "Type-Safe API Clients"

#### How do I add a new route?

1. Add route constant to `packages/nexus-ui/src/app/AppRoute.tsx`
2. Add navigation item to `packages/nexus-ui/src/app/navigationItems.tsx` with lazy-loaded component
3. The router auto-discovers it from `navigationItems` — no manual route config needed

#### What is the default workflow name?

**`new-workflow`**, defined as `DEFAULT_WORKFLOW_NAME` in `packages/nexus-ui/src/routes/builder/utils/workflowNaming.ts`. Conflicts auto-increment: `new-workflow-1`, `new-workflow-2`, etc.

#### How do I debug the workflow builder?

- **React DevTools**: Inspect component props and Zustand state
- **Console**: `useWorkflowStore.getState()` to inspect workflow store
- Steps not appearing → check `NodeRegistry`; edges not connecting → verify handle IDs; state not updating → check store actions

#### How do I format dates?

Use date utilities in `packages/nexus-ui/src/utils/dateUtils.ts`:

- `formatDate(isoString)` — "Jan 15, 2024"
- `formatTime(isoString)` — "2:30 PM"
- `formatDateTime(isoString?)` — medium date + short time
- `formatElapsedTime(elapsedMs)` — "1h 2m 3s"

Use for UI display only, not in logic (per i18n guidelines). Trigger-specific interval formatting stays in `utils/triggerFormatting.ts`.

## Critical Development Workflows

- **Dependency Management**: PatternFly components consumed from npm; automatic rebuilds in watch mode; hot reloading for component changes
- **API Contract Generation**: Types generated from external OpenAPI specs, shared between UI and Mock API — update via `npm run gen`
- **Mocking Approach**: MSW (Mock Service Worker) for consistent API mocking in development and testing

## Performance Notes

- React Compiler for automatic optimization
- Vite for rapid builds
- Lazy loading of routes/components
- Vitest for lightweight testing

## Development Constraints

### Technical Boundaries

- Node.js 22+ required
- TypeScript 5.9
- React 19
- Vite build system
- npm workspaces

### Port Configuration (Development)

- UI: <http://localhost:5173>
- Mock API: <http://localhost:3000>
- Storybook (+ MCP server): <http://localhost:5174>
- WebSocket: derived from page origin (real backend only; override with `VITE_WS_URL` if needed)

E2E tests use different ports (UI: 4173, mock API: 3300) to avoid conflicts with a running dev server.

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
