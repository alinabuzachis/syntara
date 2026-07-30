import type { User } from '@syntara/contracts'
import { useQuery } from '@tanstack/react-query'

import { fetchAllPages, MAX_PAGE_SIZE } from '../../utils/fetchAllPages'

import { accessFetchClient } from './accessClient'

async function fetchAllUsers(): Promise<User[]> {
  return fetchAllPages<User>((cursor) =>
    accessFetchClient.GET('/users', {
      params: { query: { limit: MAX_PAGE_SIZE, cursor } },
    })
  )
}

/** All users for membership/dropdown pickers. */
export function useAllUsers() {
  const {
    data: users = [],
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ['all-users'],
    queryFn: fetchAllUsers,
  })
  return { users, isLoading: isPending, error, refetch }
}
