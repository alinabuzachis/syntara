# Testing Guidelines

Comprehensive testing standards for this project. Referenced from CLAUDE.md.

---

## Core Principle: Test Behavior, Not Implementation

Write tests that verify **what** your code does, not **how** it does it. Tests should survive refactoring.

---

## Coverage Requirements

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
npm run test:coverage        # Check coverage (see CI for per-file threshold enforcement)
```

CI automatically runs this check and **blocks PRs** where any changed source file falls below 80% on any of the four metrics (lines, statements, functions, branches). All new and modified source files must meet the threshold to merge.

---

## AAA Pattern (Arrange-Act-Assert)

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

---

## Test Modes: jsdom vs Playwright E2E

### Default (jsdom) — Fast, Lightweight for Most Tests

- File naming: `*.test.ts` or `*.test.tsx`
- Use for: Component rendering, user interactions, form validation, hooks, utilities
- Environment: Simulated DOM via jsdom

**Example — jsdom test (use for most cases):**

```typescript
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

### Playwright E2E — Full Workflow Tests in Real Browser

- File naming: `*.spec.ts` under `packages/nexus-ui/e2e`
- Use for: End-to-end user flows, routing, and integration testing
- Environment: Playwright + Chromium (mock API by default, real backend supported)
- Commands:
  - `npm run e2e` - Run headless
  - `npm run e2e:ui` - Run with Playwright UI
- **Default:** Playwright starts mock API (port 3300) + UI (port 4173)
- **Real backend:** Set `NEXUS_E2E_SKIP_WEB_SERVER=1` and run UI separately against backend

**When to use Playwright E2E:**

- Multi-step workflows that cross routes or screens
- Integration with mock API or real backend flows
- Validating full user journeys (create, edit, save, delete)
- Smoke tests for critical paths before releases

**Example — Playwright E2E (use for multi-step workflows):**

```ts
// File: packages/nexus-ui/e2e/workflows.spec.ts
import { test, expect, toAppUrl } from './fixtures'
import { buildUniqueName } from './helpers/workflows'

test('user creates a workflow', async ({ app }) => {
  const workflowName = buildUniqueName('e2e-test')

  try {
    await app.goto(toAppUrl('/workflows'))
    await app.getByRole('button', { name: 'Create workflow' }).click()
    await app.getByPlaceholder('Workflow name').fill(workflowName)
    await app.getByRole('button', { name: 'Save' }).click()
    await expect(app.getByText('Workflow created successfully')).toBeVisible()
  } finally {
    // Cleanup — delete created resources (especially when testing against real backend)
    // ... cleanup logic
  }
})
```

**Important:** When running against the real backend, always clean up created resources (they persist in a real database). See the [Playwright E2E skill](playwright_e2e.md) for both mock API and real backend setup.

**For comprehensive E2E guidance:** See [`.claude/skills/playwright_e2e.md`](playwright_e2e.md)

### Why the Distinction Matters

- jsdom/happy-dom **simulate** browser behavior in Node.js and can miss cross-page issues
- E2E runs in a **real browser** with routing, network, and storage in place
- Trade-off: E2E is slower but validates full user journeys

### Decision Tree

```text
Does the component use browser-specific APIs?
├─ Yes → Use Playwright E2E (packages/nexus-ui/e2e/*.spec.ts)
│  └─ Examples: IntersectionObserver, ResizeObserver, Canvas, real layout
└─ No → Use jsdom (*.test.tsx)
   └─ Examples: Rendering, clicks, state, forms, most user interactions
```

**Default to jsdom** unless you specifically need browser APIs — it's much faster.

---

## What to Test

| Type          | Focus On                                                | Coverage Target |
| ------------- | ------------------------------------------------------- | --------------- |
| **Component** | User interactions, conditional rendering, accessibility | 80%+            |
| **Hook**      | Return values, state transitions, callback invocations  | 80%+            |
| **Store**     | Actions modify state correctly, edge cases              | 80%+            |
| **Utility**   | Input → output transformations, boundary conditions     | 90%+            |

