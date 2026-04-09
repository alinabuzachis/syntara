import type * as AuthAPI from '@ansible/nexus-contracts/src/auth-api.js'

export type GroupRead = AuthAPI.components['schemas']['GroupRead']

export const groups: GroupRead[] = [
  {
    id: 'g1a2b3c4-d5e6-7890-abcd-ef1234567890',
    name: 'platform-admins',
    description: 'Full platform administrators',
    created_by: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'g2b3c4d5-e6f7-8901-bcde-f12345678901',
    name: 'developers',
    description: 'Workflow developers and creators',
    created_by: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
  },
  {
    id: 'g3c4d5e6-f7a8-9012-cdef-123456789012',
    name: 'viewers',
    description: 'Read-only access group',
    created_by: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
  },
]

/** Maps user IDs to the group IDs they belong to */
export const userGroupMemberships: Record<string, string[]> = {
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890': ['g1a2b3c4-d5e6-7890-abcd-ef1234567890'],
  'b2c3d4e5-f6a7-8901-bcde-f12345678901': ['g2b3c4d5-e6f7-8901-bcde-f12345678901'],
  'd4e5f6a7-b8c9-0123-defa-234567890123': ['g3c4d5e6-f7a8-9012-cdef-123456789012'],
}
