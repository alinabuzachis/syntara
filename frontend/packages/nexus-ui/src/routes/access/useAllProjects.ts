import { useQuery } from '@tanstack/react-query'

import { fetchAllPages, MAX_PAGE_SIZE } from '../../utils/fetchAllPages'

import { accessFetchClient } from './accessClient'
import type { ProjectRead } from './types'

function makeProjectFetcher(extra?: { is_builtin?: boolean }) {
  return async (): Promise<ProjectRead[]> =>
    fetchAllPages<ProjectRead>((cursor) =>
      accessFetchClient.GET('/projects', {
        params: { query: { limit: MAX_PAGE_SIZE, cursor, ...extra } },
      })
    )
}

const fetchAllProjects = makeProjectFetcher()
const fetchSelectableProjects = makeProjectFetcher({ is_builtin: false })

/** All projects, including the built-in project. Use for display and name-lookup contexts. */
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

/** Non-builtin projects only. Use for "pick a project to create a resource in" dropdowns. */
export function useSelectableProjects() {
  const {
    data: projects = [],
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ['all-projects', { is_builtin: false }],
    queryFn: fetchSelectableProjects,
  })
  return { projects, isLoading: isPending, error, refetch }
}
