/**
 * Shared types for the Access Management (RBAC) routes.
 *
 * Re-exported from auto-generated OpenAPI contracts so that consumer
 * imports stay unchanged while types stay in sync with the backend.
 */
import type { User } from '@ansible/nexus-contracts'
import type * as AuthzAPI from '@ansible/nexus-contracts/src/authz-api.js'
import type * as GroupRoleAssignmentsAPI from '@ansible/nexus-contracts/src/group-role-assignments-api.js'
import type * as PoliciesAPI from '@ansible/nexus-contracts/src/policies-api.js'
import type * as ProjectsAPI from '@ansible/nexus-contracts/src/projects-api.js'
import type * as RolesAPI from '@ansible/nexus-contracts/src/roles-api.js'
import type * as UserRoleAssignmentsAPI from '@ansible/nexus-contracts/src/user-role-assignments-api.js'

// ── Project ───────────────────────────────────────────────────────────────

export type ProjectRead = ProjectsAPI.components['schemas']['ProjectRead']
export type ProjectCreate = ProjectsAPI.components['schemas']['ProjectCreate']
export type ProjectUpdate = ProjectsAPI.components['schemas']['ProjectUpdate']

// ── Project Role Assignment (user → role in project) ──────────────────────

export type ProjectRoleAssignmentRead = ProjectsAPI.components['schemas']['ProjectRoleAssignmentRead']
export type ProjectRoleAssignmentCreate = ProjectsAPI.components['schemas']['ProjectRoleAssignmentCreate']

// ── Project Group Role Assignment (group → role in project) ───────────────

export type ProjectGroupRoleAssignmentRead = ProjectsAPI.components['schemas']['ProjectGroupRoleAssignmentRead']
export type ProjectGroupRoleAssignmentCreate = ProjectsAPI.components['schemas']['ProjectGroupRoleAssignmentCreate']

// ── System-level User Role Assignment (user → role globally) ─────────────

export type UserRoleAssignmentRead = UserRoleAssignmentsAPI.components['schemas']['UserRoleAssignmentRead']
export type UserRoleAssignmentCreate = UserRoleAssignmentsAPI.components['schemas']['UserRoleAssignmentCreate']

// ── System-level Group Role Assignment (group → role globally) ────────────

export type GroupRoleAssignmentRead = GroupRoleAssignmentsAPI.components['schemas']['GroupRoleAssignmentRead']
export type GroupRoleAssignmentCreate = GroupRoleAssignmentsAPI.components['schemas']['GroupRoleAssignmentCreate']

// ── Policy ────────────────────────────────────────────────────────────────

export type PolicyStatement = PoliciesAPI.components['schemas']['PolicyStatementSchema']

// The generated PolicyRead.statements is `{ [key: string]: unknown }[]`
// which loses the strongly-typed PolicyStatementSchema. Override it.
type _PolicyRead = PoliciesAPI.components['schemas']['PolicyRead']
export type PolicyRead = Omit<_PolicyRead, 'statements'> & {
  statements: PolicyStatement[]
}

// ── Role ──────────────────────────────────────────────────────────────────

export type RoleRead = RolesAPI.components['schemas']['RoleRead']
export type RoleCreate = RolesAPI.components['schemas']['RoleCreate']
export type RoleUpdate = RolesAPI.components['schemas']['RoleUpdate']

// ── User ─────────────────────────────────────────────────────────────────

export type UserRead = User

// ── Authorization query types ────────────────────────────────────────────

export type CanIRequest = AuthzAPI.components['schemas']['CanIRequest']
export type CanIResponse = AuthzAPI.components['schemas']['CanIResponse']
export type WhoCanRequest = AuthzAPI.components['schemas']['WhoCanRequest']
export type WhoCanUser = AuthzAPI.components['schemas']['WhoCanUser']
export type WhoCanResponse = AuthzAPI.components['schemas']['WhoCanResponse']

export type PermissionEntry = AuthzAPI.components['schemas']['PermissionEntry']

export type WhatCanIResponse = AuthzAPI.components['schemas']['WhatCanIResponse']

// ── Unified permission row for the Access Management table ───────────────

export interface PermissionRow {
  id: string
  principalType: 'user' | 'group'
  principalId: string
  principalName: string
  assignmentType: 'role'
  assignmentName: string
  scopeType: 'project' | 'system'
  scopeName: string
  projectId?: string
  sourceEndpoint: 'project-roles' | 'project-group-roles' | 'user-role-assignments' | 'group-role-assignments'
}
