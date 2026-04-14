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
export const AccessManagement = lazy(() =>
  import('../routes/access-management/AccessManagement').then((m) => ({ default: m.AccessManagement }))
)
export const Authentication = lazy(() => import('../routes/access-management/authentication/Authentication'))
export const AddIdentityProvider = lazy(() =>
  import('../routes/access-management/authentication/identity-providers/AddIdentityProvider').then((m) => ({
    default: m.AddIdentityProvider,
  }))
)
export const EditIdentityProvider = lazy(() =>
  import('../routes/access-management/authentication/identity-providers/EditIdentityProvider').then((m) => ({
    default: m.EditIdentityProvider,
  }))
)
export const CreateUser = lazy(() =>
  import('../routes/access-management/users/CreateUser').then((m) => ({
    default: m.CreateUser,
  }))
)
export const UserDetail = lazy(() =>
  import('../routes/access-management/users/UserDetail').then((m) => ({
    default: m.UserDetail,
  }))
)
export const EditUser = lazy(() =>
  import('../routes/access-management/users/EditUser').then((m) => ({
    default: m.EditUser,
  }))
)
export const MyProfile = lazy(() => import('../routes/profile/MyProfile').then((m) => ({ default: m.MyProfile })))
export const Credentials = lazy(() => import('../routes/configuration/credentials/Credentials'))
export const CredentialDetail = lazy(() => import('../routes/configuration/credentials/CredentialDetail'))
