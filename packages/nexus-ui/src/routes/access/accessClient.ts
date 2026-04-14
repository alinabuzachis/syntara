/**
 * Type-safe API client for Access Management (RBAC) endpoints.
 *
 * Uses auto-generated path types from @ansible/nexus-contracts.
 * All RBAC-related specs are merged into a single client so that
 * consumers can call any access endpoint through one import.
 */
import type {
  AuthzAPI,
  GroupRoleAssignmentsAPI,
  PoliciesAPI,
  ProjectsAPI,
  RolesAPI,
  UserRoleAssignmentsAPI,
  UsersAPI,
} from '@ansible/nexus-contracts'
import createFetchClient from 'openapi-fetch'
import createClient from 'openapi-react-query'

import { authMiddleware } from '../../client'

// Merge all RBAC-related path types into a single type.
// Each spec covers distinct URL paths so there are no key collisions.
// UsersAPI.paths is included for backward compat (users/groups CRUD is
// used alongside RBAC endpoints in access-management components).
type AccessPaths = ProjectsAPI.paths &
  AuthzAPI.paths &
  RolesAPI.paths &
  PoliciesAPI.paths &
  UserRoleAssignmentsAPI.paths &
  GroupRoleAssignmentsAPI.paths &
  UsersAPI.paths

export const accessFetchClient = createFetchClient<AccessPaths>({ baseUrl: '/api/v1/' })
accessFetchClient.use(authMiddleware)
export const accessClient = createClient(accessFetchClient)

// Untyped client for dynamic endpoint access (e.g., ResourceIdSelect).
// Paths are determined at runtime, so responses are typed as `unknown`.
type DynamicPaths = Record<string, { get: { responses: { 200: { content: { 'application/json': unknown } } } } }>
export const dynamicFetchClient = createFetchClient<DynamicPaths>({ baseUrl: '/api/v1/' })
dynamicFetchClient.use(authMiddleware)
