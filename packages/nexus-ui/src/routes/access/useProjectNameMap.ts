import { useMemo } from 'react'

import { useAllProjects } from './useAllProjects'

export function useProjectNameMap() {
  const { projects, isLoading } = useAllProjects()
  const projectNameMap = useMemo(() => {
    if (!Array.isArray(projects)) return new Map<string, string>()
    return new Map(projects.filter((p): p is typeof p & { id: string } => !!p.id).map((p) => [p.id, p.name]))
  }, [projects])

  return { projectNameMap, isLoading }
}
