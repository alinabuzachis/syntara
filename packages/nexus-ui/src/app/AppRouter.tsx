import { Suspense } from 'react'
import { Redirect, Route, Switch } from 'wouter'
import { LoadingState } from '../components/states/LoadingState'
import { navigationItems } from './navigationItems'

export function AppRouter() {
  return (
    <Suspense fallback={<LoadingState />}>
      <Switch>
        {navigationItems.map((item) => (
          <>
            {item.children &&
              item.children.map((child) => (
                <>
                  {child.children &&
                    child.children.map((child) => (
                      <Route key={child.path} path={child.path}>
                        {child.element}
                      </Route>
                    ))}
                  <Route key={child.path} path={child.path}>
                    {child.element}
                  </Route>
                </>
              ))}
            {item.element && (
              <Route key={item.path} path={item.path}>
                {item.element}
              </Route>
            )}
          </>
        ))}
        <Route>
          <Redirect to="/automations" />
        </Route>
      </Switch>
    </Suspense>
  )
}
