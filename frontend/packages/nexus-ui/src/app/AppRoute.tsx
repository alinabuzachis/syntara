export const AppRoute = {
  Dashboard: '/dashboard',
  WorkflowBuilder: {
    New: '/workflow-builder/new',
    Edit: '/workflow-builder/:workflowId',
  },
  Workflows: {
    Root: '/workflows',
  },
  Executions: {
    Root: '/executions',
    Execution: '/executions/:executionId',
  },
  Approvals: {
    Root: '/approvals',
    Approval: '/approvals/:approvalId',
  },
  Configuration: {
    Overview: '/configuration',
    Integrations: {
      Root: '/configuration/integrations',
      Configure: '/configuration/integrations/configure',
      IntegrationTools: '/configuration/integrations/:provider_id/tools',
    },
    Credentials: {
      Root: '/configuration/credentials',
      Detail: '/configuration/credentials/:credentialId',
      DetailTab: '/configuration/credentials/:credentialId/:tab',
    },
  },
  SystemAdministration: {
    Root: '/system-administration',
    Settings: '/system-administration/settings',
    SettingsTab: '/system-administration/settings/:category',
    Authentication: {
      Root: '/system-administration/authentication',
      AddIdentityProvider: '/system-administration/authentication/identity-providers/add',
      IdentityProviderDetail: '/system-administration/authentication/identity-providers/:providerId/:tab?',
      EditIdentityProvider: '/system-administration/authentication/identity-providers/:providerId/edit',
      EditGroupMapping: '/system-administration/authentication/identity-providers/:providerId/group-mapping/edit',
    },
  },
  AccessManagement: {
    Root: '/system-administration/access-management',
    Users: '/system-administration/access-management/users',
    CreateUser: '/system-administration/access-management/users/create',
    UserDetail: '/system-administration/access-management/users/:userId',
    UserDetailTab: '/system-administration/access-management/users/:userId/:tab',
    EditUser: '/system-administration/access-management/users/:userId/edit',
    TransferIdentity: '/system-administration/access-management/users/:userId/transfer-identity',
    Groups: '/system-administration/access-management/groups',
    GroupDetail: '/system-administration/access-management/groups/:groupId',
    GroupDetailTab: '/system-administration/access-management/groups/:groupId/:tab',
    Policies: '/system-administration/access-management/policies',
    Roles: '/system-administration/access-management/roles',
    Projects: '/system-administration/access-management/projects',
    ProjectDetail: '/system-administration/access-management/projects/:projectId',
    ProjectDetailTab: '/system-administration/access-management/projects/:projectId/:tab',
    Assignments: '/system-administration/access-management/assignments',
    CanI: '/system-administration/access-management/can-i',
    CanIMode: '/system-administration/access-management/can-i/:mode',
    TokenRevocation: '/system-administration/access-management/token-revocation',
  },
  Auth: {
    TestSignInCallback: '/auth/test-signin-callback',
  },
  /** Kept as an excluded-route reference only — no longer reachable from the UI */
  Profile: '/profile',
  Support: {
    Root: '/support/glossary',
    Documentation: '/support/documentation',
    FAQ: '/support/faq',
    Glossary: '/support/glossary',
  },
}
