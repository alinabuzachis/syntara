import type * as IdentityProvidersAPI from '@ansible/nexus-contracts/src/identity-providers-api.js'

export type IdentityProvider = IdentityProvidersAPI.components['schemas']['IdentityProviderResponse']

export const identityProviders: IdentityProvider[] = []
