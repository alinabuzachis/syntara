export type WorkflowVersionsQuery = {
  limit: number
  include_total: boolean
  cursor?: string
}

/** Build query params for GET /workflows/{id}/versions cursor pagination. */
export function buildWorkflowVersionsQuery(perPage: number, cursor: string | null): WorkflowVersionsQuery {
  const query: WorkflowVersionsQuery = {
    limit: perPage,
    include_total: true,
  }
  if (cursor) {
    query.cursor = cursor
  }
  return query
}
