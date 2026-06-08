# Filter Test Helpers - Usage Guide

This guide explains how to use the shared filter test helpers to write better tests for server-side filtering across list pages.

## Overview

The filter test helpers in `src/test/filter-test-helpers.ts` provide utilities for testing URL parameter updates when filters are applied. They simplify test code and provide clear error messages when assertions fail.

## Available Helpers

### `getLastSearchParams(mockSetSearchParams)`

Gets the most recent `URLSearchParams` from a mocked `setSearchParams` function.

```typescript
const params = getLastSearchParams(mockSetSearchParams)
expect(params?.get('name[contains]')).toBe('test')
```

### `assertUrlParam(mockSetSearchParams, key, expectedValue)`

Asserts that a specific URL parameter was set to an expected value. Provides clear error messages on failure.

```typescript
// Verify filter parameter was set correctly
await waitFor(() => {
  assertUrlParam(mockSetSearchParams, 'name[contains]', 'test')
})
```

### `assertUrlParamIsNull(mockSetSearchParams, key)`

Asserts that a specific URL parameter is null (not present in URL). Useful for verifying pagination cursor resets.

```typescript
// Verify cursor was reset when filter changed
await waitFor(() => {
  assertUrlParamIsNull(mockSetSearchParams, 'cursor')
})
```

### `assertSearchParamsWasCalled(mockSetSearchParams)`

Asserts that `setSearchParams` was called at least once.

```typescript
await waitFor(() => {
  assertSearchParamsWasCalled(mockSetSearchParams)
})
```

---

## Why Use These Helpers?

### Before (Without Helpers) ❌

```typescript
it('applies name filter', async () => {
  await user.type(nameInput, 'test')
  await user.keyboard('{Enter}')

  await waitFor(() => {
    expect(mockSetSearchParams).toHaveBeenCalledWith(expect.any(URLSearchParams))
    const lastCall = vi.mocked(mockSetSearchParams).mock.calls[vi.mocked(mockSetSearchParams).mock.calls.length - 1][0]
    expect(lastCall.get('name[contains]')).toBe('test')
  })
})
```

**Problems:**

- Verbose boilerplate code
- Easy to make mistakes accessing mock calls
- Generic error messages don't show which parameter failed
- Difficult to read and maintain

### After (With Helpers) ✅

```typescript
it('applies name filter to API query when typing and submitting', async () => {
  await user.type(nameInput, 'test')
  await user.keyboard('{Enter}')

  await waitFor(() => {
    assertUrlParam(mockSetSearchParams, 'name[contains]', 'test')
  })
})
```

**Benefits:**

- ✅ Clear, concise, readable
- ✅ Less boilerplate code
- ✅ Clear error messages: `Expected URL parameter "name[contains]" to be "expected", but got "actual"`
- ✅ Type-safe with TypeScript
- ✅ Easy to maintain
- ✅ Consistent testing pattern across all pages

---

## Usage Examples by Page

### Approvals (✅ Already Implemented)

**File:** `src/routes/approvals/Approvals.test.tsx`

```typescript
import { assertUrlParam, assertUrlParamIsNull } from '../../test/filter-test-helpers'

describe('Filter Functionality', () => {
  it('applies name filter to API query when typing and submitting', async () => {
    const user = userEvent.setup()
    mockApprovalsQuery(mockApprovals)
    render(<Approvals />)

    const nameInput = screen.getByRole('textbox', { name: /name filter/i })
    await user.type(nameInput, 'test')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      assertUrlParam(mockSetSearchParams, 'name[contains]', 'test')
    })
  })

  it('applies status filter to API query when selecting option', async () => {
    const user = userEvent.setup()
    mockApprovalsQuery(mockApprovals)
    render(<Approvals />)

    // Switch to status filter and select "Pending"
    const fieldSelectorButton = screen.getByRole('button', { name: 'Name' })
    await user.click(fieldSelectorButton)

    const statusOption = await screen.findByRole('option', { name: 'Status' })
    await user.click(statusOption)

    const statusValueButton = await screen.findByRole('button', { name: /filter by status/i })
    await user.click(statusValueButton)

    const pendingOption = await screen.findByRole('option', { name: 'Pending' })
    await user.click(pendingOption)

    await waitFor(() => {
      assertUrlParam(mockSetSearchParams, 'status', 'pending')
    })
  })

  it('resets pagination cursor when filters change', async () => {
    // ... setup with pagination cursor ...

    // Apply a filter
    const nameInput = screen.getByRole('textbox', { name: /name filter/i })
    await user.type(nameInput, 'test')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      assertUrlParamIsNull(mockSetSearchParams, 'cursor')
    })
  })
})
```

