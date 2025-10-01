import { Route, Switch } from "wouter";
import { navigationItems } from "./navigationItems";

export function AppRouter() {
  return (
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
      {/* <Route path={AppRoute.Dashboard}>
          <AppDashboard />
        </Route>
        <Route path={AppRoute.Builder}>
          <AppAutomationBuilder />
        </Route>
        <Route path={AppRoute.Configuration} nest>
          <Configuration />
        </Route> */}
      {/* // under construction catch */}
      <Route>
        <div className="p-4">Under Construction</div>
      </Route>
    </Switch>
  );
}
