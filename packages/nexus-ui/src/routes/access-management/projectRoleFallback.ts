import { getErrorMessage, getErrorStatus } from '../../utils/apiErrors'
import { batchedAllSettled } from '../../utils/batchedSettled'
import { accessFetchClient } from '../access/accessClient'
import type { ProjectGroupRoleAssignmentRead, ProjectRoleAssignmentRead } from '../access/types'

export type ProjectScopedRoleAssignmentRow = {
  id: string
  roleName: string
  scope: string
  scopeType: 'project'
  createdAt: string | null
  projectId: string
}

type ProjectRoleFetchResult =
  | {
      project: { id: string; name: string }
      assignments: ProjectRoleAssignmentRead[]
      error: unknown
      type: 'user'
    }
  | {
      project: { id: string; name: string }
      assignments: ProjectGroupRoleAssignmentRead[]
      error: unknown
      type: 'group'
    }

function reportUnexpectedProjectRoleError(projectId: string, error: unknown) {
  if (typeof globalThis.reportError !== 'function') return
  const message = getErrorMessage(error)
  if (error instanceof Error) {
    globalThis.reportError(error)
    return
  }
  globalThis.reportError(new Error(`Unexpected project role fetch error for ${projectId}: ${message}`))
}

function mapUserAssignments(
  assignments: ProjectRoleAssignmentRead[],
  principalId: string,
  project: { id: string; name: string }
): ProjectScopedRoleAssignmentRow[] {
  return assignments
    .filter((assignment) => assignment.user_id === principalId)
    .map((assignment) => ({
      id: assignment.id,
      roleName: assignment.role_name,
      scope: project.name,
      scopeType: 'project',
      createdAt: assignment.created_at ?? null,
      projectId: project.id,
    }))
}

function mapGroupAssignments(
  assignments: ProjectGroupRoleAssignmentRead[],
  principalId: string,
  project: { id: string; name: string }
): ProjectScopedRoleAssignmentRow[] {
  return assignments
    .filter((assignment) => assignment.group_id === principalId)
    .map((assignment) => ({
      id: assignment.id,
      roleName: assignment.role_name,
      scope: project.name,
      scopeType: 'project',
      createdAt: assignment.created_at ?? null,
      projectId: project.id,
    }))
}

async function fetchProjectRoleBatch(
  principalType: 'user' | 'group',
  project: { id: string; name: string }
): Promise<ProjectRoleFetchResult> {
  if (principalType === 'user') {
    const { data, error } = await accessFetchClient.GET('/projects/{project_id}/role-assignments', {
      params: { path: { project_id: project.id } },
    })
    return { project, assignments: data ?? [], error, type: 'user' }
  }

  const { data, error } = await accessFetchClient.GET('/projects/{project_id}/group-role-assignments', {
    params: { path: { project_id: project.id } },
  })
  return { project, assignments: data ?? [], error, type: 'group' }
}

/**
 * Fetches project-scoped role assignments for a principal across all accessible projects.
 * Used as a fallback when system-level queries return 403.
 */
export async function fetchProjectRolesForPrincipal(
  principalType: 'user' | 'group',
  principalId: string
): Promise<ProjectScopedRoleAssignmentRow[]> {
  const { data: projects } = await accessFetchClient.GET('/projects')
  if (!projects || projects.length === 0) return []

  const projectsWithId = projects.filter((p): p is typeof p & { id: string } => !!p.id)
  const fetchResults = await batchedAllSettled(projectsWithId, (project) =>
    fetchProjectRoleBatch(principalType, project)
  )
  const allRows: ProjectScopedRoleAssignmentRow[] = []

  for (const result of fetchResults) {
    if (result.status !== 'fulfilled') continue

    const { project, assignments, error, type } = result.value
    if (error) {
      const status = getErrorStatus(error)
      if (status !== 403 && status !== 404) {
        reportUnexpectedProjectRoleError(project.id, error)
      }
      continue
    }

    const projectRows =
      type === 'user'
        ? mapUserAssignments(assignments, principalId, project)
        : mapGroupAssignments(assignments, principalId, project)
    allRows.push(...projectRows)
  }

  return allRows
}
