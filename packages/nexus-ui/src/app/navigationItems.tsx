import { AppRoute } from './AppRoute'
import {
  ApprovalDetail,
  Approvals,
  Automations,
  BuilderEdit,
  BuilderNew,
  DemoWebSocket,
  ExecutionDetail,
  Executions,
  Glossary,
  IntegrationForm,
  IntegrationTools,
  Integrations,
} from './lazyRoutes'

export type INavigationItem = {
  label: string
  path: string
  element?: React.ReactNode
  children?: INavigationItem[]
  hidden?: boolean // Hide from navigation but keep for routing
  matchPattern?: string // Optional pattern to match for active state (e.g., "/automation-builder/:workflowId")
}

export const navigationItems: INavigationItem[] = [
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
    path: AppRoute.Approvals.Root,
    element: <Approvals />,
  },
  // Hidden route for approval detail page
  {
    label: 'Approval Detail',
    path: AppRoute.Approvals.Approval,
    element: <ApprovalDetail />,
    hidden: true,
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
  // Demo route — hidden from nav, accessible via URL for development
  {
    label: 'WebSocket Demo',
    path: AppRoute.DemoWebSocket,
    element: <DemoWebSocket />,
    hidden: true,
  },
  // Hidden routes (not shown in navigation, but needed for routing)
  {
    label: 'Edit Workflow',
    path: AppRoute.AutomationBuilder.Edit,
    element: <BuilderEdit />,
    hidden: true,
  },
  {
    label: 'Execution Detail',
    path: AppRoute.Executions.Execution,
    element: <ExecutionDetail />,
    hidden: true,
  },
]
