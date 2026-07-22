import { useMemo } from 'react'

import { useDialogState } from '../../hooks/useDialogState'
import type { ProjectRead } from '../access/types'
import { useProjectPermissions } from '../access-management/useProjectPermissions'

/**
 * Selected-project permissions and edit/delete dialogs for the Workflows page.
 * Group headers scope update/delete separately via their own resourceProject.
 */
export function useWorkflowProjectControls(projects: ProjectRead[], selectedProjectId: string | null) {
  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  )
  const projectPermissions = useProjectPermissions({
    resourceProject: selectedProject?.name || selectedProject?.id || undefined,
  })
  const projectEditDialog = useDialogState<ProjectRead>()
  const projectDeleteDialog = useDialogState<ProjectRead>()
  const projectActionCallbacks = useMemo(
    () => ({
      onEdit: projectEditDialog.open,
      onDelete: projectDeleteDialog.open,
    }),
    [projectEditDialog.open, projectDeleteDialog.open]
  )

  return {
    projectPermissions,
    projectEditDialog,
    projectDeleteDialog,
    projectActionCallbacks,
  }
}
