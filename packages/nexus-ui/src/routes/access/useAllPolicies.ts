import { useQuery } from '@tanstack/react-query'

import { accessFetchClient } from './accessClient'
import type { PolicyRead } from './types'

async function fetchAllPolicies(): Promise<PolicyRead[]> {
  const allPolicies: PolicyRead[] = []
  let cursor: string | undefined

  while (true) {
    const { data, error } = await accessFetchClient.GET('/policies', {
      params: { query: { limit: 100, cursor } },
    })
    if (error) throw new Error(JSON.stringify(error))
    if (!data) throw new Error('Empty response from /policies')
    // The generated PolicyRead has untyped statements; our PolicyRead alias
    // overrides them with the strongly-typed PolicyStatementSchema. The
    // runtime shape matches, so the cast is safe.
    allPolicies.push(...(data.resources as PolicyRead[]))
    if (!data.next) break
    cursor = data.next
  }

  return allPolicies
}

/**
 * Fetches all policies via cursor-based pagination.
 * Uses React Query for retry logic, caching, and deduplication.
 */
export function useAllPolicies() {
  const { data: policies = [], isLoading, error } = useQuery({ queryKey: ['all-policies'], queryFn: fetchAllPolicies })
  return { policies, isLoading, error }
}
