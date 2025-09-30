import { lazy } from "react";
import type { INavigationItem } from "../components/nav/NavItem";
import { AppRoute } from "./AppRoute";

// use react lazy
const Integrations = lazy(
  () => import("../routes/configuration/integrations/Integrations")
);

export const navigationItems: INavigationItem[] = [
  {
    label: "Dashboard",
    path: AppRoute.Dashboard,
  },
  {
    label: "Builder",
    path: AppRoute.Builder,
  },
  {
    label: "Automations",
    path: AppRoute.Automations,
  },
  {
    label: "Approvals",
    path: AppRoute.Approvals,
  },
  {
    label: "Configuration",
    path: AppRoute.Configuration.Overview,
    children: [
      {
        label: "Overview",
        path: AppRoute.Configuration.Overview,
      },
      {
        label: "Integrations",
        path: AppRoute.Configuration.Integrations,
        element: <Integrations />,
      },
      {
        label: "Credentials",
        path: AppRoute.Configuration.Credentials,
      },
      {
        label: "Settings",
        path: AppRoute.Configuration.Settings,
      },
    ],
  },
  {
    label: "Support",
    path: AppRoute.Support,
  },
];
