import { useQuery } from '@tanstack/react-query'

import { fetchAllPages, MAX_PAGE_SIZE } from '../../utils/fetchAllPages'

import { accessFetchClient } from './accessClient'
import type { ProjectRead } from './types'

async function fetchAllProjects(): Promise<ProjectRead[]> {
  return fetchAllPages<ProjectRead>((cursor) =>
    accessFetchClient.GET('/projects', {
      params: { query: { limit: MAX_PAGE_SIZE, cursor } },
    })
  )
}

/** All projects for scope/select dropdowns. */
export function useAllProjects() {
  const {
    data: projects = [],
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ['all-projects'],
    queryFn: fetchAllProjects,
  })
  return { projects, isLoading: isPending, error, refetch }
}
