import type * as IdentityProvidersAPI from '@ansible/nexus-contracts/src/identity-providers-api.js'

export type IdentityProvider = IdentityProvidersAPI.components['schemas']['IdentityProviderResponse']

export const identityProviders: IdentityProvider[] = [
  {
    id: 'idp-001',
    name: 'Corporate SSO',
    description: 'Company-wide Ansible Automation Platform single sign-on',
    enabled: true,
    configuration: {
      provider_type: 'oidc',
      idp_type: 'aap',
      auto_discovery: true,
      issuer_url: 'https://sso.example.com/realms/corporate',
      client_id: 'nexus-client-001',
      redirect_uri: 'https://localhost:5173/auth/callback',
      scopes: 'read write openid roles',
    },
    created_by: 'admin',
    created_at: '2025-03-15T08:30:00Z',
    updated_at: '2025-05-10T14:22:00Z',
  },
  {
    id: 'idp-002',
    name: 'GitHub OAuth',
    description: 'GitHub OIDC integration for external collaborators',
    enabled: true,
    configuration: {
      provider_type: 'oidc',
      idp_type: 'custom',
      auto_discovery: true,
      issuer_url: 'https://token.actions.githubusercontent.com',
      client_id: 'nexus-github-app',
      redirect_uri: 'https://localhost:5173/auth/callback',
      scopes: 'openid profile email',
    },
    created_by: 'admin',
    created_at: '2025-04-01T10:00:00Z',
    updated_at: '2025-04-01T10:00:00Z',
  },
]
