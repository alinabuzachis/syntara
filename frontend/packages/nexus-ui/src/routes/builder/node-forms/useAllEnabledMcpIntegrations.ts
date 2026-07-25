import type { IntegrationsAPI } from '@ansible/nexus-contracts'
import { IntegrationTypeEnum } from '@ansible/nexus-contracts'
import { useQuery } from '@tanstack/react-query'

import { integrationsFetchClient } from '../../../client'
import { fetchAllPages, MAX_PAGE_SIZE } from '../../../utils/fetchAllPages'

type IntegrationRead = IntegrationsAPI.components['schemas']['IntegrationRead']

async function fetchAllEnabledMcpIntegrations(projectId?: string): Promise<IntegrationRead[]> {
  return fetchAllPages<IntegrationRead>((cursor) =>
    integrationsFetchClient.GET('/integrations', {
      params: {
        query: {
          integration_type: IntegrationTypeEnum.MCP_SERVER,
          enabled: true,
          limit: MAX_PAGE_SIZE,
          cursor,
          ...(projectId ? { project_id: projectId } : {}),
        },
      },
    })
  )
}

export function useAllEnabledMcpIntegrations(projectId?: string) {
  const {
    data: integrations = [],
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['all-enabled-mcp-integrations', projectId],
    queryFn: () => fetchAllEnabledMcpIntegrations(projectId),
  })
  return { integrations, isLoading: isPending, isError, refetch }
}