## What NOT to Test

- Implementation details (internal state, private methods)
- Third-party library behavior
- Static content that doesn't change
- Generated files (`**/*.d.ts`, `**/mockData`, API contracts)

---

## Testing Rules (Mandatory)

### 1. Always Use `userEvent` — Never `fireEvent`

`userEvent` fires the full browser event sequence (focus, keydown, input, keyup, blur). `fireEvent` dispatches a single synthetic event. Always use `userEvent.setup()`.

```typescript
// ❌ BAD: Single synthetic event, unrealistic
fireEvent.change(input, { target: { value: 'new value' } })
fireEvent.click(button)

// ✅ GOOD: Full event sequence, realistic browser behavior
const user = userEvent.setup()
await user.clear(input)
await user.type(input, 'new value')
await user.click(button)
```

**Exception -- `fireEvent.submit`:** `userEvent` has no `.submit()` method. `fireEvent.submit(form)` is acceptable for programmatic form submission, but prefer clicking the submit button to simulate real user behavior:

```typescript
// ✅ ACCEPTABLE — when no submit button exists
fireEvent.submit(screen.getByRole('form'))

// ✅ PREFERRED — simulates real user behavior
await user.click(screen.getByRole('button', { name: 'Save' }))
```

**Never regress from `userEvent` to `fireEvent`:** When modifying an existing test file, do not replace `userEvent` calls with `fireEvent`. If a PR introduces `fireEvent` where `userEvent` previously existed, that is a regression.

### 2. Use Accessible Queries — Never `getByTestId` or `querySelector` as First Choice

Follow Testing Library query priority:

1. `getByRole` — queries accessible roles (best for buttons, headings, links)
2. `getByLabelText` — queries form elements by their label
3. `getByPlaceholderText` — queries by placeholder text
4. `getByText` — queries by visible text content
5. `getByTestId` — last resort when no accessible query works

```typescript
// ❌ BAD: DOM queries bypass accessibility semantics
container.querySelectorAll('.pf-v6-c-switch input')
screen.getByTestId('loading-state')

// ✅ GOOD: Accessible queries verify real user experience
screen.getByRole('switch', { name: 'Enabled' })
screen.getByRole('button', { name: 'Submit' })
screen.getByLabelText('Email address')
screen.getByRole('heading', { name: /welcome/i })
screen.getByRole('status') // or screen.getByText(/loading/i)
screen.getByRole('alert') // for error states
```

Rules with many pre-existing violations are set to `warn` (not `error`) to allow gradual migration. **New test code must produce zero warnings** -- these rules will be promoted to `error` once existing violations are cleaned up. See [coding_standards.md section 8 -- Zero New Warnings Policy](coding_standards.md).

**Scope assertions with `within()`:** When asserting on elements inside a specific container (dialog footer, form group, select dropdown), use `within()` to scope queries. This prevents false positives from matching elements elsewhere on the page.

```typescript
// ❌ BAD: Could match buttons from any part of the page
const buttons = screen.getAllByRole('button')

// ✅ GOOD: Scoped to the dialog footer
const footer = within(dialog).getByRole('contentinfo')
const buttons = within(footer).getAllByRole('button')
expect(buttons[0]).toHaveTextContent('Save')
expect(buttons[1]).toHaveTextContent('Cancel')

// ✅ GOOD: Scoped to a specific select
const projectSelect = screen.getByLabelText('Credential project')
expect(within(projectSelect).getByRole('option', { name: 'Project Alpha' })).toBeInTheDocument()
```

### 3. Every New Component Must Have a `vitest-axe` Test

Include at least one `toHaveNoViolations()` test. Test multiple states for thorough coverage.

