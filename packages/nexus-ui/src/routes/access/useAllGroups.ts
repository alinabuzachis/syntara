import type { Group } from '@ansible/nexus-contracts'
import { useQuery } from '@tanstack/react-query'

import { fetchAllPages, MAX_PAGE_SIZE } from '../../utils/fetchAllPages'

import { accessFetchClient } from './accessClient'

async function fetchAllGroups(): Promise<Group[]> {
  return fetchAllPages<Group>((cursor) =>
    accessFetchClient.GET('/groups', {
      params: { query: { limit: MAX_PAGE_SIZE, cursor } },
    })
  )
}

/**
 * All groups for dropdowns (cursor pagination under the hood).
 * For tables, use cursor pagination instead.
 */
export function useAllGroups() {
  const {
    data: groups = [],
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ['all-groups'],
    queryFn: fetchAllGroups,
  })
  return { groups, isLoading: isPending, error, refetch }
}
