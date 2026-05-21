import type * as IdentityProvidersAPI from '@ansible/nexus-contracts/src/identity-providers-api.js'

export type IdentityProvider = IdentityProvidersAPI.components['schemas']['IdentityProviderResponse']

export const identityProviders: IdentityProvider[] = [
  {
    id: 'idp-okta-001',
    name: 'Acme OIDC',
    enabled: true,
    configuration: {
      provider_type: 'oidc',
      idp_type: 'okta',
      issuer_url: 'https://dev-example.okta.com',
      client_id: 'okta-client-id-001',
      redirect_uri: 'http://localhost:5173/auth/callback',
      auto_discovery: true,
    },
    created_at: '2025-06-01T10:00:00Z',
    updated_at: '2025-06-15T14:30:00Z',
  },
  {
    id: 'idp-azure-002',
    name: 'Azure AD',
    enabled: false,
    configuration: {
      provider_type: 'oidc',
      idp_type: 'azure',
      issuer_url: 'https://login.microsoftonline.com/tenant-id/v2.0',
      client_id: 'azure-client-id-002',
      redirect_uri: 'http://localhost:5173/auth/callback',
      auto_discovery: true,
    },
    created_at: '2025-07-10T08:00:00Z',
    updated_at: '2025-08-01T12:00:00Z',
  },
]
