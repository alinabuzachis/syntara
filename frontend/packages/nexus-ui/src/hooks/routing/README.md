# Routing Bridge Hooks

This directory contains thin bridge hooks and components that abstract routing away from any specific router library. **Always import routing primitives from here — never directly from `wouter`.**

## Why this exists

The codebase is migrating from [wouter](https://github.com/molefrog/wouter) to [TanStack Router](https://tanstack.com/router). These bridges are the migration seam: each hook and component has both a wouter and a TanStack implementation. The active router is chosen **once at module load time** via a localStorage flag — no code changes are needed in consumers.

An ESLint `no-restricted-imports` rule warns on any direct `wouter` import outside this directory, guiding new code and migrations toward the bridge.

## Router flag

Set `nexus-ui-router` in `localStorage` before the page loads to activate TanStack Router:

```js
// In the browser console — then reload the page
localStorage.setItem('nexus-ui-router', 'tanstack')
// To revert:
localStorage.removeItem('nexus-ui-router')
```

The flag is read once at module scope in `src/app/routerFlag.ts`. A page reload is required for changes to take effect. The boot log in the browser console shows which router is active and how to switch.

## Available exports

| Export            | Replaces                                      | Purpose                                                                 |
| ----------------- | --------------------------------------------- | ----------------------------------------------------------------------- |
| `useLocation`     | `useLocation` from `wouter`                   | Current path + navigate function, returned as `[path, navigate]`        |
| `useNavigate`     | `useLocation()[1]` from `wouter`              | Imperative `navigate(path, options?)` for use inside components         |
| `useParams`       | `useParams` from `wouter`                     | Typed route parameters from the closest matching `<Route>`              |
| `useSearch`       | `useSearch` from `wouter`                     | Raw URL search string (e.g. `"?status=running"`)                        |
| `useSearchParams` | `useSearchParams` from `wouter`               | `[URLSearchParams, setSearchParams]` for structured query-string access |
| `navigate`        | `navigate` from `wouter/use-browser-location` | Imperative navigation for use **outside** React components              |
| `Link`            | `Link` from `wouter`                          | Anchor-based navigation link                                            |

## Migrating an existing file

1. Replace `import { useLocation, useParams, ... } from 'wouter'` with imports from the corresponding bridge module:

   ```ts
   // Before
   import { useLocation, useParams } from 'wouter'

   // After
   import { useLocation } from '../hooks/routing/useLocation'
   import { useParams } from '../hooks/routing/useParams'
   ```

2. Replace `import { navigate } from 'wouter/use-browser-location'` with:

   ```ts
   import { navigate } from '../hooks/routing/navigate'
   ```

3. Replace `import { Link } from 'wouter'` with:

   ```ts
   import { Link } from '../hooks/routing/Link'
   ```

4. Run `npm run lint` — the `no-restricted-imports` warning for that file should be gone.

## Testing

Each bridge hook test file covers both routers in separate `describe` blocks.

**Wouter tests** use `createTestRouter` from `src/test/createTestRouter.tsx`:

```ts
import { createTestRouter } from '../../test/createTestRouter'

const wrapper = createTestRouter('/workflows/abc-123', '/workflows/:workflowId')
const { result } = renderHook(() => useParams<{ workflowId: string }>(), { wrapper })
```

**TanStack tests** mock the router flag and use `createTanStackTestRouter` from `src/test/createTanStackTestRouter.tsx`. Because bridge hooks are assigned at module scope, each TanStack test block must reset modules and re-import dynamically:

```ts
import { createTanStackTestRouter } from '../../test/createTanStackTestRouter'

describe('useParams (tanstack)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doMock('../../app/routerFlag', () => ({ isTanStackRouter: () => true }))
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('extracts a typed param', async () => {
    const { useParams } = await import('./useParams')
    const wrapper = await createTanStackTestRouter('/workflows/abc-123', '/workflows/:workflowId')
    const { result } = renderHook(() => useParams<{ workflowId: string }>(), { wrapper })
    await waitFor(() => expect(result.current.workflowId).toBe('abc-123'))
  })
})
```

`createTanStackTestRouter` accepts an optional wouter-style route pattern (`:param`) and converts it to TanStack syntax (`$param`) automatically.
