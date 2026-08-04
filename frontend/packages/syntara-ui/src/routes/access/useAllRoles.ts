import { useQuery } from '@tanstack/react-query'

import { fetchAllPages, MAX_PAGE_SIZE } from '../../utils/fetchAllPages'

import { accessFetchClient } from './accessClient'
import type { RoleRead } from './types'

async function fetchAllRoles(): Promise<RoleRead[]> {
  return fetchAllPages<RoleRead>((cursor) =>
    accessFetchClient.GET('/roles', {
      params: { query: { sort: 'name', limit: MAX_PAGE_SIZE, cursor } },
    })
  )
}

/** All roles for dropdowns; uses React Query for cache/dedup. */
export function useAllRoles() {
  const {
    data: roles = [],
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ['all-roles'],
    queryFn: fetchAllRoles,
  })
  return { roles, isLoading: isPending, error, refetch }
}
