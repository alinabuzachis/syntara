import { useMemo } from 'react'

import { executionsClient } from '../../../client'

type NodeExecutionDetails = {
  /** Resolved config values passed to the activity at runtime */
  inputData: Record<string, unknown> | null
  /** Activity results after output mapping */
  outputData: Record<string, unknown> | null
  isLoading: boolean
  error: unknown
  refetch: () => Promise<unknown>
}

/**
 * Fetches execution details (input/output data) for a specific activity node.
 *
 * Uses the `activity_name` query parameter for server-side filtering,
 * so only the matching activity is returned from the API.
 */
export function useNodeExecutionDetails(nodeId: string, executionId: string | null | undefined): NodeExecutionDetails {
  const { data, isLoading, error, refetch } = executionsClient.useQuery(
    'get',
    '/executions/{execution_id}/activities',
    {
      params: {
        path: { execution_id: executionId ?? '' },
        query: { activity_name: nodeId, limit: 1 },
      },
    },
    { enabled: !!executionId && !!nodeId }
  )

  return useMemo(() => {
    if (!data) {
      return { inputData: null, outputData: null, isLoading, error, refetch }
    }

    const activity = data.resources?.[0]

    // Contract types input_data as Record<string, never> — the runtime values
    // are arbitrary JSON objects, so we widen to Record<string, unknown>.
    // output_data is already typed as Record<string, unknown> | null in the contract.
    return {
      inputData: (activity?.input_data as Record<string, unknown> | undefined) ?? null,
      outputData: activity?.output_data ?? null,
      isLoading,
      error,
      refetch,
    }
  }, [data, isLoading, error, refetch])
}
