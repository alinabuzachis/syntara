import { Navigation } from "../components/nav/Navigation";
import { NavItem } from "../components/nav/NavItem";
import { AppRoute } from "./AppRoute";

export function AppNavigation() {
  return (
    <Navigation size="lg">
      <NavItem to={AppRoute.Dashboard} label="Dashboard" />
      <NavItem to={AppRoute.Builder} label="Automation Builder" />
      <NavItem to={AppRoute.Automations} label="Automations" disabled />
      <NavItem to={AppRoute.Approvals} label="Approvals" disabled />
      <NavItem to={AppRoute.Configuration} label="Configuration" />
      <NavItem to={AppRoute.Support} label="Support" disabled />
    </Navigation>
  );
}
