# Claude Skill: Playwright E2E Testing

Your goal is to author comprehensive, production-grade end-to-end tests using Playwright that follow the project's established patterns and cover critical user workflows.

---

## Quick Reference

### Existing Test Infrastructure

| Component  | Location                                     |
| ---------- | -------------------------------------------- |
| Config     | `packages/nexus-ui/playwright.config.ts`     |
| Test files | `packages/nexus-ui/e2e/*.spec.ts`            |
| Fixtures   | `packages/nexus-ui/e2e/fixtures.ts`          |
| Helpers    | `packages/nexus-ui/e2e/helpers/workflows.ts` |

### Key Conventions (extracted from existing tests)

- **Imports:** `test, expect, toAppUrl` from `'./fixtures'` (NOT `'@playwright/test'`)
- **Fixture:** `{ app }` (NOT `{ page }`) — pre-navigated to base URL with nav visible
- **Navigation:** `toAppUrl('/path')` helper for all URLs
- **Unique names:** `buildUniqueName(prefix)` for all test data
- **Locators:** `getByRole` > `getByLabel` > `getByPlaceholder` > `getByText` > `getByTestId`
- **Helpers:** `createBasicWorkflow`, `addNodePanel` (opens **Add step** UI), `fillCodeEditor`, `closeNodeEditorPanel`

### Commands

```bash
npm run e2e        # Run headless (default: mock API + UI auto-started)
npm run e2e:ui     # Run with Playwright UI for debugging
```

---

## Prerequisites

### Default Mode (Mock API)

The Playwright config auto-starts both the mock API (port 3300) and UI (port 4173). No extra setup:

```bash
npm run e2e
```

Override ports if needed:

```bash
NEXUS_E2E_PORT=5174 NEXUS_E2E_API_PORT=3301 npm run e2e
```

### Real Backend Mode

To test against the real Nexus backend instead of the mock API:

1. **Start the real backend** (see backend repo README):

   ```bash
   cd ../nexus
   # Follow backend setup instructions — runs on http://localhost:8000
   ```

2. **Start the UI** pointing to the real backend:

   ```bash
   VITE_API_URL=http://localhost:8000 npm run start:ui
   ```

3. **Run E2E tests** with web server auto-start disabled:

   ```bash
   NEXUS_E2E_SKIP_WEB_SERVER=1 \
     NEXUS_E2E_BASE_URL=http://localhost:5173 \
     npm run e2e
   ```

**Important:** When running against a real backend, test isolation and cleanup are critical — tests operate on a shared persistent database. The patterns in this skill (unique names, try-finally cleanup) ensure tests work reliably in both modes.

**Note on data-dependent tests:** Some tests (integration-filtering, approvals, pagination) require seed data that the mock API provides. Against a fresh real backend these tests skip automatically via `test.skip()` guards. Tests that CREATE their own data (builder, workflows, integrations) work in both modes.

---

## When to Use E2E vs Unit/Component Tests

| Use E2E (Playwright) when…                        | Use Unit/Component (Vitest) when…            |
| ------------------------------------------------- | -------------------------------------------- |
| Multi-step workflows crossing routes              | Testing a single component's rendering/logic |
| Builder interactions (drag, connect steps)        | Form validation rules                        |
| Verifying URL-based filter state / shareable URLs | Custom hook behavior                         |
| Testing real API persistence (real backend mode)  | Utility function input → output              |
| Accessibility scans across full pages             | Component accessibility (`vitest-axe`)       |

**Default to Vitest** unless you specifically need cross-route flows or full browser behavior — it's much faster.

---

## Phase 0 — Learn from Existing Tests

**Before writing ANY new tests, study the established conventions.**

### Step 1: Read existing test files

Read all files in `packages/nexus-ui/e2e/`:

- `fixtures.ts` — custom `{ app }` fixture definition and `toAppUrl` helper
- `helpers/workflows.ts` — `buildUniqueName`, `createBasicWorkflow`, `addNodePanel` (Add step panel), `fillCodeEditor`, `closeNodeEditorPanel`
- All `*.spec.ts` files — naming conventions, structure, assertion style, cleanup patterns

