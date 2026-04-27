import type { CredentialsAPI } from '@ansible/nexus-contracts'

/** Sentinel value used by the API to represent encrypted secret fields */
export const ENCRYPTED_SENTINEL = '$encrypted$'

/** Credential resource from the API */
export type Credential = CredentialsAPI.components['schemas']['CredentialRead']

/**
 * Extended credential that includes fields actually returned by the backend.
 *
 * The backend returns workflow_count but the OpenAPI contract doesn't declare it.
 */
export type CredentialExtended = {
  workflow_count?: number
} & Credential

/** Credential type resource from the API */
export type CredentialType = CredentialsAPI.components['schemas']['CredentialTypeRead']

/** Workflow reference returned by the credentials workflows endpoint */
export type CredentialWorkflowRef = CredentialsAPI.components['schemas']['CredentialWorkflowRef']

/**
 * Extended workflow reference that includes all fields actually returned by the backend.
 *
 * The backend returns enriched data (description, created_by, node_names, last_execution_at, last_execution_status)
 * but the OpenAPI contract only declares {id, name}. This type matches the actual backend response.
 */
export type CredentialWorkflowRefExtended = {
  description?: string | null
  created_by?: string | null
  node_names?: string[]
  last_execution_at?: string | null
  last_execution_status?: string | null
} & CredentialWorkflowRef
