export const AppRoute = {
  Dashboard: '/dashboard',
  AutomationBuilder: '/automation-builder',
  Automations: {
    Root: '/automations',
    Automation: '/automations/:workflowId',
  },
  Approvals: '/approvals',
  Configuration: {
    Overview: '/configuration',
    Integrations: {
      Root: '/configuration/integrations',
      Configure: '/configuration/integrations/configure',
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
