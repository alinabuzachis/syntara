/** Mock data for Access Management (RBAC) endpoints. */

// ── Users (simplified for display) ────────────────────────────────────────

export interface MockUser {
  id: string
  username: string
  full_name: string
}

export const mockUsers: MockUser[] = [
  { id: 'u-001', username: 'alice', full_name: 'Alice Johnson' },
  { id: 'u-002', username: 'bob', full_name: 'Bob Smith' },
  { id: 'u-003', username: 'carol', full_name: 'Carol Williams' },
  { id: 'u-004', username: 'admin', full_name: 'System Admin' },
  { id: 'u-005', username: 'dave', full_name: 'Dave Chen' },
]

// ── Groups ────────────────────────────────────────────────────────────────

export interface MockGroup {
  id: string
  name: string
  is_builtin: boolean
}

export const mockGroups: MockGroup[] = [
  { id: 'g-001', name: 'authenticated', is_builtin: true },
  { id: 'g-002', name: 'admins', is_builtin: true },
  { id: 'g-003', name: 'developers', is_builtin: false },
]

// ── Projects ──────────────────────────────────────────────────────────────

export interface MockProject {
  id: string
  name: string
  description: string | null
  labels: Record<string, string>
  is_default: boolean
  created_at: string
  updated_at: string
}

const now = new Date().toISOString()

export const mockProjects: MockProject[] = [
  {
    id: 'p-001',
    name: 'default',
    description: 'Default project for all users',
    labels: {},
    is_default: true,
    created_at: '2024-01-15T19:00:00.000Z',
    updated_at: now,
  },
  {
    id: 'p-002',
    name: 'alice-sandbox',
    description: 'Alice sandbox project',
    labels: { team: 'platform' },
    is_default: false,
    created_at: '2024-02-01T19:00:00.000Z',
    updated_at: '2024-03-14T20:00:00.000Z',
  },
]

// ── Policies ─────────────────────────────────────────────────────────────

export interface MockPolicy {
  id: string
  name: string
  description: string | null
  is_builtin: boolean
  /** Policy scope for list filtering (`any` | `self` | `project`), aligned with PolicyRead.scope */
  scope: 'any' | 'self' | 'project'
  project_id: string | null
  created_at: string
  updated_at: string
}

