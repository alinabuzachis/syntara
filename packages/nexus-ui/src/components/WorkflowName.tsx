import { workflowClient } from '../client'

/**
 * Props for WorkflowName component
 */
export type WorkflowNameProps = {
  /** Workflow ID to fetch and display name for */
  workflowId: string
  /** Optional fallback to display while loading or on error (defaults to workflow ID) */
  fallback?: React.ReactNode
}

/**
 * Fetches and displays a workflow name by ID
 *
 * Uses React Query to fetch workflow data with automatic caching and deduplication.
 * Multiple instances with the same workflowId will share the same query.
 *
 * @example
 * ```tsx
 * <WorkflowName workflowId="workflow-123" />
 * <WorkflowName workflowId="workflow-456" fallback="Loading..." />
 * ```
 */
export function WorkflowName({ workflowId, fallback }: WorkflowNameProps) {
  const { data, isLoading, isError } = workflowClient.useQuery('get', '/workflows/{workflow_id}', {
    params: {
      path: {
        workflow_id: workflowId,
      },
    },
  })

  // While loading or on error, show fallback (defaults to workflow ID)
  if (isLoading || isError || !data?.name) {
    return <>{fallback ?? workflowId}</>
  }

  return <>{data.name}</>
}
