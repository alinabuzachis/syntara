import { Fragment, Suspense } from 'react'
import { Redirect, Route, Switch } from 'wouter'

import { ErrorBoundary } from '../components/ErrorBoundary'
import { NxLoadingState } from '../components/states/NxLoadingState'

import { NAV_ITEMS } from './navigationItems'

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
                      {grandchild.element}
                    </Route>
                  ))}
                  <Route path={child.path}>{child.element}</Route>
                </Fragment>
              ))}
              {item.element && (
                <Route key={item.path} path={item.path}>
                  {item.element}
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
