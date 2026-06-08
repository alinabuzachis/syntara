import { Fragment, Suspense } from 'react'
import { Redirect, Route, Switch } from 'wouter'

import { ErrorBoundary } from '../components/ErrorBoundary'
import { ProtectedRoute } from '../components/ProtectedRoute'
import { NxLoadingState } from '../components/states/NxLoadingState'

import { NAV_ITEMS } from './navigationItems'
import type { TNavigationItem } from './navigationItems'

function renderElement(item: TNavigationItem) {
  if (!item.routePermission) return item.element
  return <ProtectedRoute {...item.routePermission}>{item.element}</ProtectedRoute>
}

export function AppRouter() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<NxLoadingState />}>
        <Switch>
          {NAV_ITEMS.map((item) => (
            <Fragment key={item.path}>
              {item.children?.map((child) => (
                <Fragment key={child.path}>
                  {child.children?.map((grandchild) => (
                    <Route key={grandchild.path} path={grandchild.path}>
                      {renderElement(grandchild)}
                    </Route>
                  ))}
                  <Route path={child.path}>{renderElement(child)}</Route>
                </Fragment>
              ))}
              {item.element && (
                <Route key={item.path} path={item.path}>
                  {renderElement(item)}
                </Route>
              )}
            </Fragment>
          ))}
          <Route>
            <Redirect to="/workflows" />
          </Route>
        </Switch>
      </Suspense>
    </ErrorBoundary>
  )
}
