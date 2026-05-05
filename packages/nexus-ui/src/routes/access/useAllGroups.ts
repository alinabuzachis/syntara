import type { Group, UsersAPI } from '@ansible/nexus-contracts'
import { useQuery } from '@tanstack/react-query'

import { fetchAllPages, MAX_PAGE_SIZE } from '../../utils/fetchAllPages'

import { accessFetchClient } from './accessClient'

type GroupRead = UsersAPI.components['schemas']['GroupRead']

function isGroupRow(row: GroupRead): row is Group {
  return typeof row.id === 'string'
}

async function fetchAllGroups(): Promise<Group[]> {
  const rows = await fetchAllPages<GroupRead>((cursor) =>
    accessFetchClient.GET('/groups', {
      params: { query: { limit: MAX_PAGE_SIZE, cursor } },
    })
  )
  return rows.filter(isGroupRow)
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