### Step 2: Extract conventions

From the existing tests, note:

- **File naming:** `feature-name.spec.ts` (kebab-case)
- **Test titles:** Descriptive, user-action-based ("user creates and saves a multi-step workflow")
- **Scoping:** Some files use `test.describe()` blocks (accessibility, filtering), others use top-level tests
- **Conditional skipping:** `test.skip(!condition, 'reason')` for data-dependent tests
- **Multi-tab testing:** Some tests use `{ app, context }` to test URL sharing across tabs

**CRITICAL:** New tests MUST match existing style. A reviewer should not be able to distinguish new tests from existing ones.

---

## Phase 0.5 — Use MCP Tools to Explore the App

**Before writing test code, use the available MCP servers to see the real application.**

This project ships with two MCP servers configured in `.mcp.json` that give you direct browser access. Use them to ground your tests in reality — discover real locators, verify page structure, and confirm user flows before writing a single line of test code.

### Available MCP Tools

| MCP Server          | What it does                                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| **Playwright MCP**  | Navigate pages, take accessibility snapshots, click elements, fill forms — a real browser you control |
| **Chrome DevTools** | Inspect DOM structure, monitor network requests, read console output, evaluate JavaScript in the page |

### Workflow: Explore → Snapshot → Write

1. **Start the dev server** if not already running (`npm run start:ui`)
2. **Navigate to the page** you're writing tests for using `browser_navigate`
3. **Take an accessibility snapshot** (`browser_snapshot`) — this returns the page's accessibility tree, showing every role, name, and label. Use this to pick the right `getByRole`, `getByLabel`, and `getByText` locators
4. **Interact with the UI** — click buttons, fill forms, open menus using `browser_click` and `browser_type` to discover the exact flow a user follows
5. **Verify locators** — if unsure about a locator, snapshot after each interaction to see how the accessibility tree changes
6. **Write the test** using the real roles and names you observed, not guesses

### Example: Discovering Locators via Snapshot

Instead of guessing that a button is called "Save":

```
1. browser_navigate → http://localhost:5173/automations/new
2. browser_snapshot → reveals: button[name="Save workflow"]
3. Write test:  await app.getByRole('button', { name: 'Save workflow' }).click()
```

### When to Use Each MCP

| Situation                                    | Use             |
| -------------------------------------------- | --------------- |
| Discovering locators for a new page          | Playwright MCP  |
| Verifying a multi-step user flow             | Playwright MCP  |
| Checking network requests/responses          | Chrome DevTools |
| Debugging why a locator doesn't match        | Playwright MCP  |
| Inspecting console errors on a page          | Chrome DevTools |
| Verifying CSS/layout before screenshot tests | Chrome DevTools |

### Important Notes

- **Snapshot over screenshot** — prefer `browser_snapshot` (accessibility tree) over `browser_take_screenshot` (image) for finding locators. The snapshot gives you exact roles and names
- **Don't skip this step** — writing tests without seeing the real page leads to wrong locator names, missed elements, and flaky tests
- **Use for debugging too** — when a test fails, navigate to the failing state with the MCP and snapshot to see what the page actually looks like

---

## Phase 1 — Understand the Application

**Do NOT start writing tests until you understand what you're testing.**

### Key information to gather

1. **Routes:** Read `src/app/AppRoute.tsx` and `src/app/navigationItems.tsx`
2. **Features:** Workflows, Builder, Executions, Credentials, Integrations, Approvals
3. **Critical paths:**
   - Create workflow → Add steps → Save → Execute → View results
   - Workflow builder (complex UI state management)
   - CRUD operations on all resource types
4. **Edge cases:** Empty states, validation errors, loading states, boundary conditions

### Document at the top of each test file

```typescript
/**
 * E2E Tests: [Feature Name]
 *
 * Critical paths covered:
 * - [List the key user workflows tested]
 *
 * Edge cases:
 * - [List boundary conditions and error scenarios]
 */
```

---

