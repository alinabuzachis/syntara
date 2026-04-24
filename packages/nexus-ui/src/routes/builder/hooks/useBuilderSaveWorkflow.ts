import type { WorkflowAPI } from '@ansible/nexus-contracts'
import type { Query, QueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { useWorkflowStore } from '../../../stores/useWorkflowStore'
import type { WorkflowDefinition } from '../../../stores/workflowStoreTypes'
import { getErrorMessage } from '../../../utils/apiErrors'
import { detachPromise } from '../../../utils/detachPromise'
import { validateWorkflow } from '../utils/validation'
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
  isEnabled: boolean
  workflowId: string | null
  isNew: boolean
  /** When creating a workflow, scopes the resource to this project (access control). */
  selectedProject: { id: string } | null
  workflowsListResources: { name: string }[] | undefined
  queryClient: QueryClient
  setLocation: (to: string) => void
  showSuccess: (title: string, description?: string) => void
  showError: (title: string, description?: string) => void
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
  onSaveSuccess: (message: string, workflowIdToNavigate?: string) => Promise<void>
  onSaveError: (error: unknown, action: string) => void
}): void {
  const { createPayload, createWorkflow, onSaveSuccess, onSaveError } = options
  createWorkflow(
    { body: createPayload },
    {
      onSuccess: (data) => {
        detachPromise(onSaveSuccess('Workflow created successfully', data.id))
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
    isEnabled,
    workflowId,
    isNew,
    selectedProject,
    workflowsListResources,
    queryClient,
    setLocation,
    showSuccess,
    showError,
    markClean,
    createWorkflow,
    updateWorkflow,
  } = params

  const getWorkflowDefinition = useCallback(() => {
    const edges = useWorkflowStore.getState().edges
    const activities = currentWorkflow?.workflow.activities ?? []
    const triggers = currentWorkflow?.triggers ?? []

    return buildWorkflowDefinition(workflowName, workflowDescription, activities, triggers, edges)
  }, [currentWorkflow, workflowName, workflowDescription])

  return useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!currentWorkflow) {
        showError('Validation failed', 'No workflow to save')
        resolve(false)
        return
      }

      const edges = useWorkflowStore.getState().edges

      const validationResult = validateWorkflow(currentWorkflow.workflow.activities, edges)

      if (!validationResult.valid) {
        const errorMessages = validationResult.errors.map((error) => error.message).join('\n• ')
        showError('Validation failed', `Workflow validation failed:\n• ${errorMessages}`)
        resolve(false)
        return
      }

      let nameToSave = workflowName
      if (isNew && workflowName === DEFAULT_WORKFLOW_NAME && workflowsListResources) {
        nameToSave = getNextDefaultWorkflowName(workflowsListResources)
      }
      const workflowDef = getWorkflowDefinition()
      workflowDef.name = nameToSave
      const labels = Object.fromEntries(workflowTags.map((t) => [t, '']))
      const createPayload: CreateWorkflowBodyExtended = {
        name: nameToSave,
        description: workflowDescription,
        is_enabled: isEnabled,
        workflow_definition: workflowDef as CreateWorkflowBody['workflow_definition'],
        ...(Object.keys(labels).length > 0 ? { labels } : {}),
        ...(isNew && selectedProject ? { project_id: selectedProject.id } : {}),
      }
      const patchPayload: PatchWorkflowBody = {
        name: nameToSave,
        description: workflowDescription,
        is_enabled: isEnabled,
        labels,
        workflow_definition: workflowDef as PatchWorkflowBody['workflow_definition'],
      }

      const onSaveSuccess = async (successMessage: string, workflowIdToNavigate?: string) => {
        showSuccess('Workflow saved', successMessage)
        markClean()
        await queryClient.invalidateQueries({ predicate: isWorkflowQuery })

        if (workflowIdToNavigate && isNew) {
          setLocation(`/workflow-builder/${workflowIdToNavigate}`)
        }

        resolve(true)
      }

      const onSaveError = (error: unknown, action: string) => {
        const errorMessage = getErrorMessage(error)
        showError(
          `${action.charAt(0).toUpperCase()}${action.slice(1)} failed`,
          `Failed to ${action} workflow: ${errorMessage}`
        )
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
              await onSaveSuccess('Workflow updated successfully', workflowId)
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
    isEnabled,
    getWorkflowDefinition,
    workflowId,
    isNew,
    selectedProject,
    workflowsListResources,
    updateWorkflow,
    createWorkflow,
    showSuccess,
    showError,
    setLocation,
    queryClient,
    markClean,
  ])
}
