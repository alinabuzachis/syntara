import { lazy } from 'react'

import { AppRoute } from './AppRoute'

export type INavigationItem = {
  label: string
  path: string
  element?: React.ReactNode
  children?: INavigationItem[]
  hidden?: boolean // Hide from navigation but keep for routing
  matchPattern?: string // Optional pattern to match for active state (e.g., "/automation-builder/:workflowId")
}

const Automations = lazy(() => import('../routes/automations/Automations'))
const BuilderNew = lazy(() => import('../routes/builder/BuilderNew'))
const BuilderEdit = lazy(() => import('../routes/builder/BuilderEdit'))
const Executions = lazy(() => import('../routes/executions/Executions'))
const IntegrationForm = lazy(() =>
  import('../routes/configuration/integrations/form/IntegrationForm').then((m) => ({ default: m.IntegrationForm }))
)
const Integrations = lazy(() => import('../routes/configuration/integrations/Integrations'))
const IntegrationTools = lazy(() => import('../routes/configuration/integrations/IntegrationTools'))
const Glossary = lazy(() => import('../routes/documentation/glossary/Glossary'))
const DemoWebSocket = lazy(() => import('../routes/demo-ws/DemoWebSocket'))

export const navigationItems: INavigationItem[] = [
  {
    label: 'Dashboard',
    path: AppRoute.Dashboard,
  },
  {
    label: 'Builder',
    path: AppRoute.AutomationBuilder.New,
    element: <BuilderNew />,
    matchPattern: '/automation-builder/:workflowId',
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
        label: 'Executions',
        path: AppRoute.Executions.Root,
        element: <Executions />,
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
          {
            label: 'IntegrationTools',
            path: AppRoute.Configuration.Integrations.IntegrationTools,
            element: <IntegrationTools />,
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
  // Demo Routes
  {
    label: 'WebSocket Demo',
    path: AppRoute.DemoWebSocket,
    element: <DemoWebSocket />,
  },
  // Hidden routes (not shown in navigation, but needed for routing)
  {
    label: 'Edit Workflow',
    path: AppRoute.AutomationBuilder.Edit,
    element: <BuilderEdit />,
    hidden: true,
  },
]
