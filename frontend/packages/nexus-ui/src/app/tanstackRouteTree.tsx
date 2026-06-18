import { createRootRoute, createRoute } from '@tanstack/react-router'
import { Suspense } from 'react'

import { ErrorBoundary } from '../components/ErrorBoundary'
import { ProtectedRoute } from '../components/ProtectedRoute'
import { NxLoadingState } from '../components/states/NxLoadingState'

import { convertWouterPathToTanStack } from './convertParamSyntax'
import { NAV_ITEMS } from './navigationItems'
import type { TNavigationItem } from './navigationItems'
import { RootLayout } from './RootLayout'

/** Builds the route component function for a single navigation item. */
function makeRouteComponent(item: TNavigationItem): () => React.ReactNode {
  return function RouteComponent() {
    if (!item.element) return null

    const guarded = item.routePermission ? (
      <ProtectedRoute {...item.routePermission}>{item.element}</ProtectedRoute>
    ) : (
      item.element
    )

    return (
      <ErrorBoundary>
        <Suspense fallback={<NxLoadingState />}>{guarded}</Suspense>
      </ErrorBoundary>
    )
  }
}

/** Recursively collects all routable items (those with an element) from the nav tree. */
function collectRoutableItems(items: readonly TNavigationItem[]): TNavigationItem[] {
  const result: TNavigationItem[] = []
  for (const item of items) {
    if (item.element) result.push(item)
    if (item.children) result.push(...collectRoutableItems(item.children))
  }
  return result
}

function redirectToWorkflows() {
  globalThis.location.replace('/workflows')
  return null
}

/**
 * Builds a TanStack Router route tree from `NAV_ITEMS`.
 *
 * The root layout route renders the full app chrome (AppShell) and an Outlet
 * for page content. All page routes are flat children of the root.
 * Route nesting for tab UI is a follow-up migration.
 */
export const buildTanStackRouteTree = () => {
  const rootRoute = createRootRoute({
    component: RootLayout,
    notFoundComponent: redirectToWorkflows,
  })

  const childRoutes = collectRoutableItems(NAV_ITEMS).map((item) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path: convertWouterPathToTanStack(item.path),
      component: makeRouteComponent(item),
    })
  )

  return rootRoute.addChildren(childRoutes)
}
