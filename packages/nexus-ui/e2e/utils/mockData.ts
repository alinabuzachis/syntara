/**
 * Shared mock fixtures, route-mock helpers, and the fulfill helper for
 * access-management E2E specs. Centralised here so user-identity-controls.spec.ts
 * and user-identity-group-assignment.spec.ts stay DRY.
 */
import type { Page } from '@playwright/test'

export const BUILTIN_USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
export const NON_BUILTIN_USER_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901'

export const builtinUserResponse = {
  id: BUILTIN_USER_ID,
  username: 'admin',
  full_name: 'Built-in Admin',
  email: 'admin@nexus.local',
  is_enabled: true,
  is_builtin: true,
  auth_type: 'local',
  last_login: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

export const nonBuiltinUserResponse = {
  id: NON_BUILTIN_USER_ID,
  username: 'jdoe',
  full_name: 'John Doe',
  email: 'jdoe@nexus.local',
  is_enabled: true,
  is_builtin: false,
  auth_type: 'local',
  last_login: null,
  created_at: '2024-01-15T00:00:00Z',
  updated_at: '2024-01-15T00:00:00Z',
}

export const emptyIdentities = { resources: [] }

// At least one provider must be returned so UserIdentitiesPanel renders the table
// (and its action column) instead of the "No identity providers configured" empty state.
export const oneProviderResponse = {
  providers: [{ id: 'provider-oidc-1', name: 'Corporate SSO', provider_type: 'oidc' }],
}

export function fulfill(data: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify(data) }
}

// ---------------------------------------------------------------------------
// Shared route-mock helpers
// ---------------------------------------------------------------------------

export const ACCESS_URL = '/system-administration/access-management/users'

/**
 * Mocks GET /users/{userId}/identities.
 * Must be called BEFORE mockUser() so the sub-path is registered first and
 * takes priority over the broader user route.
 */
export async function mockUserIdentities(
  app: Page,
  userId: string,
  response: unknown = emptyIdentities
): Promise<void> {
  await app.route(`**/api/v1/users/${userId}/identities`, (route) => route.fulfill(fulfill(response)))
}

/** Mocks GET /users/{userId}. */
export async function mockUser(app: Page, userId: string, response: unknown): Promise<void> {
  await app.route(`**/api/v1/users/${userId}`, (route) => route.fulfill(fulfill(response)))
}

/** Mocks GET /auth/me. */
export async function mockAuthMe(app: Page, response: unknown): Promise<void> {
  await app.route('**/api/v1/auth/me', (route) => route.fulfill(fulfill(response)))
}

/** Mocks GET /auth/providers. */
export async function mockAuthProviders(app: Page, response: unknown): Promise<void> {
  await app.route('**/api/v1/auth/providers', (route) => route.fulfill(fulfill(response)))
}

/**
 * Mocks GET /api/v1/users (the paginated user list used by AttachIdentityModal).
 * Uses a URL predicate because the query includes limit, cursor, and include_total params.
 */
export async function mockUsersList(app: Page, response: unknown): Promise<void> {
  await app.route(
    (url) => url.pathname === '/api/v1/users',
    (route) => route.fulfill(fulfill(response))
  )
}

/** Mocks GET /users/{userId}/groups. */
export async function mockUserGroups(app: Page, userId: string, response: unknown = { resources: [] }): Promise<void> {
  await app.route(`**/api/v1/users/${userId}/groups`, (route) => route.fulfill(fulfill(response)))
}

// ---------------------------------------------------------------------------
// Federated user + identity fixtures (for attach / detach tests)
// ---------------------------------------------------------------------------

export const FEDERATED_USER_ID = 'c3d4e5f6-a7b8-9012-cdef-234567890abc'

export const federatedUserResponse = {
  id: FEDERATED_USER_ID,
  username: 'asmith',
  full_name: 'Alice Smith',
  email: 'asmith@nexus.local',
  is_enabled: true,
  is_builtin: false,
  auth_type: 'federated',
  last_login: null,
  created_at: '2024-02-01T00:00:00Z',
  updated_at: '2024-02-01T00:00:00Z',
}

export const IDENTITY_ID_1 = 'id-1111-2222-3333-4444-555566667777'
export const IDENTITY_ID_2 = 'id-aaaa-bbbb-cccc-dddd-eeeeffff0000'
export const PROVIDER_ID = 'provider-oidc-1'

export const federatedUserIdentity = {
  id: IDENTITY_ID_1,
  user_id: FEDERATED_USER_ID,
  identity_provider_id: PROVIDER_ID,
  issuer: 'https://sso.example.com',
  subject: 'asmith@example.com',
  created_at: '2024-02-10T12:00:00Z',
  updated_at: '2024-02-10T12:00:00Z',
  last_used_at: '2024-03-01T08:00:00Z',
  provider_name: 'Corporate SSO',
}

export const nonBuiltinUserIdentity = {
  id: IDENTITY_ID_2,
  user_id: NON_BUILTIN_USER_ID,
  identity_provider_id: PROVIDER_ID,
  issuer: 'https://sso.example.com',
  subject: 'jdoe@example.com',
  created_at: '2024-01-20T10:00:00Z',
  updated_at: '2024-01-20T10:00:00Z',
  last_used_at: '2024-02-15T09:00:00Z',
  provider_name: 'Corporate SSO',
}

export const usersListResponse = {
  resources: [nonBuiltinUserResponse, federatedUserResponse],
  next: null,
  total: 2,
}