---

### Integrations (Recommended Enhancement)

**File:** `src/routes/configuration/integrations/Integrations.test.tsx`

**Current test (only checks input value):**

```typescript
it('allows applying filters via text input', async () => {
  const user = userEvent.setup()
  render(<Integrations />, { wrapper })

  const textInput = screen.getByRole('textbox', { name: /name filter/i })
  await user.type(textInput, 'test')

  // ❌ Only checks UI state, not API contract
  expect(textInput).toHaveValue('test')
})
```

**Recommended enhancement:**

```typescript
import { assertUrlParam } from '../../../test/filter-test-helpers'

it('applies name filter to API query when typing and submitting', async () => {
  const user = userEvent.setup()
  render(<Integrations />, { wrapper })

  const textInput = screen.getByRole('textbox', { name: /name filter/i })
  await user.type(textInput, 'test')
  await user.keyboard('{Enter}')

  // ✅ Verifies both UI state AND API contract
  expect(textInput).toHaveValue('test')
  await waitFor(() => {
    assertUrlParam(mockSetSearchParams, 'name[contains]', 'test')
  })
})

it('applies status filter when selecting option', async () => {
  const user = userEvent.setup()
  render(<Integrations />, { wrapper })

  // Switch to status filter
  const fieldButton = screen.getByRole('button', { name: /name/i })
  await user.click(fieldButton)
  await user.click(await screen.findByRole('option', { name: /status/i }))

  // Select "Available"
  const statusButton = await screen.findByRole('button', { name: /filter by status/i })
  await user.click(statusButton)
  await user.click(await screen.findByRole('option', { name: 'Available' }))

  await waitFor(() => {
    assertUrlParam(mockSetSearchParams, 'status', 'available')
  })
})

it('applies integration type filter', async () => {
  const user = userEvent.setup()
  render(<Integrations />, { wrapper })

  // Switch to integration type filter
  const fieldButton = screen.getByRole('button', { name: /name/i })
  await user.click(fieldButton)
  await user.click(await screen.findByRole('option', { name: /integration type/i }))

  // Select "MCP Server"
  const typeButton = await screen.findByRole('button', { name: /filter by integration type/i })
  await user.click(typeButton)
  await user.click(await screen.findByRole('option', { name: 'MCP Server' }))

  await waitFor(() => {
    assertUrlParam(mockSetSearchParams, 'provider_type', 'mcp')
  })
})
```

---

### Integration Tools (Recommended Enhancement)

**File:** `src/routes/configuration/integrations/IntegrationTools.test.tsx`

```typescript
import { assertUrlParam } from '../../../test/filter-test-helpers'

it('applies name filter to API query', async () => {
  const user = userEvent.setup()
  render(<IntegrationTools />)

  const nameInput = screen.getByRole('textbox', { name: /name filter/i })
  await user.type(nameInput, 'search-term')
  await user.keyboard('{Enter}')

  await waitFor(() => {
    assertUrlParam(mockSetSearchParams, 'name[contains]', 'search-term')
  })
})
```

---

### Workflows (Recommended Enhancement)

**File:** `src/routes/workflows/Workflows.test.tsx`

