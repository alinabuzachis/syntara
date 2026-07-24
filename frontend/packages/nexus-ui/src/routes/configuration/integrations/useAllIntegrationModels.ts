import type { IntegrationsAPI } from '@ansible/nexus-contracts'
import { useQuery } from '@tanstack/react-query'

import { integrationsFetchClient } from '../../../client'
import { fetchAllPages, MAX_PAGE_SIZE } from '../../../utils/fetchAllPages'

type LLMModelRead = IntegrationsAPI.components['schemas']['LLMModelRead']

export async function fetchAllIntegrationModels(integrationId: string): Promise<LLMModelRead[]> {
  return fetchAllPages<LLMModelRead>((cursor) =>
    integrationsFetchClient.GET('/integrations/{integration_id}/models', {
      params: {
        path: { integration_id: integrationId },
        query: { sort: 'name', limit: MAX_PAGE_SIZE, cursor },
      },
    })
  )
}

export function useAllIntegrationModels(integrationId: string) {
  const {
    data: models = [],
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ['all-integration-models', integrationId],
    queryFn: () => fetchAllIntegrationModels(integrationId),
    enabled: !!integrationId,
  })
  return { models, isLoading: isPending, error, refetch }
}