## Phase 2 — Test Authoring Rules

### Test Isolation — CRITICAL

Tests run with `fullyParallel: true` and must be completely independent.

#### Golden Rules

1. **NEVER hardcode resource names** — Always use `buildUniqueName(prefix)`

   ```typescript
   // ❌ BAD: Conflicts in parallel execution
   const workflowName = 'test-workflow'

   // ✅ GOOD: Unique per test run
   const workflowName = buildUniqueName('e2e-workflow')
   ```

2. **Each test creates its own data** — Never assume resources exist

   ```typescript
   // ❌ BAD: Assumes "Default Workflow" exists
   await app.goto(toAppUrl('/workflows/default-workflow'))

   // ✅ GOOD: Create what you need
   const workflowName = buildUniqueName('e2e-test')
   await createBasicWorkflow(app, workflowName, 'Test action')
   ```

3. **NEVER assume a clean database** — The backend may have pre-existing data

   ```typescript
   // ❌ BAD: Assumes exact row count from mock seed data
   await expect(app.getByText(/20 integrations/i)).toBeVisible()
   const rows = await app.getByRole('row').count()
   expect(rows).toBeGreaterThan(1)

   // ❌ BAD: Assumes created row is visible on first page without filtering
   await createBasicWorkflow(app, workflowName, 'Test action')
   await app.goto(toAppUrl('/workflows'))
   await expect(app.getByRole('row', { name: workflowName })).toBeVisible()

   // ✅ GOOD: Filter by unique name to find your data regardless of what else exists
   await createBasicWorkflow(app, workflowName, 'Test action')
   await app.goto(toAppUrl('/workflows'))
   await app.getByPlaceholder('Filter by name').fill(workflowName)
   await app.getByRole('button', { name: 'Apply filter' }).click()
   await expect(app.getByRole('row', { name: new RegExp(workflowName) })).toBeVisible()

   // ✅ GOOD: Assert on relative changes, not absolute counts
   const firstPageText = await footer.textContent()
   await nextButton.click()
   const secondPageText = await footer.textContent()
   expect(secondPageText).not.toBe(firstPageText) // Different page, different count
   ```

   **Why:** The real backend may have data from previous test runs, manual testing, or other users. Tests that hardcode counts like "20 integrations" or assume rows are visible without filtering break when the database isn't a clean slate.

4. **Clean up in try-finally** — Cleanup must run even if test fails

   ```typescript
   const workflowName = buildUniqueName('e2e-test')
   await createBasicWorkflow(app, workflowName, 'Test action')
   try {
     // assertions and further actions
   } finally {
     // cleanup — delete via UI or API
   }
   ```

5. **No shared state between tests** — No shared variables, no test ordering dependencies

6. **Tests must work in any order** — Run alone, in full suite, or shuffled

#### Why This Matters

With `fullyParallel: true`, Playwright runs tests concurrently. If tests share names or assume specific database states, they interfere with each other and fail randomly.

#### Checklist for Every Test

- [ ] Uses `buildUniqueName()` for all created resources
- [ ] Creates all resources it needs
- [ ] Cleans up created resources (try-finally for tests that mutate data)
- [ ] No shared state with other tests
- [ ] Works when run alone: `npx playwright test --grep "test name"`

---

### Test Structure — AAA Pattern with Custom Fixtures

```typescript
import { test, expect, toAppUrl } from './fixtures'
import { buildUniqueName, createBasicWorkflow } from './helpers/workflows'

test('user creates and verifies a workflow', async ({ app }) => {
  // Arrange — app is already navigated to base URL by fixture
  const workflowName = buildUniqueName('e2e-workflow')

  // Act — create workflow
  await createBasicWorkflow(app, workflowName, 'Test action')

  // Assert — verify workflow exists in list
  await app.goto(toAppUrl('/workflows'))
  await app.getByPlaceholder('Filter by name').fill(workflowName)
  await app.getByRole('button', { name: 'Apply filter' }).click()
  await expect(app.getByRole('row', { name: new RegExp(workflowName) })).toBeVisible()
})
```

