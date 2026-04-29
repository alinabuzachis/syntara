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
    },
    Settings: '/configuration/settings',
  },
  AccessManagement: {
    Root: '/access-management',
    Users: '/access-management/users',
    CreateUser: '/access-management/users/create',
    UserDetail: '/access-management/users/:userId',
    UserDetailTab: '/access-management/users/:userId/:tab',
    EditUser: '/access-management/users/:userId/edit',
    Groups: '/access-management/groups',
    GroupDetail: '/access-management/groups/:groupId',
    GroupDetailTab: '/access-management/groups/:groupId/:tab',
    Policies: '/access-management/policies',
    Roles: '/access-management/roles',
    Projects: '/access-management/projects',
    ProjectDetail: '/access-management/projects/:projectId',
    ProjectDetailTab: '/access-management/projects/:projectId/:tab',
    Assignments: '/access-management/assignments',
    CanI: '/access-management/can-i',
    CanIMode: '/access-management/can-i/:mode',
    Authentication: {
      Root: '/access-management/authentication',
      AddIdentityProvider: '/access-management/authentication/identity-providers/add',
      IdentityProviderDetail: '/access-management/authentication/identity-providers/:providerId/:tab?',
      EditIdentityProvider: '/access-management/authentication/identity-providers/:providerId/edit',
    },
  },
  Auth: {
    TestSignInCallback: '/auth/test-signin-callback',
  },
  Profile: '/profile',
  Support: {
    Root: '/support/glossary',
    Documentation: '/support/documentation',
    FAQ: '/support/faq',
    Glossary: '/support/glossary',
  },
}
