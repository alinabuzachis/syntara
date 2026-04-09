import { RhUiKeyIcon, ShieldAltIcon } from '@patternfly/react-icons'

import { AppRoute } from './AppRoute'
import {
  AccessManagement,
  AddIdentityProvider,
  ApprovalDetail,
  CreateUser,
  Approvals,
  Authentication,
  Automations,
  BuilderEdit,
  BuilderNew,
  EditIdentityProvider,
  EditUser,
  ExecutionDetail,
  UserDetail,
  Executions,
  Glossary,
  IntegrationForm,
  IntegrationTools,
  Integrations,
  MyProfile,
} from './lazyRoutes'

export type INavigationItem = {
  label: string
  path: string
  element?: React.ReactNode
  children?: INavigationItem[]
  hidden?: boolean // Hide from navigation but keep for routing
  matchPattern?: string // Optional pattern to match for active state (e.g., "/automation-builder/:workflowId")
  separatorBefore?: boolean // Render a divider above this item in the nav
  icon?: React.ReactNode // Icon to display next to the label in dropdown menus
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
    element: <Automations />,
  },
  {
    label: 'Automation Runs',
    path: AppRoute.Executions.Root,
    element: <Executions />,
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
    label: 'Access Management',
    path: AppRoute.AccessManagement.Root,
    children: [
      {
        label: 'Access Management',
        path: AppRoute.AccessManagement.Root,
        icon: <ShieldAltIcon />,
        element: <AccessManagement />,
        children: [
          {
            label: 'Users',
            path: AppRoute.AccessManagement.Users,
            element: <AccessManagement />,
          },
          {
            label: 'Groups',
            path: AppRoute.AccessManagement.Groups,
            element: <AccessManagement />,
          },
          {
            label: 'Create User',
            path: AppRoute.AccessManagement.CreateUser,
            element: <CreateUser />,
            hidden: true,
          },
          {
            label: 'User Detail',
            path: AppRoute.AccessManagement.UserDetail,
            element: <UserDetail />,
            hidden: true,
          },
          {
            label: 'Edit User',
            path: AppRoute.AccessManagement.EditUser,
            element: <EditUser />,
            hidden: true,
          },
        ],
      },
      {
        label: 'Identity Providers',
        path: AppRoute.AccessManagement.Authentication.Root,
        icon: <RhUiKeyIcon />,
        element: <Authentication />,
        children: [
          {
            label: 'Add Identity Provider',
            path: AppRoute.AccessManagement.Authentication.AddIdentityProvider,
            element: <AddIdentityProvider />,
          },
          {
            label: 'Edit Identity Provider',
            path: AppRoute.AccessManagement.Authentication.EditIdentityProvider,
            element: <EditIdentityProvider />,
          },
        ],
      },
    ],
  },
  {
    label: 'Configuration',
    path: AppRoute.Configuration.Integrations.Root,
    children: [
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
  // Hidden routes (not shown in navigation, but needed for routing)
  {
    label: 'My Profile',
    path: AppRoute.Profile,
    element: <MyProfile />,
    hidden: true,
  },
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
