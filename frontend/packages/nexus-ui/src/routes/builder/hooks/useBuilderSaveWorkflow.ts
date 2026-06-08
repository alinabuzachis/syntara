import type { WorkflowAPI } from '@ansible/nexus-contracts'
import type { Query, QueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import type { AlertMessage } from '../../../providers/alerts'
import { useWorkflowStore } from '../../../stores/useWorkflowStore'
import type { WorkflowDefinition } from '../../../stores/workflowStoreTypes'
import { getErrorMessage } from '../../../utils/apiErrors'
import { detachPromise } from '../../../utils/detachPromise'
import { buildWorkflowDefinition } from '../utils/workflowDefinitionBuilder'
import { DEFAULT_WORKFLOW_NAME, getNextDefaultWorkflowName } from '../utils/workflowNaming'

type CreateWorkflowBody = WorkflowAPI.paths['/workflows']['post']['requestBody']['content']['application/json']
/**
 * Create payload extensions the backend accepts; OpenAPI `CreateWorkflowRequest` may omit fields.
 * Keep create as one round-trip (labels + project) — avoid POST-then-PATCH partial failure.
 */
type CreateWorkflowBodyExtended = CreateWorkflowBody & {
  project_id?: string
  labels?: Record<string, string>
}
type PatchWorkflowBody =
  WorkflowAPI.paths['/workflows/{workflow_id}']['patch']['requestBody']['content']['application/json']

function isWorkflowQuery(query: Query): boolean {
  return (
    query.queryKey[0] === 'get' && typeof query.queryKey[1] === 'string' && query.queryKey[1].startsWith('/workflows')
  )
}

export type UseBuilderSaveWorkflowParams = {
  currentWorkflow: WorkflowDefinition | null
  workflowName: string
  workflowDescription: string
  workflowTags: string[]
  workflowId: string | null
  isNew: boolean
  /** When creating a workflow, scopes the resource to this project (access control). */
  selectedProject: { id: string } | null
  workflowsListResources: { name: string }[] | undefined
  queryClient: QueryClient
  setLocation: (to: string) => void
  showSuccess: (options: AlertMessage) => void
  showError: (options: AlertMessage) => void
  /** Called when saving on create path without a project (UI can highlight the project selector). */
  onMissingProjectForCreate?: () => void
  markClean: () => void
  createWorkflow: (
    args: { body: CreateWorkflowBodyExtended },
    opts?: {
      onSuccess?: (data: { id?: string }) => void | Promise<void>
      onError?: (error: unknown) => void
    }
  ) => void
  updateWorkflow: (
    args: {
      params: { path: { workflow_id: string } }
      body: PatchWorkflowBody
    },
    opts?: {
      onSuccess?: () => void | Promise<void>
      onError?: (error: unknown) => void
    }
  ) => void
}

function runCreateWorkflowSave(options: {
  createPayload: CreateWorkflowBodyExtended
  createWorkflow: UseBuilderSaveWorkflowParams['createWorkflow']
  onSaveSuccess: (workflowIdToNavigate?: string) => Promise<void>
  onSaveError: (error: unknown, action: string) => void
}): void {
  const { createPayload, createWorkflow, onSaveSuccess, onSaveError } = options
  createWorkflow(
    { body: createPayload },
    {
      onSuccess: (data) => {
        detachPromise(onSaveSuccess(data.id))
      },
      onError: (error) => onSaveError(error, 'create'),
    }
  )
}

export function useBuilderSaveWorkflow(params: UseBuilderSaveWorkflowParams): () => Promise<boolean> {
  const {
    currentWorkflow,
    workflowName,
    workflowDescription,
    workflowTags,
    workflowId,
    isNew,
    selectedProject,
    workflowsListResources,
    queryClient,
    setLocation,
    showSuccess,
    showError,
    onMissingProjectForCreate,
    markClean,
    createWorkflow,
    updateWorkflow,
  } = params

  const getWorkflowDefinition = useCallback(() => {
    const { edges, nodePositions, _positionsUserModified } = useWorkflowStore.getState()
    const activities = currentWorkflow?.workflow.activities ?? []
    const triggers = currentWorkflow?.triggers ?? []

    return buildWorkflowDefinition(workflowName, workflowDescription, activities, triggers, {
      edges,
      nodePositions: _positionsUserModified ? nodePositions : {},
    })
  }, [currentWorkflow, workflowName, workflowDescription])

  return useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!currentWorkflow) {
        showError({ title: 'Save failed', description: 'No workflow to save' })
        resolve(false)
        return
      }

      // Create path (POST): require a project. Update path (PATCH) does not use project_id here.
      const willPatchExisting = Boolean(workflowId && !isNew)
      if (!willPatchExisting && !selectedProject?.id) {
        showError({ title: 'Project required', description: 'Select a project to save this workflow.' })
        onMissingProjectForCreate?.()
        resolve(false)
        return
      }

      let nameToSave = workflowName
      if (isNew && workflowName === DEFAULT_WORKFLOW_NAME && workflowsListResources) {
        nameToSave = getNextDefaultWorkflowName(workflowsListResources)
      }

      let workflowDef
      try {
        workflowDef = getWorkflowDefinition()
      } catch (error) {
        const errorMessage = getErrorMessage(error)
        showError({
          title: 'Build failed',
          description: `Failed to build workflow definition. Check condition/loop expressions for syntax errors: ${errorMessage}`,
        })
        resolve(false)
        return
      }

      workflowDef.name = nameToSave
      const labels = Object.fromEntries(workflowTags.map((t) => [t, '']))
      const createPayload: CreateWorkflowBodyExtended = {
        name: nameToSave,
        description: workflowDescription,
        workflow_definition: workflowDef as CreateWorkflowBody['workflow_definition'],
        ...(Object.keys(labels).length > 0 ? { labels } : {}),
        ...(isNew && selectedProject ? { project_id: selectedProject.id } : {}),
      }
      const patchPayload: PatchWorkflowBody = {
        name: nameToSave,
        description: workflowDescription,
        labels,
        workflow_definition: workflowDef as PatchWorkflowBody['workflow_definition'],
      }

      const onSaveSuccess = async (workflowIdToNavigate?: string) => {
        if (isNew) {
          showSuccess({ title: 'Workflow created', description: `${nameToSave} has been saved.` })
        }
        markClean()
        await queryClient.invalidateQueries({ predicate: isWorkflowQuery })

        if (workflowIdToNavigate && isNew) {
          setLocation(`/workflow-builder/${workflowIdToNavigate}`)
        }

        resolve(true)
      }

      const onSaveError = (error: unknown, errorAction: string) => {
        const errorMessage = getErrorMessage(error)
        showError({
          title: `${errorAction.charAt(0).toUpperCase()}${errorAction.slice(1)} failed`,
          description: `Failed to ${errorAction} workflow: ${errorMessage}`,
        })
        resolve(false)
      }

      if (workflowId && !isNew) {
        updateWorkflow(
          {
            params: { path: { workflow_id: workflowId } },
            body: patchPayload,
          },
          {
            onSuccess: async () => {
              await onSaveSuccess(workflowId)
            },
            onError: (error) => onSaveError(error, 'update'),
          }
        )
      } else {
        runCreateWorkflowSave({
          createPayload,
          createWorkflow,
          onSaveSuccess,
          onSaveError,
        })
      }
    })
  }, [
    currentWorkflow,
    workflowName,
    workflowDescription,
    workflowTags,
    getWorkflowDefinition,
    workflowId,
    isNew,
    selectedProject,
    workflowsListResources,
    updateWorkflow,
    createWorkflow,
    showSuccess,
    showError,
    onMissingProjectForCreate,
    setLocation,
    queryClient,
    markClean,
  ])
}
