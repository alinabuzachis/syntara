import type { ApprovalWithDetails } from './Approvals'

/**
 * Determines if the user can perform approval:decide on a specific approval.
 *
 * @param approval - The approval to check
 * @param canDecideAllProjects - True if user has system-level approval:decide permission
 * @param canDecideProjectNames - Set of project names where user has project-scoped approval:decide
 * @param projects - List of all projects with id and name
 * @returns True if user can decide on this approval, false otherwise
 */
export function canDecideOnApproval(
  approval: ApprovalWithDetails,
  canDecideAllProjects: boolean,
  canDecideProjectNames: Set<string>,
  projects: { id?: string; name: string }[]
): boolean {
  // Always can decide if has system-level permission
  if (canDecideAllProjects) return true

  // Extract project_id from approval (field exists in Approval type from API schema)
  // Cast to access project_id which comes from ApprovalRequestRead in the API
  const approvalWithProject = approval as unknown as { project_id?: string | null }
  const projectId = approvalWithProject.project_id

  if (!projectId) {
    // Approval without project - conservative: assume can't decide
    return false
  }

  // Find project name from project ID
  const project = projects.find((p) => p.id === projectId)
  if (!project) {
    // Project not found - might be deleted or user lacks project:read
    return false
  }

  // Check if user has decide permission for this project
  return canDecideProjectNames.has(project.name)
}
