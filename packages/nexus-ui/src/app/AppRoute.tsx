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
  Support: {
    Root: '/support/glossary',
    Documentation: '/support/documentation',
    FAQ: '/support/faq',
    Glossary: '/support/glossary',
  },
}
