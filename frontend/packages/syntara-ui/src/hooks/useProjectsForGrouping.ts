import { useMemo } from 'react'

import type { ProjectRead } from '../routes/access/types'
import { useAllProjects } from '../routes/access/useAllProjects'

/**
 * Resolves projects for All-projects group headers.
 *
 * The project selector typeahead is capped at PAGE_SIZE=20 via usePaginatedProjects.
 * Reusing that list for name lookup shows raw project IDs once an account has more
 * than 20 projects. In all-projects mode, load the full list with useAllProjects
 * (fetchAllPages). While that list is empty (loading/error), fall back to
 * knownProjects so selector-cached entries still resolve.
 */
export function useProjectsForGrouping(knownProjects: readonly ProjectRead[], isAllProjects: boolean): ProjectRead[] {
  const { projects: allProjects } = useAllProjects({ enabled: isAllProjects })

  return useMemo(() => {
    if (!isAllProjects) {
      return [...knownProjects]
    }
    if (allProjects.length === 0) {
      return [...knownProjects]
    }
    const byId = new Map<string, ProjectRead>()
    for (const project of allProjects) {
      if (project.id) {
        byId.set(project.id, project)
      }
    }
    // Prefer knownProjects fields for overlapping IDs — the selector list is
    // refetched after create/edit/delete and can be fresher than the cached full
    // list. Merge onto the full-list entry so omitted fields (e.g. is_builtin)
    // are not wiped when the selector payload is thinner.
    for (const project of knownProjects) {
      if (project.id) {
        const existing = byId.get(project.id)
        byId.set(project.id, existing ? { ...existing, ...project } : project)
      }
    }
    return [...byId.values()]
  }, [isAllProjects, allProjects, knownProjects])
}
