import type { WorkflowAPI } from '@syntara/contracts'
import { useQueries } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

import { workflowFetchClient } from '../../../client'
import { useWorkflowsQuery } from '../../workflows/useWorkflowsQuery'

type InvocationSchema = WorkflowAPI.components['schemas']['WorkflowInvocationSchemaRead']
type InvocationTrigger = WorkflowAPI.components['schemas']['WorkflowInvocationTriggerSchema']

export type ChildWorkflowOption = {
  value: string
  label: string
  description?: string
  triggers: InvocationTrigger[]
}

export class InvocationSchemaFetchError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`Failed to load child workflow invocation schema (${status})`)
    this.name = 'InvocationSchemaFetchError'
    this.status = status
  }
}

export function isInvocationSchemaForbidden(error: unknown): error is InvocationSchemaFetchError {
  return error instanceof InvocationSchemaFetchError && error.status === 403
}

export function isInvocationSchemaNotFound(error: unknown): error is InvocationSchemaFetchError {
  return error instanceof InvocationSchemaFetchError && error.status === 404
}

async function fetchInvocationSchema(workflowId: string): Promise<InvocationSchema> {
  const { data, error, response } = await workflowFetchClient.GET('/workflows/{workflow_id}/invocation-schema', {
    params: { path: { workflow_id: workflowId } },
  })

  if (error || !data) {
    throw new InvocationSchemaFetchError(response.status)
  }

  return data
}

function invocationSchemaQueryKey(workflowId: string) {
  return ['workflow-invocation-schema', workflowId] as const
}

/**
 * Fetch same-project workflows and their published invocation schemas.
 * Only workflows exposing at least one Subworkflow Trigger are selectable.
 */
export function useChildWorkflowSelector({
  projectId,
  selectedWorkflowId,
}: {
  projectId: string | null
  selectedWorkflowId: string | null
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const nameFilter = searchTerm.trim()

  const { workflowsQuery, workflows } = useWorkflowsQuery({
    queryParams: {
      ...(nameFilter ? { name: nameFilter } : {}),
      is_enabled: true,
    },
    isAllProjects: false,
    stableProjectId: projectId ?? undefined,
    projectSelectorReady: !!projectId,
  })

  const publishedWorkflows = useMemo(
    () => workflows.filter((workflow) => workflow.id && workflow.published_version_number != null),
    [workflows]
  )

  const workflowIds = useMemo(() => {
    const ids = publishedWorkflows.map((workflow) => workflow.id)
    if (selectedWorkflowId) ids.push(selectedWorkflowId)
    return [...new Set(ids)]
  }, [publishedWorkflows, selectedWorkflowId])

  const schemasByWorkflowId = useQueries({
    queries: workflowIds.map((workflowId) => ({
      queryKey: invocationSchemaQueryKey(workflowId),
      queryFn: () => fetchInvocationSchema(workflowId),
      enabled: !!projectId,
    })),
    combine: (results) => new Map(workflowIds.map((workflowId, index) => [workflowId, results[index]])),
  })

  const options = useMemo<ChildWorkflowOption[]>(() => {
    return publishedWorkflows.flatMap((workflow) => {
      const workflowId = workflow.id
      if (!workflowId) return []

      const invocationSchema = schemasByWorkflowId.get(workflowId)?.data
      const triggers = invocationSchema?.triggers ?? []
      if (!invocationSchema?.is_eligible || triggers.length === 0) return []

      return [
        {
          value: workflowId,
          label: `${workflow.name} (v${invocationSchema.published_version})`,
          description: workflow.description ?? undefined,
          triggers,
        },
      ]
    })
  }, [publishedWorkflows, schemasByWorkflowId])

  const selectedOption = options.find((option) => option.value === selectedWorkflowId)
  const selectedSchemaQuery = selectedWorkflowId ? schemasByWorkflowId.get(selectedWorkflowId) : undefined
  const isSchemaLoading = [...schemasByWorkflowId.values()].some((query) => query?.isPending ?? false)
  const hasSchemaError = [...schemasByWorkflowId.values()].some(
    (query) =>
      query?.isError && !(query.error instanceof InvocationSchemaFetchError && [403, 404].includes(query.error.status))
  )

  return {
    options,
    selectedOption,
    selectedSchema: selectedSchemaQuery?.data,
    selectedSchemaQuery,
    selectedSchemaError: selectedSchemaQuery?.error,
    isLoading: workflowsQuery.isLoading || isSchemaLoading,
    hasError: workflowsQuery.isError || hasSchemaError,
    searchTerm,
    setSearchTerm,
  }
}

export type { InvocationTrigger }
