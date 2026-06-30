import { useCallback } from 'react'

import type { useAlerts } from '../../providers/alerts'
import { getErrorMessage } from '../../utils/apiErrors'
import { accessClient } from '../access/accessClient'
import type { ProjectRead } from '../access/types'

type UseProjectActionsOptions = {
  showSuccess: ReturnType<typeof useAlerts>['showSuccess']
  showError: ReturnType<typeof useAlerts>['showError']
  onRefetch: () => void
  onDeleteSettled?: () => void
}

export function useProjectActions({ showSuccess, showError, onRefetch, onDeleteSettled }: UseProjectActionsOptions) {
  const { mutate: deleteProject, isPending: isDeletingProject } = accessClient.useMutation(
    'delete',
    '/projects/{project_id}'
  )

  const handleDeleteProject = useCallback(
    (project: ProjectRead) => {
      if (!project?.id) return

      deleteProject(
        { params: { path: { project_id: project.id } } },
        {
          onSuccess: () => {
            showSuccess({
              title: 'Project deleted',
              description: `Project "${project.name}" has been deleted successfully.`,
            })
            onRefetch()
          },
          onError: (error: unknown) => {
            showError({
              title: 'Delete failed',
              description: `Failed to delete project "${project.name}": ${getErrorMessage(error)}`,
            })
          },
          onSettled: () => {
            onDeleteSettled?.()
          },
        }
      )
    },
    [deleteProject, showSuccess, showError, onRefetch, onDeleteSettled]
  )

  return {
    handleDeleteProject,
    isDeletingProject,
  }
}
