import type { AuthzAPI } from '@ansible/nexus-contracts'
import { useQuery } from '@tanstack/react-query'

import { fetchAllPages, MAX_PAGE_SIZE } from '../../utils/fetchAllPages'

import { accessFetchClient } from './accessClient'

type PermissionEntry = AuthzAPI.components['schemas']['PermissionEntry']

async function fetchAllPermissions(): Promise<PermissionEntry[]> {
  return fetchAllPages<PermissionEntry>((cursor) =>
    accessFetchClient.POST('/authz/what_can_i', {
      body: { limit: MAX_PAGE_SIZE, cursor },
    })
  )
}

/**
 * Fetches all permission entries for the current user across all pages.
 *
 * After role or assignment mutations, callers should also invalidate this cache:
 *   queryClient.invalidateQueries({ queryKey: ['all-permissions'] })
 */
export function useAllPermissions() {
  const {
    data: permissions = [],
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ['all-permissions'],
    queryFn: fetchAllPermissions,
    staleTime: 5 * 60 * 1000,
  })
  return { permissions, isLoading: isPending, error, refetch }
}