```typescript
import { assertUrlParam } from '../../test/filter-test-helpers'

it('applies name filter to API query', async () => {
  const user = userEvent.setup()
  render(<Workflows />)

  const nameInput = screen.getByRole('textbox', { name: /name filter/i })
  await user.type(nameInput, 'deploy')
  await user.keyboard('{Enter}')

  await waitFor(() => {
    assertUrlParam(mockSetSearchParams, 'name[contains]', 'deploy')
  })
})

it('applies state filter (is_enabled) with boolean conversion', async () => {
  const user = userEvent.setup()
  render(<Workflows />)

  // Switch to state filter
  const fieldButton = screen.getByRole('button', { name: /name/i })
  await user.click(fieldButton)
  await user.click(await screen.findByRole('option', { name: /state/i }))

  // Select "Enabled"
  const stateButton = await screen.findByRole('button', { name: /filter by state/i })
  await user.click(stateButton)
  await user.click(await screen.findByRole('option', { name: 'Enabled' }))

  await waitFor(() => {
    assertUrlParam(mockSetSearchParams, 'is_enabled', 'true')
  })
})
```

---

## Error Messages

The helpers provide clear, actionable error messages:

### When parameter doesn't match expected value:

```text
Expected URL parameter "name[contains]" to be "expected", but got "actual"
```

### When parameter is not null:

```text
Expected URL parameter "cursor" to be null, but got "page-2"
```

### When setSearchParams was never called:

```text
Expected setSearchParams to be called, but it was not called.
Cannot verify URL parameter "name[contains]"
```

---

## Implementation Checklist

When adding filter tests to a page:

- [ ] Import helpers: `import { assertUrlParam, assertUrlParamIsNull } from '../../test/filter-test-helpers'`
- [ ] Test name filter with `contains` operator
- [ ] Test each select filter (status, type, etc.)
- [ ] Test pagination cursor reset when filters change
- [ ] Test clear all filters functionality
- [ ] Verify tests use `waitFor` for async URL updates
- [ ] Check that test names describe API contract verification

---

## Best Practices

1. **Always use `waitFor`** when asserting URL parameters (they update asynchronously)

   ```typescript
   await waitFor(() => {
     assertUrlParam(mockSetSearchParams, 'key', 'value')
   })
   ```

2. **Test realistic user interactions** - type and press Enter, click buttons in sequence

   ```typescript
   await user.type(input, 'text')
   await user.keyboard('{Enter}') // Simulates form submission
   ```

3. **Test parameter format matches API contract**
   - Name filter: `name[contains]=value`
   - Date range: `created_at[gte]=2024-01-01`
   - Exact match: `status=pending`

4. **Test cursor reset** - Verify pagination resets when filters change

   ```typescript
   assertUrlParamIsNull(mockSetSearchParams, 'cursor')
   ```

5. **Use descriptive test names** - Mention "API query" or "URL params" to clarify what's being tested
   ```typescript
   it('applies name filter to API query when typing and submitting', ...)
   ```

---

## Migration Guide

### Step 1: Import the helpers

```typescript
import { assertUrlParam, assertUrlParamIsNull } from '../../test/filter-test-helpers'
```

### Step 2: Replace manual assertions

**Before:**

```typescript
const lastCall = vi.mocked(mockSetSearchParams).mock.calls[vi.mocked(mockSetSearchParams).mock.calls.length - 1][0]
expect(lastCall.get('name[contains]')).toBe('test')
```

**After:**

```typescript
assertUrlParam(mockSetSearchParams, 'name[contains]', 'test')
```

### Step 3: Add missing filter tests

- Check which filters exist in the page's filter definitions
- Add tests for each filter type
- Include cursor reset test

### Step 4: Run tests

```bash
npm run vitest -- src/routes/[page]/[Page].test.tsx
```

---

## Summary

The filter test helpers improve test quality by:

1. ✅ **Reducing boilerplate** - Less code to write and maintain
2. ✅ **Improving readability** - Clear, self-documenting assertions
3. ✅ **Better error messages** - Know exactly what failed and why
4. ✅ **Consistency** - Same pattern across all list pages
5. ✅ **API contract verification** - Tests catch backend changes early

**Recommendation:** Use these helpers for all new filter tests and gradually migrate existing tests during routine maintenance.
