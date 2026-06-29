import type { WorkflowAPI } from '@ansible/nexus-contracts'
import type { Query, QueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import type { AlertMessage } from '../../../providers/alerts'
import { useWorkflowStore } from '../../../stores/useWorkflowStore'
import type { WorkflowDefinition } from '../../../stores/workflowStoreTypes'
import { getErrorMessage, isRetryableValidationError } from '../../../utils/apiErrors'
import { forceCreateWorkflow, forceUpdateWorkflow } from '../../../utils/workflowForceSave'
import { buildWorkflowDefinition } from '../utils/workflowDefinitionBuilder'
import { DEFAULT_WORKFLOW_NAME, getNextDefaultWorkflowName } from '../utils/workflowNaming'

type CreateWorkflowBody = WorkflowAPI.paths['/workflows']['post']['requestBody']['content']['application/json']
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
  /** Called after a successful force_save. Receives the original validation error so the caller can extract and display node-level findings. */
  onForceSaveSuccess?: (originalError: unknown) => void
  markClean: () => void
  createWorkflow: (
    args: { body: CreateWorkflowBody },
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

function promisifyCreate(
  createWorkflow: UseBuilderSaveWorkflowParams['createWorkflow'],
  payload: CreateWorkflowBody
): Promise<{ data?: { id?: string }; error?: unknown }> {
  return new Promise((resolve) => {
    createWorkflow(
      { body: payload },
      {
        onSuccess: (data) => resolve({ data }),
        onError: (error) => resolve({ error }),
      }
    )
  })
}

function promisifyUpdate(
  updateWorkflow: UseBuilderSaveWorkflowParams['updateWorkflow'],
  workflowId: string,
  payload: PatchWorkflowBody
): Promise<{ error?: unknown }> {
  return new Promise((resolve) => {
    updateWorkflow(
      { params: { path: { workflow_id: workflowId } }, body: payload },
      {
        onSuccess: () => resolve({}),
        onError: (error) => resolve({ error }),
      }
    )
  })
}

async function handleForceSaveRetry(options: {
  willPatchExisting: boolean
  workflowId: string | null
  patchPayload: PatchWorkflowBody
  createPayload: CreateWorkflowBody
}): Promise<{ success: boolean; createdId?: string; retryError?: unknown }> {
  try {
    if (options.willPatchExisting && options.workflowId) {
      const { error } = await forceUpdateWorkflow(options.workflowId, options.patchPayload)
      if (error) return { success: false, retryError: error }
      return { success: true }
    }
    const { data, error } = await forceCreateWorkflow(options.createPayload)
    if (error) return { success: false, retryError: error }
    return { success: true, createdId: data?.id }
  } catch (err: unknown) {
    return { success: false, retryError: err }
  }
}

async function completeSave(
  queryClient: QueryClient,
  markClean: () => void,
  navigateToId: string | undefined,
  setLocation: (to: string) => void
): Promise<void> {
  markClean()
  await queryClient.invalidateQueries({ predicate: isWorkflowQuery })
  if (navigateToId) {
    setLocation(`/workflow-builder/${navigateToId}`)
  }
}

async function processSaveResult(
  saveResult: { data?: { id?: string }; error?: unknown },
  ctx: {
    willPatchExisting: boolean
    workflowId: string | null
    isNew: boolean
    nameToSave: string
    createPayload: CreateWorkflowBody
    patchPayload: PatchWorkflowBody
    showError: (options: AlertMessage) => void
    showSuccess: (options: AlertMessage) => void
    markClean: () => void
    queryClient: QueryClient
    setLocation: (to: string) => void
    onForceSaveSuccess?: (originalError: unknown) => void
  }
): Promise<boolean> {
  if (saveResult.error && isRetryableValidationError(saveResult.error)) {
    const retry = await handleForceSaveRetry({
      willPatchExisting: ctx.willPatchExisting,
      workflowId: ctx.workflowId,
      patchPayload: ctx.patchPayload,
      createPayload: ctx.createPayload,
    })
    if (!retry.success) {
      ctx.showError({ title: 'Save failed', description: getErrorMessage(retry.retryError) })
      return false
    }
    await completeSave(ctx.queryClient, ctx.markClean, ctx.isNew ? retry.createdId : undefined, ctx.setLocation)
    ctx.showSuccess({
      title: ctx.isNew ? 'Workflow created with warnings' : 'Workflow saved with warnings',
      description: `${ctx.nameToSave} has been saved (has validation warnings).`,
    })
    ctx.onForceSaveSuccess?.(saveResult.error)
    return true
  }

  if (saveResult.error) {
    const action = ctx.willPatchExisting ? 'update' : 'create'
    ctx.showError({
      title: `${action.charAt(0).toUpperCase()}${action.slice(1)} failed`,
      description: `Failed to ${action} workflow: ${getErrorMessage(saveResult.error)}`,
    })
    return false
  }

  if (ctx.isNew) {
    ctx.showSuccess({ title: 'Workflow created', description: `${ctx.nameToSave} has been saved.` })
  }
  await completeSave(ctx.queryClient, ctx.markClean, ctx.isNew ? saveResult.data?.id : undefined, ctx.setLocation)
  return true
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
    onForceSaveSuccess,
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

  return useCallback(async (): Promise<boolean> => {
    if (!currentWorkflow) {
      showError({ title: 'Save failed', description: 'No workflow to save' })
      return false
    }

    const willPatchExisting = Boolean(workflowId && !isNew)
    if (!willPatchExisting && !selectedProject?.id) {
      showError({ title: 'Project required', description: 'Select a project to save this workflow.' })
      onMissingProjectForCreate?.()
      return false
    }

    let nameToSave = workflowName
    if (isNew && workflowName === DEFAULT_WORKFLOW_NAME && workflowsListResources) {
      nameToSave = getNextDefaultWorkflowName(workflowsListResources)
    }

    let workflowDef
    try {
      workflowDef = getWorkflowDefinition()
    } catch (error) {
      showError({
        title: 'Build failed',
        description: `Failed to build workflow definition. Check condition/loop expressions for syntax errors: ${getErrorMessage(error)}`,
      })
      return false
    }

    workflowDef.name = nameToSave
    const labels = Object.fromEntries(workflowTags.map((t) => [t, '']))
    const createPayload: CreateWorkflowBody = {
      name: nameToSave,
      description: workflowDescription,
      workflow_definition: workflowDef as unknown as CreateWorkflowBody['workflow_definition'],
      project_id: selectedProject!.id,
      ...(Object.keys(labels).length > 0 && { labels }),
    }
    const patchPayload: PatchWorkflowBody = {
      name: nameToSave,
      description: workflowDescription,
      labels,
      workflow_definition: workflowDef as unknown as PatchWorkflowBody['workflow_definition'],
    }

    const saveResult = willPatchExisting
      ? await promisifyUpdate(updateWorkflow, workflowId!, patchPayload)
      : await promisifyCreate(createWorkflow, createPayload)

    return processSaveResult(saveResult, {
      willPatchExisting,
      workflowId,
      isNew,
      nameToSave,
      createPayload,
      patchPayload,
      showError,
      showSuccess,
      markClean,
      queryClient,
      setLocation,
      onForceSaveSuccess,
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
    onForceSaveSuccess,
    setLocation,
    queryClient,
    markClean,
  ])
}
