import type * as UsersAPI from '@ansible/nexus-contracts/src/users-api.js'

export type UserRead = UsersAPI.components['schemas']['UserRead']
export type UserIdentityRead = UsersAPI.components['schemas']['UserIdentityRead']

/** Mutable map of user_id → identities for the mock API */
export const userIdentities: Map<string, UserIdentityRead[]> = new Map([
  [
    'c3d4e5f6-a7b8-9012-cdef-123456789012',
    [
      {
        id: 'ident-0001-aaaa-bbbb-ccccddddeeee',
        user_id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
        identity_provider_id: '550e8400-e29b-41d4-a716-446655440001',
        issuer: 'https://sso.example.com/realms/corporate',
        subject: 'asmith@example.com',
        provider_name: 'Corporate SSO',
        created_at: '2026-02-05T10:00:00Z',
        last_used_at: '2026-03-30T16:45:00Z',
      },
      {
        id: 'ident-0002-aaaa-bbbb-ccccddddeeee',
        user_id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
        identity_provider_id: '550e8400-e29b-41d4-a716-446655440002',
        issuer: 'https://token.actions.githubusercontent.com',
        subject: 'asmith-gh',
        provider_name: 'GitHub OAuth',
        created_at: '2026-02-10T14:30:00Z',
        last_used_at: '2026-03-28T09:00:00Z',
      },
    ],
  ],
  [
    'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    [
      {
        id: 'ident-0003-aaaa-bbbb-ccccddddeeee',
        user_id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
        identity_provider_id: '550e8400-e29b-41d4-a716-446655440001',
        issuer: 'https://sso.example.com/realms/corporate',
        subject: 'jdoe@example.com',
        provider_name: 'Corporate SSO',
        created_at: '2026-01-20T08:00:00Z',
        last_used_at: '2026-03-28T09:15:00Z',
      },
    ],
  ],
])

export const users: UserRead[] = [
  {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    username: 'demo',
    email: 'demo@example.com',
    first_name: 'Demo',
    last_name: 'Admin',
    is_enabled: true,
    auth_type: 'local',
    auth_sources: ['Local'],
    last_login: '2026-04-01T14:30:00Z',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    username: 'jdoe',
    email: 'jdoe@example.com',
    first_name: 'John',
    last_name: 'Doe',
    is_enabled: true,
    auth_type: 'federated',
    auth_sources: ['AAP'],
    last_login: '2026-03-28T09:15:00Z',
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-02-10T00:00:00Z',
  },
  {
    id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
    username: 'asmith',
    email: 'asmith@example.com',
    first_name: 'Alice',
    last_name: 'Smith',
    is_enabled: true,
    auth_type: 'federated',
    auth_sources: ['AAP', 'Azure AD'],
    last_login: '2026-03-30T16:45:00Z',
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
  },
  {
    id: 'd4e5f6a7-b8c9-0123-defa-234567890123',
    username: 'viewer1',
    email: 'viewer1@example.com',
    first_name: 'View',
    last_name: 'Only',
    is_enabled: true,
    auth_type: 'local',
    auth_sources: ['Local'],
    last_login: null,
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
  },
  {
    id: 'e5f6a7b8-c9d0-1234-efab-345678901234',
    username: 'inactive_user',
    email: 'inactive@example.com',
    first_name: 'Inactive',
    last_name: 'User',
    is_enabled: false,
    auth_type: 'local',
    auth_sources: ['Local'],
    last_login: '2026-01-10T08:00:00Z',
    created_at: '2026-01-05T00:00:00Z',
    updated_at: '2026-03-15T00:00:00Z',
  },
]
