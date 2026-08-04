import type { WorkflowAPI } from '@syntara/contracts'
import { useCallback } from 'react'

import type { AlertMessage } from '../../../providers/alerts'
import { getErrorMessage } from '../../../utils/apiErrors'
import type { BuilderAction } from '../builderReducer'
import { applyImportToCanvas, type PendingImportData } from '../useWorkflowImportExport'
import { buildWorkflowDefinition } from '../utils/workflowDefinitionBuilder'

import type { UseBuilderSaveWorkflowParams } from './useBuilderSaveWorkflow'

type CreateWorkflowBody = WorkflowAPI.paths['/workflows']['post']['requestBody']['content']['application/json']

export type UseBuilderImportHandlersParams = {
  dispatch: (action: BuilderAction) => void
  markDirty: () => void
  selectedProject: { id: string } | null
  createWorkflow: UseBuilderSaveWorkflowParams['createWorkflow']
  setLocation: (to: string) => void
  showSuccess: (options: AlertMessage) => void
  showError: (options: AlertMessage) => void
  showInfo: (options: AlertMessage) => void
}

export function useBuilderImportHandlers(
  params: UseBuilderImportHandlersParams,
  pendingImport: PendingImportData | null,
  setPendingImport: (data: PendingImportData | null) => void
) {
  const { dispatch, markDirty, selectedProject, createWorkflow, setLocation, showSuccess, showError, showInfo } = params

  const handleImportCurrent = useCallback(() => {
    if (!pendingImport) return
    applyImportToCanvas(pendingImport, dispatch, markDirty, showInfo)
    setPendingImport(null)
  }, [pendingImport, dispatch, markDirty, showInfo, setPendingImport])

  const handleImportNew = useCallback(() => {
    if (!pendingImport) return
    const projectId = selectedProject?.id
    if (!projectId) {
      showError({ title: 'Project required', description: 'Select a project to import this workflow.' })
      return
    }
    const importName = pendingImport.name || 'imported-workflow'
    const importDescription = pendingImport.description || importName
    const activities = pendingImport.workflowDef.workflow.activities ?? []
    const triggers = pendingImport.workflowDef.triggers ?? []
    const fullDefinition = buildWorkflowDefinition(importName, importDescription, activities, triggers, {
      edges: pendingImport.edges,
      nodePositions: pendingImport.nodePositions,
    })
    createWorkflow(
      {
        body: {
          name: importName,
          description: importDescription,
          workflow_definition: fullDefinition as unknown as CreateWorkflowBody['workflow_definition'],
          project_id: projectId,
        },
      },
      {
        onSuccess: (data) => {
          setPendingImport(null)
          const newId =
            typeof data === 'object' && data !== null && 'id' in data
              ? String((data as Record<string, unknown>).id)
              : undefined
          showSuccess({ title: 'Workflow imported', description: `Created "${importName}"` })
          if (newId) {
            setLocation(`/workflow-builder/${newId}`)
          }
        },
        onError: (error) => {
          showError({ title: 'Import failed', description: getErrorMessage(error) })
        },
      }
    )
  }, [pendingImport, selectedProject, createWorkflow, showSuccess, showError, setLocation, setPendingImport])

  const clearPendingImport = useCallback(() => {
    setPendingImport(null)
  }, [setPendingImport])

  return { handleImportCurrent, handleImportNew, clearPendingImport }
}
