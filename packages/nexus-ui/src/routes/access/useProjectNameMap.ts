import { useMemo } from 'react'

import { accessClient } from './accessClient'

export function useProjectNameMap() {
  const projectsQuery = accessClient.useQuery('get', '/projects', {
    params: { query: { limit: 100 } },
  })
  const projectNameMap = useMemo(() => {
    const projects = projectsQuery.data?.resources
    if (!Array.isArray(projects)) return new Map<string, string>()
    return new Map(projects.filter((p): p is typeof p & { id: string } => !!p.id).map((p) => [p.id, p.name]))
  }, [projectsQuery.data])

  return { projectNameMap, isLoading: projectsQuery.isPending }
}
