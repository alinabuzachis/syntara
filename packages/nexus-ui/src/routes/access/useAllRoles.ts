import { useQuery } from '@tanstack/react-query'

import { accessFetchClient } from './accessClient'
import type { RoleRead } from './types'

async function fetchAllRoles(): Promise<RoleRead[]> {
  const allRoles: RoleRead[] = []
  let cursor: string | undefined

  while (true) {
    const { data, error } = await accessFetchClient.GET('/roles', {
      params: { query: { limit: 100, cursor } },
    })
    if (error) throw new Error(JSON.stringify(error))
    if (!data) throw new Error('Empty response from /roles')
    allRoles.push(...data.resources)
    if (!data.next) break
    cursor = data.next
  }

  return allRoles
}

/**
 * Fetches all roles via cursor-based pagination.
 * Uses React Query for retry logic, caching, and deduplication.
 */
export function useAllRoles() {
  const { data: roles = [], isLoading, error } = useQuery({ queryKey: ['all-roles'], queryFn: fetchAllRoles })
  return { roles, isLoading, error }
}
