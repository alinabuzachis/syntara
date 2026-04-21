import { RhUiConnectedIcon, RhUiKeyIcon, RhUiSettingsIcon, ShieldAltIcon } from '@patternfly/react-icons'

import { AppRoute } from './AppRoute'
import {
  AccessManagement,
  AddIdentityProvider,
  ProjectDetail,
  ApprovalDetail,
  Approvals,
  Authentication,
  Automations,
  BuilderEdit,
  BuilderNew,
  CreateUser,
  CredentialDetail,
  Credentials,
  EditIdentityProvider,
  EditUser,
  ExecutionDetail,
  Executions,
  Glossary,
  GroupDetail,
  IntegrationForm,
  IntegrationTools,
  Integrations,
  Settings,
  MyProfile,
  UserDetail,
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
            label: 'Policies',
            path: AppRoute.AccessManagement.Policies,
            element: <AccessManagement />,
          },
          {
            label: 'Roles',
            path: AppRoute.AccessManagement.Roles,
            element: <AccessManagement />,
          },
          {
            label: 'Projects',
            path: AppRoute.AccessManagement.Projects,
            element: <AccessManagement />,
          },
          {
            label: 'Project Detail',
            path: AppRoute.AccessManagement.ProjectDetail,
            element: <ProjectDetail />,
            hidden: true,
          },
          {
            label: 'Project Detail Tab',
            path: AppRoute.AccessManagement.ProjectDetailTab,
            element: <ProjectDetail />,
            hidden: true,
          },
          {
            label: 'Assignments',
            path: AppRoute.AccessManagement.Assignments,
            element: <AccessManagement />,
          },
          {
            label: 'Can I?',
            path: AppRoute.AccessManagement.CanI,
            element: <AccessManagement />,
          },
          {
            label: 'Can I Mode',
            path: AppRoute.AccessManagement.CanIMode,
            element: <AccessManagement />,
            hidden: true,
          },
          {
            label: 'Group Detail',
            path: AppRoute.AccessManagement.GroupDetail,
            element: <GroupDetail />,
            hidden: true,
          },
          {
            label: 'Group Detail Tab',
            path: AppRoute.AccessManagement.GroupDetailTab,
            element: <GroupDetail />,
            hidden: true,
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
          {
            label: 'User Detail Tab',
            path: AppRoute.AccessManagement.UserDetailTab,
            element: <UserDetail />,
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
      {
        label: 'Settings',
        path: AppRoute.AccessManagement.Settings,
        icon: <RhUiSettingsIcon />,
        element: <Settings />,
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
        icon: <RhUiConnectedIcon />,
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
        path: AppRoute.Configuration.Credentials.Root,
        icon: <RhUiKeyIcon />,
        element: <Credentials />,
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
  {
    label: 'Credential Detail',
    path: AppRoute.Configuration.Credentials.Detail,
    element: <CredentialDetail />,
    hidden: true,
  },
]