```typescript
import { axe } from 'vitest-axe'

it('has no accessibility violations', async () => {
  const { container } = render(<MyComponent />, { wrapper })
  const results = await axe(container)
  expect(results).toHaveNoViolations()
})
```

**When to add axe assertions:**

- Every new component should include at least one `toHaveNoViolations()` test
- Test multiple states (default, with actions, error states) for thorough coverage
- For expandable components (tables, panels), test the **expanded state** separately
- axe tests are async -- always `await axe(container)`

```typescript
// ✅ Test both default and expanded states
it('has no accessibility violations when rows are expanded', async () => {
  const user = userEvent.setup()
  const { container } = render(<MyTable />, { wrapper })
  await user.click(screen.getByRole('button', { name: /expand all/i }))
  expect(await axe(container)).toHaveNoViolations()
})
```

**Important**: vitest-axe requires `jsdom` as the test environment (not happy-dom).

### 4. Every New Custom Hook Must Have a Dedicated Test File

New reusable hooks (`use*.ts`) must have a corresponding `use*.test.ts(x)` file — not just indirect coverage from a component test. Hook tests should cover:

- Return values and state transitions
- Callback invocations and side effects
- Edge cases (empty data, error states, loading states)

```typescript
// ❌ BAD — hook only tested indirectly through a component
// No useDebouncedValue.test.ts exists

// ✅ GOOD — dedicated hook test
import { renderHook, act } from '@testing-library/react'
import { useDebouncedValue } from './useDebouncedValue'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

it('returns debounced value after delay', async () => {
  const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
    initialProps: { value: 'hello' },
  })

  rerender({ value: 'world' })
  expect(result.current).toBe('hello') // not yet debounced

  await act(() => vi.advanceTimersByTime(300))
  expect(result.current).toBe('world') // debounced
})
```

This ensures the 80% coverage threshold is met on the hook file independently, and prevents regressions when the consuming component changes.

### 5. Unnecessary `useEffect` in Hooks

The ESLint plugin `eslint-plugin-react-you-might-not-need-an-effect` (configured at `warn` level) catches most unnecessary `useEffect` patterns automatically. See [coding_standards.md §23](coding_standards.md) for details.

### 6. Isolate the Field Under Test in Validation Tests

When testing that a specific field shows a required validation error, fill in all _other_ required fields first. Otherwise the assertion may pass today but break if field validation order changes.

```typescript
// ❌ BAD — only fills name, leaves other fields empty; assertion depends on validation order
await user.type(screen.getByLabelText('Name'), 'Test')
await user.click(screen.getByRole('button', { name: 'Create' }))
await screen.findByText('Project is required')

// ✅ GOOD — fills all required fields except the one under test
await user.type(screen.getByLabelText('Name'), 'Test')
await user.selectOptions(screen.getByLabelText('Type'), 'type-1')
// intentionally skip project
await user.click(screen.getByRole('button', { name: 'Create' }))
await screen.findByText('Project is required')
```

### 7. Assert Element Absence Explicitly

When verifying that a UI element is hidden in a certain state, assert its absence explicitly with `queryByRole` / `queryByText`. Do not assume its absence is implied by other assertions.

```typescript
// ❌ BAD — only asserts the empty state is visible, doesn't verify the header button is gone
expect(screen.getByText('No credentials')).toBeInTheDocument()

// ✅ GOOD — explicitly asserts the create button is absent in empty state
expect(screen.getByText('No credentials')).toBeInTheDocument()
expect(screen.queryByRole('button', { name: 'Create credential' })).not.toBeInTheDocument()
```

### 8. Typed Mock Functions

Use generic type parameters on `vi.fn()` instead of double-casting (`vi.fn() as unknown as Type`). This keeps type safety without losing readability.

```typescript
// ❌ BAD — double cast, loses type safety
const setError = vi.fn() as unknown as UseFormSetError<FormData>

// ✅ GOOD — typed mock function
const setError = vi.fn<UseFormSetError<FormData>>()
```

