import { useMemo } from 'react'

import { accessClient } from './accessClient'

export function useProjectNameMap() {
  const projectsQuery = accessClient.useQuery('get', '/projects')
  const projectNameMap = useMemo(() => {
    const projects = projectsQuery.data
    if (!Array.isArray(projects)) return new Map<string, string>()
    return new Map(projects.map((p) => [p.id, p.name]))
  }, [projectsQuery.data])

  return { projectNameMap, isLoading: projectsQuery.isPending }
}
