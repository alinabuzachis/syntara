import { Fragment, Suspense } from 'react'
import { Redirect, Route, Switch } from 'wouter'

import { ErrorBoundary } from '../components/ErrorBoundary'
import { LoadingState } from '../components/states/LoadingState'

import { navigationItems } from './navigationItems'

export function AppRouter() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingState />}>
        <Switch>
          {navigationItems.map((item) => (
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
            <Redirect to="/automations" />
          </Route>
        </Switch>
      </Suspense>
    </ErrorBoundary>
  )
}
