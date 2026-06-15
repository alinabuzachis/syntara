import React from 'react'
import { Route, Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

/**
 * Returns a React wrapper component that provides a wouter memory router.
 * Use as the `wrapper` option in `renderHook` or `render` for contract tests.
 *
 * @param initialPath - The initial URL path (may include query string, e.g. "/users?tab=groups")
 * @param routePattern - Optional route pattern (e.g. "/users/:userId") for `useParams` tests.
 *   When provided, children are rendered inside a matching `<Route>` so params are available.
 */
export function createTestRouter(initialPath = '/', routePattern?: string) {
  const { hook } = memoryLocation({ path: initialPath, record: true })

  function TestRouterWrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return (
      <Router hook={hook}>
        {routePattern ? <Route path={routePattern}>{() => <>{children}</>}</Route> : <>{children}</>}
      </Router>
    )
  }

  return TestRouterWrapper
}
