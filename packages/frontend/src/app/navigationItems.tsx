import { lazy } from "react";
import type { INavigationItem } from "../components/nav/NavItem";
import { AppRoute } from "./AppRoute";

// use react lazy
const Integrations = lazy(
  () => import("../routes/configuration/integrations/Integrations")
);

const Glossary = lazy(
  () => import("../routes/documentation/glossary/Glossary")
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
    path: AppRoute.Configuration.Integrations,
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
    path: AppRoute.Support.Root,
    children: [
      {
        label: "Documentation",
        path: AppRoute.Support.Documentation,
      },
      {
        label: "FAQ",
        path: AppRoute.Support.FAQ,
      },
      {
        label: "Glossary",
        path: AppRoute.Support.Glossary,
        element: <Glossary />,
      },
    ],
  },
];
