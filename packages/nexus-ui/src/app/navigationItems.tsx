import { lazy } from 'react'
import type { INavigationItem } from '../components/nav/NavItem'
import { AppRoute } from './AppRoute'

const Automation = lazy(() => import('../routes/automations/Automation'))
const Automations = lazy(() => import('../routes/automations/Automations'))
const IntegrationForm = lazy(() =>
  import('../routes/configuration/integrations/form/IntegrationForm').then((m) => ({ default: m.IntegrationForm }))
)
const Integrations = lazy(() => import('../routes/configuration/integrations/Integrations'))
const Glossary = lazy(() => import('../routes/documentation/glossary/Glossary'))

export const navigationItems: INavigationItem[] = [
  {
    label: 'Dashboard',
    path: AppRoute.Dashboard,
  },
  {
    label: 'Builder',
    path: AppRoute.AutomationBuilder,
  },
  {
    label: 'Automations',
    path: AppRoute.Automations.Root,
    children: [
      {
        label: 'Automations',
        path: AppRoute.Automations.Root,
        element: <Automations />,
      },
      {
        label: 'Automation',
        path: AppRoute.Automations.Automation,
        element: <Automation />,
      },
    ],
  },
  {
    label: 'Approvals',
    path: AppRoute.Approvals,
  },
  {
    label: 'Configuration',
    path: AppRoute.Configuration.Integrations.Root,
    children: [
      {
        label: 'Overview',
        path: AppRoute.Configuration.Overview,
      },
      {
        label: 'Integrations',
        path: AppRoute.Configuration.Integrations.Root,
        element: <Integrations />,
        children: [
          {
            label: 'Configure',
            path: AppRoute.Configuration.Integrations.Configure,
            element: <IntegrationForm />,
          },
        ],
      },
      {
        label: 'Credentials',
        path: AppRoute.Configuration.Credentials,
      },
      {
        label: 'Settings',
        path: AppRoute.Configuration.Settings,
      },
    ],
  },
  {
    label: 'Support',
    path: AppRoute.Support.Root,
    children: [
      {
        label: 'Documentation',
        path: AppRoute.Support.Documentation,
      },
      {
        label: 'FAQ',
        path: AppRoute.Support.FAQ,
      },
      {
        label: 'Glossary',
        path: AppRoute.Support.Glossary,
        element: <Glossary />,
      },
    ],
  },
]
