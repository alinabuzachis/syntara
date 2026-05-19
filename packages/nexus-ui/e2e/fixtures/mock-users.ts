/**
 * E2E Test - Mock users
 *
 * Users added:
 *  - Built-in admin
 *  - AAP admin
 *
 */
export const BUILT_IN_ADMIN_USER_INFO = {
  id: 'f5a7b8c9-d0e1-2345-fabc-456789012345',
  username: 'admin',
  email: 'admin@nexus.local',
  groups: ['admins', 'platform-admins', 'authenticated'],
  rp_logout_enabled: false,
}

export const BUILT_IN_ADMIN_USER_READ = {
  id: 'f5a7b8c9-d0e1-2345-fabc-456789012345',
  username: 'admin',
  email: 'admin@nexus.local',
  full_name: 'Administrator',
  is_enabled: true,
  is_builtin: true,
  auth_type: 'local',
  last_login: '2026-04-01T10:30:00Z',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

export const BUILT_IN_ADMIN_USER_JWT_TOKEN = `eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmNWE3YjhjOS1kMGUxLTIzNDUtZmFiYy00NTY3ODkwMTIzNDUiLCJleHAiOjk5OTk5OTk5OTl9.fake-mock-token-admin`

export const AAP_ADMIN_USER_INFO = {
  id: '81a49ff5-79a1-4737-ab8e-a897720cf3e7',
  username: 'admin-aap',
  email: 'admin@nexus.aap',
  groups: ['admins', 'platform-admins', 'authenticated'],
  rp_logout_enabled: false,
}

export const AAP_ADMIN_USER_READ = {
  id: '81a49ff5-79a1-4737-ab8e-a897720cf3e7',
  username: 'admin-aap',
  email: 'admin@nexus.aap',
  full_name: 'admin',
  is_enabled: true,
  is_builtin: false,
  auth_type: 'federated',
  last_login: '2026-05-11T06:00:00Z',
  created_at: '2026-05-10T09:00:00Z',
  updated_at: '2026-05-10T09:00:00Z',
}
