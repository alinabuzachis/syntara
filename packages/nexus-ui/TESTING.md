# Testing Guide

## Quick Start

```bash
# Standard tests (fast, jsdom)
npm test                    # Run all tests with linting and type checking
npm run vitest              # Run tests only
npm run test:ui             # Interactive test UI

# Coverage
npm run test:coverage       # Generate coverage report

# Browser mode tests (real browser)
npm run test:browser        # Run browser tests headless
npm run test:browser:headed # Watch in browser
npm run test:browser:ui     # Browser tests with Vitest UI
```

## Coverage Requirements

**All new and modified files should meet 80% coverage:**

- Statements: 80%
- Branches: 80%
- Functions: 80%
- Lines: 80%

### How It Works

1. **Write your code** - Create or modify source files in `src/`
2. **Write tests** - Aim for 80%+ coverage on your changes
3. **Run coverage locally** - `npm run test:coverage`
4. **CI runs tests** - Coverage report is generated on every PR

**Incremental coverage** - Coverage is enforced only on files changed in your PR. Existing code can improve gradually while ensuring new code is well-tested.

### CI Enforcement

CI automatically checks coverage for changed source files using `scripts/check-pr-coverage.js`:

```bash
# Run locally to check your changes
npm run test:coverage           # Generate coverage report
npm run test:coverage:check     # Check coverage for changed files
```

The check will **fail the PR** if any changed source file has less than 80% coverage on any of the four metrics: lines, statements, functions, or branches.

## Test File Naming

- **Standard tests**: `*.test.ts`, `*.test.tsx` (uses jsdom)
- **Browser tests**: `*.browser.test.tsx` (uses Playwright)

## When to Use Browser Mode

Use browser mode (`*.browser.test.tsx`) when testing:

- **Browser APIs**: IntersectionObserver, ResizeObserver, MutationObserver
- **Canvas/WebGL**: Any rendering that requires canvas context
- **Layout**: Accurate getBoundingClientRect calculations
- **Drag & Drop**: Real DataTransfer API behavior
- **Visual**: Screenshot or visual regression testing

**Default to jsdom** for everything else - it's much faster.

**Why?** jsdom simulates browser behavior in Node.js (fast), while browser mode runs tests in real browsers (slower but more accurate). Browser mode eliminates false positives/negatives from simulation gaps. See [Vitest Browser Mode docs](https://vitest.dev/guide/browser/) for details.

## Industry Best Practices (80% Coverage)

### What to Test

1. **Happy path** - Most common user flow
2. **Error cases** - At least one error scenario
3. **Edge cases** - Boundary conditions (empty, null, max values)
4. **User interactions** - All clickable elements and form inputs

### Example

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

### AAA Pattern

Structure all tests with:

```typescript
it('should do something', async () => {
  // Arrange - Set up test data
  const user = userEvent.setup()
  render(<Component />)

  // Act - Perform the action
  await user.click(screen.getByRole('button'))

  // Assert - Verify the outcome
  expect(screen.getByText('Result')).toBeInTheDocument()
})
```

## Coverage Targets by Type

| Type      | Coverage Target | Focus                              |
| --------- | --------------- | ---------------------------------- |
| Component | 80%+            | User interactions, rendering, a11y |
| Hook      | 80%+            | State transitions, return values   |
| Store     | 80%+            | Actions, edge cases                |
| Utility   | 90%+            | Input/output, boundary conditions  |

## What NOT to Test

- Implementation details (internal state, private methods)
- Third-party library behavior
- Static content that doesn't change
- Generated files (\*.d.ts, mockData, API contracts)

## Why 80%?

- **Industry standard**: Google, Airbnb, Netflix use 80-90%
- **Catches most bugs**: Diminishing returns beyond 80%
- **Balanced**: Thoroughness without slowing development
- **Focuses on value**: Critical paths over trivial code

## CI Integration

### CI Strategy

**Every PR:**

```bash
npm run test:coverage  # jsdom tests with coverage report
```

**Browser Tests (Selective):**
Run browser tests only when needed:

- Components using IntersectionObserver, ResizeObserver
- Canvas/WebGL rendering
- Real layout calculations
- Manual validation before releases

### Why Not Run Browser Tests on Every Commit?

**Performance:**

- jsdom: ~5-15 seconds
- Browser: ~30-60 seconds (Playwright overhead)

**Coverage:**

- 90%+ of tests work in jsdom
- Only use browser mode for specific APIs
- Following `*.browser.test.tsx` naming = few browser tests

### CI Workflow

See [.github/workflows/pull-request.yml](../../.github/workflows/pull-request.yml) for:

- Standard tests with coverage on every PR
- Container build validation

Coverage reports are generated in CI. View them locally with `npm run test:coverage`.

## Browser Mode Details

### Configuration

Browser tests use [vitest.browser.config.ts](vitest.browser.config.ts):

- **Provider**: Playwright (Chromium)
- **Headless**: Yes (by default)
- **Screenshots**: On failure
- **Pattern**: `**/*.browser.test.tsx`

### Browser Mode Example

```typescript
// Component using IntersectionObserver
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

For more examples and guidance, see the [Testing Guidelines in CLAUDE.md](../../CLAUDE.md#testing-guidelines).

## Troubleshooting

### Coverage check fails for unmodified file

- Verify file was actually modified: `git status`
- Check if file is in `.gitignore`
- Ensure tests are running: `npm run test:coverage`

### Browser tests timeout

- Increase timeout in test: `it('test', { timeout: 10000 })`
- Check if element selectors are correct
- Run headed to debug: `npm run test:browser:headed`

### Coverage report missing

- Run coverage first: `npm run test:coverage`
- Check for `coverage/coverage-summary.json`
- Ensure tests actually ran

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Vitest Browser Mode](https://vitest.dev/guide/browser/)
- [CLAUDE.md Testing Guidelines](../../CLAUDE.md#testing-guidelines)

## Playwright Integration Tests

Playwright integration tests live in `packages/nexus-ui/e2e` and exercise full user workflows.

### Environment

Tests run against the mock backend by default.
The Playwright config starts:

- UI on port `4173`
- Mock API on port `3300`

Override with:

```bash
NEXUS_E2E_PORT=5174 NEXUS_E2E_API_PORT=3301 npm run test:nexus-ui:e2e
```

### Selector Strategy (Required)

- Prefer `getByRole`, `getByLabel`, `getByText`
- Use `getByPlaceholder` only when no label exists
- Add `aria-label` to UI elements when a semantic locator is missing
- Avoid `data-testid` unless absolutely necessary
- No CSS/XPath selectors in integration tests

### Example Pattern (AAA)

```ts
test('user creates an automation', async ({ page }) => {
  // Arrange - Start from the list
  await page.goto('/automations')

  // Act - Create a workflow
  await page.getByRole('button', { name: 'Create automation' }).click()
  await page.getByPlaceholder('Workflow name').fill('Example workflow')
  await page.getByRole('button', { name: 'Save' }).click()

  // Assert - Saved workflow appears
  await expect(page.getByText('Workflow created successfully')).toBeVisible()
})
```
