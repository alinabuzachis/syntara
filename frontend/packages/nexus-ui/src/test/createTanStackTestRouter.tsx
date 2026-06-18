import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import React from 'react'

import { convertWouterPathToTanStack } from '../app/convertParamSyntax'

/**
 * Module-scoped context used to pass test children into the matched route's component.
 * Test isolation relies on Vitest's per-file module scope (each test file gets its own
 * `TestChildrenCtx` instance) and React's component-tree-based context resolution
 * (each `TestRouterWrapper` renders its own `Provider`, so renders don't share state).
 */
const TestChildrenCtx = React.createContext<React.ReactNode>(null)

function TestRouteComponent() {
  const children = React.useContext(TestChildrenCtx)
  return <>{children}</>
}

/**
 * Returns a React wrapper component that provides a TanStack Router memory
 * router pre-loaded to `initialPath`. Use as the `wrapper` option in `renderHook`
 * or `render` for contract tests under TanStack Router.
 *
 * The router is pre-loaded (`await router.load()`) before the wrapper is returned
 * so that route matching is committed and `TestRouteComponent` renders on the
 * first React render. Without pre-loading, hooks inside routes see null state
 * because TanStack Router matches routes asynchronously after `RouterProvider` mounts.
 *
 * @param initialPath - The initial URL path (may include query string, e.g. "/users?tab=groups")
 * @param routePattern - Optional wouter-style route pattern (e.g. "/users/:userId") for
 *   `useParams` tests. Converted to TanStack syntax (`$userId`) automatically.
 *   When omitted, a catch-all route is used so params tests will not populate named params.
 */
export async function createTanStackTestRouter(initialPath = '/', routePattern?: string) {
  const history = createMemoryHistory({ initialEntries: [initialPath] })

  const rootRoute = createRootRoute({ component: Outlet })

  // Inline the addChildren call in each branch so TypeScript can infer the
  // concrete routeTree type per branch, avoiding the overly-broad explicit annotation.
  const router = createRouter({
    history,
    routeTree: routePattern
      ? rootRoute.addChildren([
          createRoute({
            getParentRoute: () => rootRoute,
            path: convertWouterPathToTanStack(routePattern),
            component: TestRouteComponent,
          }),
        ])
      : // Catch-all: renders children for any path (location/navigate/search tests).
        rootRoute.addChildren([
          createRoute({
            getParentRoute: () => rootRoute,
            path: '$',
            component: TestRouteComponent,
          }),
        ]),
  })

  // Pre-load so route matching is committed before the wrapper renders.
  // This ensures hooks inside TestRouteComponent see the correct initial state
  // immediately on first render without needing waitFor in individual tests.
  await router.load()

  function TestRouterWrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
      <TestChildrenCtx.Provider value={children}>
        <RouterProvider router={router} />
      </TestChildrenCtx.Provider>
    )
  }

  return TestRouterWrapper
}
