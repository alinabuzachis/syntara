import type { WorkflowAPI } from '@syntara/contracts'
import { useMemo } from 'react'

import { workflowClient } from '../../client'
import { accessClient } from '../access/accessClient'

type Workflow = WorkflowAPI.components['schemas']['WorkflowRead']

type UseWorkflowsQueryOptions = {
  queryParams: Record<string, unknown>
  isAllProjects: boolean
  stableProjectId: string | undefined
  projectSelectorReady: boolean
}

export function useWorkflowsQuery({
  queryParams,
  isAllProjects,
  stableProjectId,
  projectSelectorReady,
}: UseWorkflowsQueryOptions) {
  const allWorkflowsQuery = workflowClient.useQuery(
    'get',
    '/workflows',
    {
      params: { query: queryParams },
    },
    {
      enabled: projectSelectorReady && isAllProjects,
    }
  )

  const projectWorkflowsQuery = accessClient.useQuery(
    'get',
    '/projects/{project_id}/workflows',
    {
      params: {
        path: { project_id: stableProjectId ?? '' },
        query: queryParams,
      },
    },
    {
      enabled: !!stableProjectId && !isAllProjects,
    }
  )

  const workflowsQuery = isAllProjects ? allWorkflowsQuery : projectWorkflowsQuery
  const workflows = useMemo(() => (workflowsQuery.data?.resources ?? []) as Workflow[], [workflowsQuery.data])

  return { workflowsQuery, workflows }
}
