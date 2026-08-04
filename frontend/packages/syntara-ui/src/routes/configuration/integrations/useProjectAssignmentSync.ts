import { useCallback } from 'react'

import { integrationsFetchClient } from '../../../client'

type SyncResult = {
  added: string[]
  removed: string[]
  errors: string[]
}

export function useProjectAssignmentSync() {
  const syncAssignments = useCallback(
    async (integrationId: string, initialIds: string[], newIds: string[]): Promise<SyncResult> => {
      const toAdd = newIds.filter((id) => !initialIds.includes(id))
      const toRemove = initialIds.filter((id) => !newIds.includes(id))
      const result: SyncResult = { added: [], removed: [], errors: [] }

      if (toAdd.length === 0 && toRemove.length === 0) return result

      const addResults = await Promise.allSettled(
        toAdd.map((projectId) =>
          integrationsFetchClient.POST('/integrations/{integration_id}/projects/{project_id}', {
            params: { path: { integration_id: integrationId, project_id: projectId } },
          })
        )
      )

      const removeResults = await Promise.allSettled(
        toRemove.map((projectId) =>
          integrationsFetchClient.DELETE('/integrations/{integration_id}/projects/{project_id}', {
            params: { path: { integration_id: integrationId, project_id: projectId } },
          })
        )
      )

      for (let i = 0; i < addResults.length; i++) {
        const r = addResults[i]
        if (r.status === 'fulfilled' && !r.value.error) {
          result.added.push(toAdd[i])
        } else {
          result.errors.push(`Failed to assign project ${toAdd[i]}`)
        }
      }

      for (let i = 0; i < removeResults.length; i++) {
        const r = removeResults[i]
        if (r.status === 'fulfilled' && !r.value.error) {
          result.removed.push(toRemove[i])
        } else {
          result.errors.push(`Failed to unassign project ${toRemove[i]}`)
        }
      }

      return result
    },
    []
  )

  return { syncAssignments }
}
