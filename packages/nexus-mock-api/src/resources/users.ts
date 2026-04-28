import type * as AuthAPI from '@ansible/nexus-contracts/src/auth-api.js'
import type * as UsersAPI from '@ansible/nexus-contracts/src/users-api.js'

export type UserRead = AuthAPI.components['schemas']['UserRead']
export type UserIdentityRead = UsersAPI.components['schemas']['UserIdentityRead']

/** Mutable map of user_id → identities for the mock API */
export const userIdentities: Map<string, UserIdentityRead[]> = new Map()

export const users: UserRead[] = [
  {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    username: 'demo',
    email: 'demo@nexus.local',
    full_name: 'Demo Admin',
    is_enabled: true,
    last_login: '2026-04-01T14:30:00Z',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    username: 'jdoe',
    email: 'jdoe@nexus.local',
    full_name: 'John Doe',
    is_enabled: true,
    last_login: '2026-03-28T09:15:00Z',
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-02-10T00:00:00Z',
  },
  {
    id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
    username: 'asmith',
    email: 'asmith@nexus.local',
    full_name: 'Alice Smith',
    is_enabled: true,
    last_login: '2026-03-30T16:45:00Z',
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
  },
  {
    id: 'd4e5f6a7-b8c9-0123-defa-234567890123',
    username: 'viewer1',
    email: 'viewer1@nexus.local',
    full_name: 'View Only',
    is_enabled: true,
    last_login: null,
    created_at: '2026-03-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
  },
  {
    id: 'e5f6a7b8-c9d0-1234-efab-345678901234',
    username: 'inactive_user',
    email: 'inactive@nexus.local',
    full_name: 'Inactive User',
    is_enabled: false,
    last_login: '2026-01-10T08:00:00Z',
    created_at: '2026-01-05T00:00:00Z',
    updated_at: '2026-03-15T00:00:00Z',
  },
]
