/**
 * E2E Test - Mock OIDC IdP
 *
 * IdPs:
 * - Keycloak
 * - AAP
 */
export const KEYCLOAK_OIDC_IDP = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  created_at: '2025-10-09T12:00:00Z',
  updated_at: '2025-10-09T12:30:00Z',
  labels: {},
  created_by: '770e8400-e29b-41d4-a716-446655440000',
  updated_by: '770e8400-e29b-41d4-a716-446655440000',
  deleted_at: null,
  deleted_by: null,
  name: 'Keycloak',
  description: null,
  enabled: true,
  configuration: {
    provider_type: 'oidc',
    idp_type: 'custom',
    auto_discovery: true,
    issuer_url: 'https://keycloak-service.example.com',
    client_id: 'mock-client-id',
    redirect_uri: 'http://localhost:8000/api/v1/auth/oidc/callback',
    scopes: 'openid profile email',
    authorization_endpoint: null,
    token_endpoint: null,
    jwks_uri: null,
    userinfo_endpoint: null,
    end_session_endpoint: null,
    enable_rp_initiated_logout: false,
    claim_mapping: {
      subject: 'sub',
      email: 'email',
      username: 'preferred_username',
      full_name: 'name',
      groups: 'groups',
    },
    group_jmespath_expression: 'groups[*]',
    group_mapping_entries: [
      {
        idp_group_value: 'keycloak-admins',
        nexus_group_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      },
    ],
    auto_create_groups: false,
    aap_role_mapping_enabled: false,
    disable_tls_verify: false,
  },
}

export const KEYCLOAK_AUTH_PROVIDER = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Keycloak',
  provider_type: 'oidc',
  provider_template: 'custom',
}

export const AAP_AUTH_PROVIDER = {
  id: '886ff243-fa0d-4895-8738-a9ece82bf3bf',
  name: 'AAP',
  provider_type: 'oidc',
  provider_template: 'aap',
}
