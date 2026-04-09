export const AppRoute = {
  Dashboard: '/dashboard',
  AutomationBuilder: {
    New: '/automation-builder/new',
    Edit: '/automation-builder/:workflowId',
  },
  Automations: {
    Root: '/automations',
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
    Credentials: '/configuration/credentials',
    Settings: '/configuration/settings',
  },
  AccessManagement: {
    Root: '/access-management',
    Users: '/access-management/users',
    CreateUser: '/access-management/users/create',
    UserDetail: '/access-management/users/:userId',
    EditUser: '/access-management/users/:userId/edit',
    Groups: '/access-management/groups',
    Authentication: {
      Root: '/access-management/authentication',
      AddIdentityProvider: '/access-management/authentication/identity-providers/add',
      EditIdentityProvider: '/access-management/authentication/identity-providers/:providerId',
    },
  },
  Profile: '/profile',
  Support: {
    Root: '/support/glossary',
    Documentation: '/support/documentation',
    FAQ: '/support/faq',
    Glossary: '/support/glossary',
  },
}
