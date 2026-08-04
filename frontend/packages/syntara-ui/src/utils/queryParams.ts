/**
 * Build the optional project_id query parameter for API calls.
 * Returns an object with `project_id` set when projectId is truthy, or an empty object otherwise.
 * Spread the result into query params: `{ ...baseParams, ...projectIdParam(projectId) }`.
 */
export function projectIdParam(projectId?: string): { project_id: string } | Record<string, never> {
  return projectId ? { project_id: projectId } : {}
}
