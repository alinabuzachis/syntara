import { Truncate } from '@patternfly/react-core'

import { workflowClient } from '../client'

/**
 * Props for WorkflowName component
 */
export type WorkflowNameProps = {
  /** Workflow ID to fetch and display name for */
  workflowId: string
  /** Optional fallback to display while loading or on error (defaults to workflow ID) */
  fallback?: React.ReactNode
  /** When true, renders with PatternFly Truncate (ellipsis + tooltip on overflow) */
  truncate?: boolean
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
 * <WorkflowName workflowId="workflow-789" truncate />
 * ```
 */
export function WorkflowName({ workflowId, fallback, truncate: shouldTruncate }: WorkflowNameProps) {
  const { data, isLoading, isError } = workflowClient.useQuery('get', '/workflows/{workflow_id}', {
    params: {
      path: {
        workflow_id: workflowId,
      },
    },
  })

  if (isLoading || isError || !data?.name) {
    return shouldTruncate ? <Truncate content={workflowId} /> : <>{fallback ?? workflowId}</>
  }
  return shouldTruncate ? <Truncate content={data.name} /> : <>{data.name}</>
}
