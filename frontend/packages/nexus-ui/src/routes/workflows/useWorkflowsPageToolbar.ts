import { useCallback, useMemo } from 'react'

import type { useDialogState } from '../../hooks/useDialogState'
import type { ProjectRead } from '../access/types'
import type { useProjectPermissions } from '../access-management/useProjectPermissions'

import { buildProjectRowActions } from './projectRowActions'

type UseWorkflowsPageToolbarOptions = {
  isAllProjects: boolean
  selectedProjectId: string | null
  projects: ProjectRead[]
  sortedWorkflowsLength: number
  hasActiveFilters: boolean
  projectEditDialog: ReturnType<typeof useDialogState<ProjectRead>>
  projectDeleteDialog: ReturnType<typeof useDialogState<ProjectRead>>
  projectPermissions: ReturnType<typeof useProjectPermissions>
}

export function useWorkflowsPageToolbar({
  isAllProjects,
  selectedProjectId,
  projects,
  sortedWorkflowsLength,
  hasActiveFilters,
  projectEditDialog,
  projectDeleteDialog,
  projectPermissions,
}: UseWorkflowsPageToolbarOptions) {
  const getProjectActions = useCallback(
    (project: ProjectRead | null) =>
      buildProjectRowActions(project, projectPermissions, {
        onEdit: projectEditDialog.open,
        onDelete: projectDeleteDialog.open,
      }),
    [projectPermissions, projectEditDialog, projectDeleteDialog]
  )

  const headerProjectActions = useMemo(() => {
    if (isAllProjects || !selectedProjectId) return []
    const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null
    return selectedProject ? getProjectActions(selectedProject) : []
  }, [isAllProjects, selectedProjectId, projects, getProjectActions])

  const showWorkflowActions = sortedWorkflowsLength > 0 || hasActiveFilters
  const showImportWorkflow = !isAllProjects || sortedWorkflowsLength > 0 || hasActiveFilters
  const showToolbar = showImportWorkflow || headerProjectActions.length > 0

  return {
    getProjectActions,
    headerProjectActions,
    showWorkflowActions,
    showImportWorkflow,
    showToolbar,
  }
}
