import type { Approval } from '@ansible/nexus-contracts'

/**
 * Determines if the user can perform approval:decide on a specific approval.
 *
 * The what_can_i endpoint returns project names (not IDs) in permission entries,
 * so we must map approval.project_id to project.name for the permission check.
 * This means renamed projects will break permission checks until the user's
 * permissions are re-evaluated.
 *
 * @param approval - The approval to check (includes project_id from API)
 * @param canDecideAllProjects - True if user has system-level approval:decide permission
 * @param canDecideProjectNames - Set of project names where user has project-scoped approval:decide
 * @param projects - List of all projects with id and name
 * @returns True if user can decide on this approval, false otherwise
 */
export function canDecideOnApproval(
  approval: Approval,
  canDecideAllProjects: boolean,
  canDecideProjectNames: Set<string>,
  projects: { id?: string; name: string }[]
): boolean {
  // Always can decide if has system-level permission
  if (canDecideAllProjects) return true

  // project_id exists in Approval type (from ApprovalRequestRead schema)
  const projectId = approval.project_id

  if (!projectId) {
    // Approval without project - conservative: assume can't decide
    return false
  }

  // Find project name from project ID
  // Note: what_can_i returns project *names*, not IDs, so we must map ID -> name
  const project = projects.find((p) => p.id === projectId)
  if (!project) {
    // Project not found - might be deleted or user lacks project:read
    return false
  }

  // Check if user has decide permission for this project (by name)
  return canDecideProjectNames.has(project.name)
}
