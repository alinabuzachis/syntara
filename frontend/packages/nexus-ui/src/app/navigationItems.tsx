import {
  RhUiConnectedIcon,
  RhUiFolderIcon,
  RhUiKeyIcon,
  RhUiLanguageIcon,
  RhUiLikeIcon,
  RhUiListIcon,
  RhUiNetworkIcon,
  RhUiPlayCircleIcon,
  RhUiSecuredIcon,
  RhUiSettingsIcon,
  RhUiUsersIcon,
} from '@patternfly/react-icons'

import type { PermissionRequirement } from '../hooks/permissionUtils'

import { AppRoute } from './AppRoute'
import {
  AccessManagement,
  AddIdentityProvider,
  ProjectDetail,
  Approvals,
  Authentication,
  Workflows,
  BuilderEdit,
  BuilderNew,
  CreateUser,
  CredentialDetail,
  Credentials,
  EditGroupMapping,
  EditIdentityProvider,
  EditIntegration,
  EditUser,
  IdentityProviderDetail,
  ExecutionDetail,
  Executions,
  Glossary,
  GroupDetail,
  IntegrationDetail,
  IntegrationForm,
  Integrations,
  Settings,
  TransferIdentityWizard,
  UserDetail,
} from './lazyRoutes'

export type TNavigationItem = {
  label: string
  path: string
  element?: React.ReactNode
  children?: TNavigationItem[]
  hidden?: boolean // Hide from navigation but keep for routing
  matchPattern?: string // Optional pattern to match for active state (e.g., "/workflow-builder/:workflowId")
  separatorBefore?: boolean // Render a divider above this item in the nav
  icon?: React.ReactNode // Icon to display next to the label in dropdown menus
  /**
   * If set, the item is visible only when the user has **at least one** of
   * these permissions (OR logic). Hidden when every check is denied.
   * Omit to keep the item always visible.
   */
  requiredPermissions?: PermissionRequirement[]
  /**
   * If set, the route is wrapped in a `ProtectedRoute` guard that blocks
   * access when the user lacks this permission. Shows an access-denied
   * empty state instead of the page component.
   */
  routePermission?: PermissionRequirement
}

export const NAV_ITEMS: TNavigationItem[] = [
  {
    label: 'Workflow Builder',
    path: AppRoute.WorkflowBuilder.New,
    element: <BuilderNew />,
    // UX requirement: rotate the network icon 270° so it reads as a "builder" shape rather than a network diagram
    icon: <RhUiNetworkIcon style={{ transform: 'rotate(270deg)' }} />,
    matchPattern: '/workflow-builder/:workflowId',
  },
  {
    label: 'Workflows',
    path: AppRoute.Workflows.Root,
    element: <Workflows />,
    icon: <RhUiListIcon />,
  },
  {
    label: 'Workflow Runs',
    path: AppRoute.Executions.Root,
    element: <Executions />,
    icon: <RhUiPlayCircleIcon />,
  },
  {
    label: 'Approvals',
    path: AppRoute.Approvals.Root,
    element: <Approvals />,
    icon: <RhUiLikeIcon />,
    requiredPermissions: [
      { action: 'read', resourceType: 'approval' },
      { action: 'decide', resourceType: 'approval' },
    ],
  },
  {
    label: 'Configuration',
    path: AppRoute.Configuration.Integrations.Root,
    icon: <RhUiFolderIcon />,
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
            label: 'Edit Integration',
            path: AppRoute.Configuration.Integrations.Edit,
            element: <EditIntegration />,
            hidden: true,
          },
          {
            label: 'Integration Detail',
            path: AppRoute.Configuration.Integrations.Detail,
            element: <IntegrationDetail />,
            hidden: true,
          },
          {
            label: 'Integration Detail Tab',
            path: AppRoute.Configuration.Integrations.DetailTab,
            element: <IntegrationDetail />,
            hidden: true,
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
    label: 'System Administration',
    path: AppRoute.SystemAdministration.Root,
    icon: <RhUiLanguageIcon />,
    children: [
      {
        label: 'Access Management',
        path: AppRoute.AccessManagement.Root,
        icon: <RhUiUsersIcon />,
        element: <AccessManagement />,
        requiredPermissions: [
          { action: 'read', resourceType: 'user' },
          { action: 'read', resourceType: 'group' },
          { action: 'read', resourceType: 'project' },
          { action: 'read', resourceType: 'role-assignment' },
        ],
        children: [
          {
            label: 'Users',
            path: AppRoute.AccessManagement.Users,
            element: <AccessManagement />,
            requiredPermissions: [{ action: 'read', resourceType: 'user' }],
          },
          {
            label: 'Groups',
            path: AppRoute.AccessManagement.Groups,
            element: <AccessManagement />,
            requiredPermissions: [{ action: 'read', resourceType: 'group' }],
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
            label: 'Check access',
            path: AppRoute.AccessManagement.CheckAccess,
            element: <AccessManagement />,
          },
          {
            label: 'Token Revocation',
            path: AppRoute.AccessManagement.TokenRevocation,
            element: <AccessManagement />,
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
            routePermission: { action: 'create', resourceType: 'user' },
          },
          {
            label: 'Edit User',
            path: AppRoute.AccessManagement.EditUser,
            element: <EditUser />,
            hidden: true,
            routePermission: { action: 'update', resourceType: 'user' },
          },
          {
            label: 'Transfer Identity',
            path: AppRoute.AccessManagement.TransferIdentity,
            element: <TransferIdentityWizard />,
            hidden: true,
          },
          {
            label: 'User Detail',
            path: AppRoute.AccessManagement.UserDetail,
            element: <UserDetail />,
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
        path: AppRoute.SystemAdministration.Authentication.Root,
        icon: <RhUiSecuredIcon />,
        element: <Authentication />,
        requiredPermissions: [{ action: 'read', resourceType: 'identity-provider' }],
        children: [
          {
            label: 'Add Identity Provider',
            path: AppRoute.SystemAdministration.Authentication.AddIdentityProvider,
            element: <AddIdentityProvider />,
            routePermission: { action: 'create', resourceType: 'identity-provider' },
          },
          {
            label: 'Edit Identity Provider',
            path: AppRoute.SystemAdministration.Authentication.EditIdentityProvider,
            element: <EditIdentityProvider />,
            routePermission: { action: 'update', resourceType: 'identity-provider' },
          },
          {
            label: 'Edit Group Mapping',
            path: AppRoute.SystemAdministration.Authentication.EditGroupMapping,
            element: <EditGroupMapping />,
            hidden: true,
          },
          {
            label: 'Identity Provider Details',
            path: AppRoute.SystemAdministration.Authentication.IdentityProviderDetail,
            element: <IdentityProviderDetail />,
          },
          {
            label: 'Identity Provider Details Tab',
            path: AppRoute.SystemAdministration.Authentication.IdentityProviderDetailTab,
            element: <IdentityProviderDetail />,
            hidden: true,
          },
        ],
      },
      {
        label: 'Settings',
        path: AppRoute.SystemAdministration.Settings,
        icon: <RhUiSettingsIcon />,
        element: <Settings />,
        requiredPermissions: [{ action: 'read', resourceType: 'setting' }],
        children: [
          {
            label: 'Settings Tab',
            path: AppRoute.SystemAdministration.SettingsTab,
            element: <Settings />,
            hidden: true,
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
    label: 'Edit Workflow',
    path: AppRoute.WorkflowBuilder.Edit,
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
  {
    label: 'Credential Detail Tab',
    path: AppRoute.Configuration.Credentials.DetailTab,
    element: <CredentialDetail />,
    hidden: true,
  },
] as const