**Key patterns:**

- ✅ Import from `'./fixtures'` (NOT `'@playwright/test'`)
- ✅ Use `{ app }` fixture (NOT `{ page }`)
- ✅ Use `toAppUrl('/path')` for navigation
- ✅ Use `buildUniqueName(prefix)` for unique test data
- ✅ Use existing helpers (`createBasicWorkflow`, `addNodePanel` for the **Add step** panel, etc.)

**Grouping related tests:**

```typescript
test.describe('Workflow Filtering', () => {
  test('full user flow: add filters → view results → clear filters', async ({ app }) => {
    // ...
  })

  test('filter state persists across navigation', async ({ app }) => {
    // ...
  })
})
```

**Conditional skipping** for data-dependent tests:

```typescript
const hasRunning = await runningRow
  .waitFor({ state: 'visible', timeout: 5000 })
  .then(() => true)
  .catch(() => false)
test.skip(!hasRunning, 'Mock API has no running execution; seed data required')
```

---

### Locators — Accessibility-First

Follow this priority:

1. **`getByRole`** — buttons, headings, links, textboxes, grids, rows
2. **`getByLabel`** — form inputs with `<label>`
3. **`getByPlaceholder`** — inputs with placeholder text
4. **`getByText`** — visible text content
5. **`getByTestId`** — last resort when no accessible query works

```typescript
// ✅ BEST: Accessible queries
await app.getByRole('button', { name: 'Save' }).click()
await app.getByLabel('Name').fill('My Workflow')
await app.getByPlaceholder('Filter by name').fill('test')
await app.getByRole('heading', { name: /workflows/i })
await app.getByRole('grid', { name: 'Workflows table' })

// ⚠️ ACCEPTABLE: When no semantic alternative exists
await app.getByTestId('workflow-builder-canvas').click()

// ❌ BAD: CSS selectors
await app.locator('.pf-v6-c-button').click()
```

**Scoping locators to containers:**

```typescript
// ✅ Scoped to Add step panel (helper name is addNodePanel)
const panel = addNodePanel(app)
await panel.getByRole('button', { name: 'Action', exact: true }).click()

// ✅ Scoped to a row
const row = app.getByRole('row', { name: new RegExp(workflowName) })
await row
  .getByRole('button', { name: /Actions|Kebab toggle/i })
  .first()
  .click({ force: true })

// ✅ Scoped to toolbar (PatternFly filter chips)
const nameChipGroup = app.locator('#filter-toolbar').getByRole('list', { name: 'Name' })
await expect(nameChipGroup.getByText('workflow')).toBeVisible()
```

**Use heading level to avoid strict mode violations in empty states:**

```typescript
// ❌ BAD: Matches both h1 "Integrations" and h2 "No integrations..." in empty state
await expect(app.getByRole('heading', { name: 'Integrations' })).toBeVisible()

// ✅ GOOD: Targets only the h1 page title
await expect(app.getByRole('heading', { level: 1, name: 'Integrations' })).toBeVisible()
```

**Use exact matching to avoid ambiguity:**

```typescript
// ✅ Exact match — won't match "Add step panel" or "Add step type"
await app.getByRole('button', { name: /^Add step$/ }).click()

// ✅ Exact flag
await panel.getByRole('button', { name: 'Script', exact: true }).click()
```

---

### Web-First Assertions

Playwright assertions auto-retry until the condition is met or timeout. Always use web-first assertions:

```typescript
// ✅ GOOD: Auto-retrying assertion — waits for element
await expect(app.getByRole('heading', { name: 'Workflows' })).toBeVisible()
await expect(app).toHaveURL(/workflow-builder\/.+/)
await expect(app.getByPlaceholder('Workflow name')).toHaveValue(workflowName)

// ❌ BAD: Manual check — no retry, flaky
const heading = await app.getByRole('heading').textContent()
expect(heading).toBe('Workflows')
```

**Common web-first assertions:**

