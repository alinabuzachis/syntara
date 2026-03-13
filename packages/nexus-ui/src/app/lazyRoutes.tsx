import { lazy } from 'react'

export const Automations = lazy(() => import('../routes/automations/Automations'))
export const BuilderNew = lazy(() => import('../routes/builder/BuilderNew'))
export const BuilderEdit = lazy(() => import('../routes/builder/BuilderEdit'))
export const Executions = lazy(() => import('../routes/executions/Executions'))
export const ExecutionDetail = lazy(() => import('../routes/executions/ExecutionDetail'))
export const IntegrationForm = lazy(() =>
  import('../routes/configuration/integrations/form/IntegrationForm').then((m) => ({ default: m.IntegrationForm }))
)
export const Integrations = lazy(() => import('../routes/configuration/integrations/Integrations'))
export const IntegrationTools = lazy(() => import('../routes/configuration/integrations/IntegrationTools'))
export const Glossary = lazy(() => import('../routes/documentation/glossary/Glossary'))
export const Approvals = lazy(() => import('../routes/approvals/Approvals'))
export const ApprovalDetail = lazy(() => import('../routes/approvals/ApprovalDetail'))