export const mockPolicies: MockPolicy[] = [
  // Global builtin policies
  {
    id: 'pol-001',
    name: 'admin:full:any',
    description: 'Full administrative access to all resources',
    is_builtin: true,
    scope: 'any',
    project_id: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'pol-002',
    name: 'workflow:create:any',
    description: 'Create workflows in any project',
    is_builtin: true,
    scope: 'any',
    project_id: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'pol-003',
    name: 'workflow:read:any',
    description: 'View workflows in any project',
    is_builtin: true,
    scope: 'any',
    project_id: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'pol-004',
    name: 'workflow:update:any',
    description: 'Edit workflows in any project',
    is_builtin: true,
    scope: 'any',
    project_id: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'pol-005',
    name: 'workflow:delete:any',
    description: 'Delete workflows in any project',
    is_builtin: true,
    scope: 'any',
    project_id: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'pol-006',
    name: 'execution:read:any',
    description: 'View execution results',
    is_builtin: true,
    scope: 'any',
    project_id: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'pol-007',
    name: 'execution:run:any',
    description: 'Run workflow executions',
    is_builtin: true,
    scope: 'any',
    project_id: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'pol-008',
    name: 'audit:read:any',
    description: 'View audit logs',
    is_builtin: true,
    scope: 'any',
    project_id: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'pol-009',
    name: 'project-role:assign:any',
    description: 'Assign roles within projects',
    is_builtin: true,
    scope: 'any',
    project_id: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'pol-010',
    name: 'user:read:self',
    description: 'Read own user information',
    is_builtin: true,
    scope: 'self',
    project_id: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'pol-011',
    name: 'user:update:self',
    description: 'Update own user information',
    is_builtin: true,
    scope: 'self',
    project_id: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'pol-012',
    name: 'project:create:any',
    description: 'Create new projects',
    is_builtin: true,
    scope: 'any',
    project_id: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  // Project-scoped policies (alice-sandbox)
  {
    id: 'pol-013',
    name: 'deployment:approve:any',
    description: 'Approve deployment requests',
    is_builtin: false,
    scope: 'project',
    project_id: 'p-002',
    created_at: '2024-02-10T00:00:00.000Z',
    updated_at: '2024-02-10T00:00:00.000Z',
  },
  {
    id: 'pol-014',
    name: 'secret:read:any',
    description: 'Read project secrets and credentials',
    is_builtin: false,
    scope: 'project',
    project_id: 'p-002',
    created_at: '2024-02-10T00:00:00.000Z',
    updated_at: '2024-02-10T00:00:00.000Z',
  },
  // Project-scoped policy (default)
  {
    id: 'pol-015',
    name: 'inventory:manage:any',
    description: 'Manage inventory resources',
    is_builtin: false,
    scope: 'project',
    project_id: 'p-001',
    created_at: '2024-01-20T00:00:00.000Z',
    updated_at: '2024-01-20T00:00:00.000Z',
  },
]

// ── Roles ─────────────────────────────────────────────────────────────────

export interface MockRole {
  id: string
  name: string
  description: string | null
  policies: string[]
  is_builtin: boolean
  project_id: string | null
  labels: Record<string, string>
  created_at: string
  updated_at: string
}

export const mockRoles: MockRole[] = [
  {
    id: 'r-001',
    name: 'admin',
    description: 'Full system access',
    policies: ['admin:full:any'],
    is_builtin: true,
    project_id: null,
    labels: {},
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'r-002',
    name: 'user',
    description: 'Standard user access',
    policies: [
      'workflow:create:any',
      'workflow:read:any',
      'workflow:update:any',
      'workflow:delete:any',
      'execution:read:any',
      'execution:run:any',
    ],
    is_builtin: true,
    project_id: null,
    labels: {},
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'r-003',
    name: 'auditor',
    description: 'Read-only access for auditing',
    policies: ['workflow:read:any', 'execution:read:any', 'audit:read:any'],
    is_builtin: true,
    project_id: null,
    labels: {},
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'r-004',
    name: 'project-admin',
    description: 'Full project access including role assignment',
    policies: [
      'workflow:create:any',
      'workflow:read:any',
      'workflow:update:any',
      'workflow:delete:any',
      'project-role:assign:any',
    ],
    is_builtin: true,
    project_id: null,
    labels: {},
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'r-005',
    name: 'project-user',
    description: 'Standard project member access',
    policies: [
      'workflow:create:any',
      'workflow:read:any',
      'workflow:update:any',
      'execution:read:any',
      'execution:run:any',
    ],
    is_builtin: true,
    project_id: null,
    labels: {},
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'r-006',
    name: 'project-auditor',
    description: 'Read-only access within a project',
    policies: ['workflow:read:any', 'execution:read:any'],
    is_builtin: true,
    project_id: null,
    labels: {},
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'r-007',
    name: 'default',
    description: 'Baseline for all authenticated users',
    policies: ['user:read:self', 'user:update:self', 'project:create:any'],
    is_builtin: true,
    project_id: null,
    labels: {},
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'r-008',
    name: 'deployer',
    description: 'Can approve and manage deployments',
    policies: ['deployment:approve:any', 'execution:run:any'],
    is_builtin: false,
    project_id: 'p-002',
    labels: {},
    created_at: '2024-02-10T00:00:00.000Z',
    updated_at: '2024-02-10T00:00:00.000Z',
  },
  {
    id: 'r-009',
    name: 'inventory-manager',
    description: 'Manage inventory and related resources',
    policies: ['inventory:manage:any', 'workflow:read:any'],
    is_builtin: false,
    project_id: 'p-001',
    labels: {},
    created_at: '2024-01-20T00:00:00.000Z',
    updated_at: '2024-01-20T00:00:00.000Z',
  },
]

// ── Project Role Assignments (user → role in project) ─────────────────────

export interface MockProjectRoleAssignment {
  id: string
  user_id: string
  username: string
  project_id: string
  role_id: string
  role_name: string
  created_at: string
}

export const mockProjectRoleAssignments: MockProjectRoleAssignment[] = [
  {
    id: 'pra-001',
    user_id: 'u-001',
    username: 'alice',
    project_id: 'p-002',
    role_id: 'r-004',
    role_name: 'project-admin',
    created_at: '2024-02-01T19:00:00.000Z',
  },
  {
    id: 'pra-002',
    user_id: 'u-002',
    username: 'bob',
    project_id: 'p-002',
    role_id: 'r-005',
    role_name: 'project-user',
    created_at: '2024-02-15T19:00:00.000Z',
  },
]

// ── Project Group Role Assignments (group → role in project) ──────────────

export interface MockProjectGroupRoleAssignment {
  id: string
  group_id: string
  group_name: string
  project_id: string
  role_id: string
  role_name: string
  created_at: string
}

export const mockProjectGroupRoleAssignments: MockProjectGroupRoleAssignment[] = [
  {
    id: 'pgra-001',
    group_id: 'g-001',
    group_name: 'authenticated',
    project_id: 'p-001',
    role_id: 'r-005',
    role_name: 'project-user',
    created_at: '2024-01-15T19:00:00.000Z',
  },
]

// ── System-level Group Role Assignments ───────────────────────────────────

export interface MockGroupRoleAssignment {
  id: string
  group_id: string
  group_name: string
  role_id: string
  role_name: string
  created_at: string
}

export const mockGroupRoleAssignments: MockGroupRoleAssignment[] = [
  {
    id: 'gra-001',
    group_id: 'g-001',
    group_name: 'authenticated',
    role_id: 'r-007',
    role_name: 'default',
    created_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'gra-002',
    group_id: 'g-002',
    group_name: 'admins',
    role_id: 'r-001',
    role_name: 'admin',
    created_at: '2024-01-01T00:00:00.000Z',
  },
]

// ── System-level User Role Assignments ───────────────────────────────────

export interface MockUserRoleAssignment {
  id: string
  user_id: string
  username: string
  role_id: string
  role_name: string
  created_at: string
}

export const mockUserRoleAssignments: MockUserRoleAssignment[] = [
  {
    id: 'ura-001',
    user_id: 'u-001',
    username: 'alice',
    role_id: 'r-001',
    role_name: 'admin',
    created_at: '2024-01-01T00:00:00.000Z',
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────

export function getUserName(userId: string): string {
  return mockUsers.find((u) => u.id === userId)?.full_name ?? userId
}

export function getGroupName(groupId: string): string {
  return mockGroups.find((g) => g.id === groupId)?.name ?? groupId
}

export function getRoleName(roleId: string): string {
  return mockRoles.find((r) => r.id === roleId)?.name ?? roleId
}