### 9. Test Names Must Be Accurate, Unique, and Current

- **No duplicate test names** within the same describe block -- `vitest` may silently skip or overwrite one. **Enforced by ESLint:** `vitest/no-identical-title` (error).
- **No misleading names** -- if a test is called "verifies icon rotation" but only checks the icon renders, rename it to match what it actually asserts
- **Update names when behavior changes** -- when the implementation changes (e.g., from inference-based to backend-driven status), update test names to reflect the new behavior source

### 10. Extract Shared Test Data

When the same test data object appears in 3+ test cases within a describe block, extract it to a shared function or constant at the top of the block. This prevents copy-paste drift and reduces maintenance burden.

```typescript
// ❌ BAD — same object duplicated in 5 tests
it('test A', () => { const workflow = { name: 'test', input_schema: {...} } })
it('test B', () => { const workflow = { name: 'test', input_schema: {...} } })

// ✅ GOOD — shared builder at describe scope
function buildTestWorkflow(overrides = {}) {
  return { name: 'test', input_schema: { type: 'object' }, ...overrides }
}
it('test A', () => { const workflow = buildTestWorkflow() })
it('test B', () => { const workflow = buildTestWorkflow({ name: 'custom' }) })
```

### 11. Negative Assertions Must Be Meaningful

Do not assert that something is absent when the test setup never could have created it. Such assertions pass vacuously and provide no regression safety.

```typescript
// ❌ BAD — test data has no globe icon, so this always passes regardless of the fix
expect(screen.queryByTestId('globe-icon')).not.toBeInTheDocument()

// ✅ GOOD — test data explicitly creates the condition, then asserts the fix works
render(<ProviderIcon idpType="custom" />)
expect(screen.queryByTestId('globe-icon')).not.toBeInTheDocument()
```

---

## Quick Reference

- **Components**: `render()`, `screen`, `userEvent` from Testing Library
- **Hooks**: `renderHook()` and wrap state changes in `act()`
- **Stores**: Reset state in `beforeEach`, test via `getState()` and actions
- **Mocking**: `vi.fn()` for callbacks, `vi.mock()` for modules

---

## Accessibility Testing — Three Levels

### Level 1: Lint-Time (eslint-plugin-testing-library)

`eslint-plugin-testing-library` is configured for all test files and enforces Testing Library best practices. Prefer accessible queries in priority order (see Rule #2 above). Rules with many pre-existing violations are set to `warn` (not `error`) to allow gradual migration. **New test code must produce zero warnings** -- these rules will be promoted to `error` once existing violations are cleaned up.

### Level 2: Unit Tests (vitest-axe)

The `toHaveNoViolations()` matcher is globally available via test setup.

- Every new component needs at least one axe test
- Test multiple states (default, error, loading)
- axe tests are async — always `await axe(container)`

### Level 3: E2E Tests (@axe-core/playwright)

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
  await app.goto(toAppUrl('/workflows'))
  await expect(app.getByRole('heading', { name: /workflows/i })).toBeVisible()

  await expectNoA11yViolations(app)
})
```

**Running accessibility E2E tests:**

```bash
npm run e2e                          # All E2E tests including accessibility
npm run e2e -- accessibility.spec.ts # Only accessibility tests
npm run e2e:ui                       # With Playwright UI for debugging
```

---

## Industry Best Practices for Test Coverage

### Bare Minimum (80%)

- **Happy path**: Test the most common user flow
- **Error cases**: Test at least one error scenario
- **Edge cases**: Test boundary conditions (empty, null, max values)
- **User interactions**: Test all clickable elements and form inputs

**Example — Button Component:**

```typescript
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

### Why 80%?

- Industry standard (Google, Airbnb, Netflix use 80-90%)
- Catches most bugs without diminishing returns
- Balances thoroughness with development velocity
- Forces testing of critical paths without testing getters/setters
