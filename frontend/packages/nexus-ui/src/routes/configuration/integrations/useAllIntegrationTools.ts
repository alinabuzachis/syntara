import type { Tool, ToolManagerAPI } from '@syntara/contracts'
import { useQuery } from '@tanstack/react-query'

import { toolManagerFetchClient } from '../../../client'
import { fetchAllPages, MAX_PAGE_SIZE } from '../../../utils/fetchAllPages'

type ToolWithParameters = ToolManagerAPI.components['schemas']['ToolWithParameters']

function isToolRow(row: ToolWithParameters): row is Tool {
  return typeof row.id === 'string'
}

async function fetchAllIntegrationTools(integrationId: string): Promise<Tool[]> {
  const rows = await fetchAllPages<ToolWithParameters>((cursor) =>
    toolManagerFetchClient.GET('/tool_manager/tools', {
      params: { query: { integration_id: integrationId, limit: MAX_PAGE_SIZE, cursor } },
    })
  )
  return rows.filter(isToolRow)
}

export function useAllIntegrationTools(integrationId: string) {
  const {
    data: tools = [],
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ['all-integration-tools', integrationId],
    queryFn: () => fetchAllIntegrationTools(integrationId),
    enabled: !!integrationId,
  })
  return { tools, isLoading: isPending, error, refetch }
}
