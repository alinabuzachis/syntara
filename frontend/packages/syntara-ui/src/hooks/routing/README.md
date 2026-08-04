# Routing Hooks

This directory contains routing utilities built on [TanStack Router](https://tanstack.com/router).

## Supported exports

| Export            | Description                                                                                                                                                                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useSearchParams` | Returns `[URLSearchParams, setSearchParams]`. A convenience wrapper over TanStack Router's lower-level `useRouterState` + `router.history.push` — useful when code needs the `URLSearchParams` API (`.get()`, `.set()`, `.delete()`) rather than TanStack's object-based search. |

Use `@tanstack/react-router` directly for all other routing needs:

- `useNavigate` — programmatic navigation
- `useParams` — route path params (`{ strict: false }` for non-strict access)
- `useRouterState` — access current pathname, search string, etc.
- `Link` — declarative link component (`to` prop)

## Testing

The global test setup (`src/test/setup.ts`) mocks `@tanstack/react-router` and exposes `routerTestState` for assertions:

```ts
import { routerTestState } from '../../test/setup'

// Assert navigation
expect(routerTestState.navigate).toHaveBeenCalledWith({ to: '/workflows' })

// Assert URL state
expect(routerTestState.pathname).toBe('/workflows')
```

Hook unit tests that need a real router context use `createTestRouter` from `src/test/createTestRouter.tsx`:

```ts
import { createTestRouter } from '../../test/createTestRouter'

const wrapper = createTestRouter('/workflows?status=running')
const { result } = renderHook(() => useSearchParams(), { wrapper })
await waitFor(() => expect(result.current[0].get('status')).toBe('running'))
```
