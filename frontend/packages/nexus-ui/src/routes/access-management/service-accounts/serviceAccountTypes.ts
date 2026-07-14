import type { ServiceAccountsAPI } from '@ansible/nexus-contracts'

type Schemas = ServiceAccountsAPI.components['schemas']

export type ServiceAccountRead = Schemas['ServiceAccountRead']
export type ServiceAccountListResponse = Schemas['ServiceAccountListResponse']
export type SACredentialRead = Schemas['SACredentialRead']
export type SACredentialCreateResponse = Schemas['SACredentialCreateResponse']
export type SACredentialListResponse = Schemas['SACredentialListResponse']
