import { DEFAULT_WORKFLOW_NAME } from './workflowNaming'

/**
 * Params for GET /workflows filtered by name starting with DEFAULT_WORKFLOW_NAME.
 * Used when creating a new workflow to fetch only conflicting names (new-workflow, new-workflow-1, …)
 * so we can compute the next available default without fetching the full list.
 * Limit 100 is sufficient for typical use; if you have >100 workflows named "new-workflow*",
 * consider cursor-based pagination or server-side suffix allocation.
 */
export const WORKFLOWS_LIST_PARAMS_FOR_DEFAULT_NAME = {
  params: {
    query: {
      cursor: undefined,
      limit: 100,
      include_total: true,
      // API: name[starts_with]=prefix. Contract types name as string & object so we cast.
      name: { starts_with: DEFAULT_WORKFLOW_NAME } as never,
    },
  },
} as const
