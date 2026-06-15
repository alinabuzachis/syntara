# Routing Bridge Hooks

This directory contains thin bridge hooks and components that abstract routing away from any specific router library. **Always import routing primitives from here — never directly from `wouter`.**

## Why this exists

The codebase is migrating from [wouter](https://github.com/molefrog/wouter) to [TanStack Router](https://tanstack.com/router). These bridges are the migration seam: each hook and component currently delegates to wouter, but their implementations will be swapped to TanStack Router once migration is complete. Consumers import from `src/hooks/routing/` and require no changes when the underlying router switches.

An ESLint `no-restricted-imports` rule warns on any direct `wouter` import outside this directory, guiding new code and migrations toward the bridge.

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

Use `createTestRouter` from `src/test/createTestRouter.tsx` as the `wrapper` in `renderHook` or `render` calls. It provides an in-memory router scoped to the test, with an optional route pattern for `useParams` tests:

```ts
import { createTestRouter } from '../../test/createTestRouter'

const wrapper = createTestRouter('/workflows/abc-123', '/workflows/:workflowId')
const { result } = renderHook(() => useParams<{ workflowId: string }>(), { wrapper })
```