| Assertion           | Use for                         |
| ------------------- | ------------------------------- |
| `toBeVisible()`     | Element is visible on page      |
| `toHaveText()`      | Element has exact/matching text |
| `toContainText()`   | Element contains text           |
| `toHaveValue()`     | Input has value                 |
| `toHaveURL()`       | Page URL matches                |
| `toHaveCount()`     | Number of matching elements     |
| `not.toBeVisible()` | Element disappeared             |

---

### Auto-Waiting — Let Playwright Handle It

Playwright auto-waits for elements to be actionable before performing actions. **Do not add manual waits.**

```typescript
// ❌ BAD: Manual timeout — fragile, slow
await app.waitForTimeout(2000)
await app.getByRole('button', { name: 'Save' }).click()

// ✅ GOOD: Playwright auto-waits for button to be actionable
await app.getByRole('button', { name: 'Save' }).click()

// ✅ GOOD: Wait for specific UI condition before proceeding
await expect(app.getByRole('heading', { name: 'Select a trigger step' })).toBeVisible()
```

**When you need longer timeouts** (e.g., slow backend operations):

```typescript
await expect(app.getByText(/completed/i)).toBeVisible({ timeout: 30_000 })
```

---

### Cleanup Pattern

When tests create resources, clean up in try-finally so cleanup runs even if assertions fail:

```typescript
test('edits a workflow name', async ({ app }) => {
  const workflowName = buildUniqueName('e2e-edit')
  await createBasicWorkflow(app, workflowName, 'Initial task')

  try {
    await app.goto(toAppUrl('/workflows'))
    await app.getByPlaceholder('Filter by name').fill(workflowName)
    await app.getByRole('button', { name: 'Apply filter' }).click()
    await app.getByRole('button', { name: workflowName, exact: true }).click()

    const updatedName = `${workflowName}-updated`
    await app.getByPlaceholder('Workflow name').fill(updatedName)
    await app.getByRole('button', { name: 'Save' }).click()

    await app.goto(toAppUrl('/workflows'))
    await app.getByPlaceholder('Filter by name').fill(updatedName)
    await app.getByRole('button', { name: 'Apply filter' }).click()
    await expect(app.getByRole('button', { name: updatedName, exact: true })).toBeVisible()
  } finally {
    // Delete via UI kebab menu
    await app.goto(toAppUrl('/workflows'))
    const searchTerm = workflowName.slice(0, 20)
    await app.getByPlaceholder('Filter by name').fill(searchTerm)
    await app.getByRole('button', { name: 'Apply filter' }).click()
    const row = app.getByRole('row', { name: new RegExp(workflowName) })
    if ((await row.count()) > 0) {
      await row
        .getByRole('button', { name: /Actions|Kebab toggle/i })
        .first()
        .click({ force: true })
      await app.getByRole('menuitem', { name: 'Delete workflow' }).click()
      await app.getByRole('button', { name: 'Delete' }).click()
    }
  }
})
```

**Read-only tests** (filtering, viewing, accessibility scans) that don't create resources don't need cleanup.

---

### Data-Dependent Tests — Skip When Seed Data Is Missing

Tests that depend on pre-existing data (filtering, pagination, approvals) must gracefully skip when that data isn't available. Use `test.skip()` with a condition:

```typescript
// Skip individual tests when required data is missing
const table = app.getByRole('grid', { name: 'Approvals table' })
const hasTable = await table
  .waitFor({ state: 'visible', timeout: 5000 })
  .then(() => true)
  .catch(() => false)
test.skip(!hasTable, 'No approval data available; seed data required')
```

For test suites that all depend on the same data, use `test.beforeEach`:

```typescript
test.describe('Integration Filtering', () => {
  test.beforeEach(async ({ app }) => {
    await app.goto(toAppUrl('/configuration/integrations'))
    await expect(app.getByRole('heading', { level: 1, name: 'Integrations' })).toBeVisible()
    const table = app.getByRole('grid', { name: 'Integrations table' })
    const hasTable = await table
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!hasTable, 'No integration data available; seed data required')
  })

  test('keyword search: filter by name', async ({ app }) => {
    // Only runs when integrations exist
  })
})
```

