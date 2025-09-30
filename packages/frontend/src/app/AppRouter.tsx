import { Route, Switch } from "wouter";

export function AppRouter() {
  return (
    <div className="grow text-white flex flex-col z-10 ">
      <Switch>
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
    </div>
  );
}
