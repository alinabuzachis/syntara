import type { User } from '@ansible/nexus-contracts'
import { useQuery } from '@tanstack/react-query'

import { accessFetchClient } from './accessClient'

async function fetchAllUsers(): Promise<User[]> {
  const allUsers: User[] = []
  let cursor: string | undefined

  while (true) {
    const { data, error } = await accessFetchClient.GET('/users', {
      params: { query: { limit: 100, cursor } },
    })
    if (error) throw new Error(JSON.stringify(error))
    if (!data) throw new Error('Empty response from /users')
    allUsers.push(...data.resources)
    if (!data.next) break
    cursor = data.next
  }

  return allUsers
}

/**
 * Fetches all users via cursor-based pagination.
 * Uses React Query for retry logic, caching, and deduplication.
 */
export function useAllUsers() {
  const { data: users = [], isLoading, error } = useQuery({ queryKey: ['all-users'], queryFn: fetchAllUsers })
  return { users, isLoading, error }
}