This ensures tests work against both mock API (with seed data) and real backend (without seed data).

---

### Resource Utility Pattern (Recommended for Real Backend)

For faster test setup/teardown when running against a real backend, create API-based resource utilities in `packages/nexus-ui/e2e/utils/`.

**This directory doesn't exist yet — create it when needed:**

```typescript
// packages/nexus-ui/e2e/utils/workflows.ts
import { type Page } from '@playwright/test'
import { buildUniqueName } from '../helpers/workflows'

const apiBaseUrl = process.env.VITE_API_URL ?? 'http://localhost:3300'

export const WorkflowResource = {
  api: {
    create: async (app: Page, options: { name?: string; description?: string } = {}) => {
      const name = options.name ?? buildUniqueName('e2e-workflow')
      const response = await app.request.post(`${apiBaseUrl}/api/v1/workflows`, {
        data: {
          name,
          description: options.description ?? 'Created via API for E2E testing',
          trigger: { type: 'manual' },
          actions: [],
        },
      })
      const workflow = (await response.json()) as { id: string; name: string }
      return { id: workflow.id, name: workflow.name }
    },

    delete: async (app: Page, workflowId: string) => {
      await app.request.delete(`${apiBaseUrl}/api/v1/workflows/${workflowId}`)
    },
  },
}
```

**Usage:**

```typescript
test('user executes a workflow', async ({ app }) => {
  // Fast API-based setup
  const { id } = await WorkflowResource.api.create(app)

  try {
    // Test via UI (what users actually do)
    await app.goto(toAppUrl(`/workflows/${id}`))
    await app.getByRole('button', { name: 'Execute' }).click()
    await expect(app.getByText(/execution started/i)).toBeVisible()
  } finally {
    // Fast API-based cleanup
    await WorkflowResource.api.delete(app, id)
  }
})
```

**Benefits:** Fast setup (skips UI), reliable cleanup, test what matters (use UI for assertions, API for setup/teardown).

**Keep API paths in sync:** The paths used in resource utilities (e.g., `/api/v1/workflows`) must match the real backend OpenAPI contract. When backend endpoints change, update these helpers to match. Run `npm run gen` to regenerate contracts and verify paths against the generated types in `@ansible/nexus-contracts`.

---

### Multi-Tab Testing

Some tests verify URL shareability by opening a URL in a new tab. Use the `context` fixture:

```typescript
test('shareable URLs: filters restored from URL', async ({ app, context }) => {
  // Apply filters...
  const urlWithFilters = app.url()

  // Open in new tab (simulate sharing URL)
  const newPage = await context.newPage()
  await newPage.goto(urlWithFilters)

  // Assert filters restored
  await expect(newPage.getByRole('heading', { name: 'Workflows' })).toBeVisible()
  // ...verify filter chips

  await newPage.close()
})
```

---

### Coverage Categories

| Category             | Description                     | Example                                          |
| -------------------- | ------------------------------- | ------------------------------------------------ |
| **Happy paths**      | Primary success flows           | Create workflow → save → verify in list          |
| **Edge cases**       | Boundary conditions             | Empty list, max-length names, special characters |
| **Error states**     | Validation and backend failures | Name conflicts, required field validation        |
| **Filtering/search** | URL-based filter state          | Apply filters → share URL → verify restored      |
| **Accessibility**    | WCAG compliance                 | axe-core scans on each page                      |
| **Multi-tab**        | Shareable URLs                  | Open filtered URL in new tab                     |

---

## Phase 3 — Execution

### Running Tests

```bash
# Default mode (mock API auto-started)
npm run e2e

# With Playwright UI (debugging)
npm run e2e:ui

# Specific test file
cd packages/nexus-ui
npx playwright test e2e/automations.spec.ts

# Specific test by name
npx playwright test --grep "user creates"

# Headed mode (see browser)
npx playwright test --headed

# Real backend mode (see Prerequisites)
NEXUS_E2E_SKIP_WEB_SERVER=1 NEXUS_E2E_BASE_URL=http://localhost:5173 npx playwright test
```

### Debugging Failures

```bash
# Playwright Inspector (step through test)
npx playwright test --debug e2e/automations.spec.ts

# View trace after failure (traces saved on failure by config)
npx playwright show-trace test-results/*/trace.zip
```

**Common issues:**

| Problem                 | Cause                               | Fix                                                    |
| ----------------------- | ----------------------------------- | ------------------------------------------------------ |
| Locator not found       | Wrong role or element doesn't exist | Use Playwright Inspector to inspect the page           |
| Timeout                 | Slow response or missing element    | Check if element actually appears; increase timeout    |
| Parallel test conflicts | Hardcoded names                     | Use `buildUniqueName()` everywhere                     |
| Cleanup failed          | Resource already deleted            | Add `.count() > 0` guard or try-catch in finally block |
| Connection refused      | Backend/mock API not running        | Check webServer config or start services manually      |

---

## Constraints

**NEVER:**

- ❌ Import from `@playwright/test` directly (use `./fixtures`)
- ❌ Use `{ page }` fixture (use `{ app }`)
- ❌ Hardcode URLs (use `toAppUrl('/path')`)
- ❌ Hardcode resource names (use `buildUniqueName()`)
- ❌ Hardcode expected counts or assume a clean database (filter to find your data)
- ❌ Assert on rows being visible without filtering first (other data may push them off-page)
- ❌ Share state between tests
- ❌ Use `page.waitForTimeout()` — rely on auto-waiting and web-first assertions
- ❌ Assert on CSS classes or internal state
- ❌ Access React internals via `page.evaluate()`
- ❌ Leave test data in database when testing against real backend

**ALWAYS:**

- ✅ Import `{ test, expect, toAppUrl }` from `'./fixtures'`
- ✅ Use `{ app }` fixture
- ✅ Use `buildUniqueName(prefix)` for all test data
- ✅ Each test creates its own resources
- ✅ Filter by unique name before asserting on created data (never assume visibility on first page)
- ✅ Use try-finally for cleanup when creating resources
- ✅ Use semantic locators (`getByRole`, `getByLabel`)
- ✅ Use web-first assertions (`expect(locator).toBeVisible()`)
- ✅ Use existing helpers before writing new ones
- ✅ Follow AAA pattern (Arrange, Act, Assert)
- ✅ Match existing test style and conventions

---

## Validation Checklist

Before considering tests complete:

### Test Quality

- [ ] Tests import from `'./fixtures'` (not `'@playwright/test'`)
- [ ] Tests use `{ app }` fixture (not `{ page }`)
- [ ] Navigation uses `toAppUrl('/path')`
- [ ] Semantic locators used (minimal `getByTestId`)
- [ ] Web-first assertions used (no manual waits)
- [ ] Tests follow AAA pattern
- [ ] TypeScript compiles with zero errors

### Test Isolation

- [ ] All resource names use `buildUniqueName()`
- [ ] Each test creates its own resources
- [ ] Resources cleaned up (try-finally for mutating tests)
- [ ] No shared state between tests
- [ ] No hardcoded counts or clean-slate assumptions
- [ ] Created resources found via filter (not by assuming page position)
- [ ] Tests work alone: `npx playwright test --grep "test name"`
- [ ] Tests work in full suite: `npm run e2e`
- [ ] Duplicated cleanup/setup logic extracted into `e2e/helpers/` or `e2e/utils/` resource helpers

### Verification

```bash
npm run e2e

# Run specific test alone
cd packages/nexus-ui && npx playwright test --grep "specific test"

# TypeScript compiles
cd packages/nexus-ui && npx tsc --noEmit
```

---

## Deliverables

1. **Test files** — `packages/nexus-ui/e2e/*.spec.ts`
2. **Helpers** — Reusable functions in `packages/nexus-ui/e2e/helpers/`
3. **Resource utilities** — `packages/nexus-ui/e2e/utils/` (if creating API-based setup/teardown)
4. **Coverage summary** — Brief comment documenting features, edge cases, and known gaps
