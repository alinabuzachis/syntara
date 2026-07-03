import type { WorkflowAPI } from '@ansible/nexus-contracts'
import type { Query, QueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import type { AlertMessage } from '../../../providers/alerts'
import { useWorkflowStore } from '../../../stores/useWorkflowStore'
import type { WorkflowDefinition } from '../../../stores/workflowStoreTypes'
import {
  extractVersionConflictInfo,
  getErrorMessage,
  isRetryableValidationError,
  isWorkflowVersionConflictError,
} from '../../../utils/apiErrors'
import { forceCreateWorkflow, forceUpdateWorkflow } from '../../../utils/workflowForceSave'
import { buildWorkflowDefinition } from '../utils/workflowDefinitionBuilder'
import { DEFAULT_WORKFLOW_NAME, getNextDefaultWorkflowName } from '../utils/workflowNaming'
import type { ConflictInfo } from '../VersionConflictDialog'

function buildSavePayloads(opts: {
  nameToSave: string
  workflowDescription: string
  workflowDef: Record<string, unknown>
  selectedProjectId: string
  expectedVersion: number | null | undefined
}) {
  const { nameToSave, workflowDescription, workflowDef, selectedProjectId, expectedVersion } = opts
  const createPayload: CreateWorkflowBodyExtended = {
    name: nameToSave,
    description: workflowDescription,
    workflow_definition: workflowDef as unknown as CreateWorkflowBody['workflow_definition'],
    project_id: selectedProjectId,
  }
  const patchPayload: PatchWorkflowBody = {
    name: nameToSave,
    description: workflowDescription,
    workflow_definition: workflowDef as unknown as PatchWorkflowBody['workflow_definition'],
    ...(expectedVersion != null ? { expected_version: expectedVersion } : {}),
  }
  return { createPayload, patchPayload }
}

type CreateWorkflowBody = WorkflowAPI.paths['/workflows']['post']['requestBody']['content']['application/json']
/**
 * Create payload extensions the backend accepts; OpenAPI `CreateWorkflowRequest` may omit fields.
 * Keep create as one round-trip (labels + project) — avoid POST-then-PATCH partial failure.
 */
type CreateWorkflowBodyExtended = CreateWorkflowBody & {
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
  expectedVersion: number | null
  onConflict?: (info: ConflictInfo) => void
  onVersionUpdated?: (newVersion: number) => void
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
      onSuccess?: (data: unknown) => void | Promise<void>
      onError?: (error: unknown) => void
    }
  ) => void
}

function promisifyCreate(
  createWorkflow: UseBuilderSaveWorkflowParams['createWorkflow'],
  payload: CreateWorkflowBodyExtended
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
): Promise<{ data?: { id?: string }; error?: unknown }> {
  return new Promise((resolve) => {
    updateWorkflow(
      { params: { path: { workflow_id: workflowId } }, body: payload },
      {
        onSuccess: (data) => resolve({ data: data as { id?: string } }),
        onError: (error) => resolve({ error }),
      }
    )
  })
}

async function handleForceSaveRetry(options: {
  willPatchExisting: boolean
  workflowId: string | null
  patchPayload: PatchWorkflowBody
  createPayload: CreateWorkflowBodyExtended
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
    createPayload: CreateWorkflowBodyExtended
    patchPayload: PatchWorkflowBody
    showError: (options: AlertMessage) => void
    showSuccess: (options: AlertMessage) => void
    markClean: () => void
    queryClient: QueryClient
    setLocation: (to: string) => void
    onForceSaveSuccess?: (originalError: unknown) => void
    onVersionUpdated?: (newVersion: number) => void
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
  const newVersion = (saveResult as { data?: { current_version?: number } }).data?.current_version
  if (ctx.willPatchExisting && newVersion != null) ctx.onVersionUpdated?.(newVersion)
  return true
}

export function useBuilderSaveWorkflow(
  params: UseBuilderSaveWorkflowParams
): (options?: { expectedVersionOverride?: number }) => Promise<boolean> {
  const {
    currentWorkflow,
    workflowName,
    workflowDescription,
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
    expectedVersion,
    onConflict,
    onVersionUpdated,
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

  return useCallback(
    async (options?: { expectedVersionOverride?: number }): Promise<boolean> => {
      const effectiveExpectedVersion = options?.expectedVersionOverride ?? expectedVersion
      const willPatchExisting = Boolean(workflowId && !isNew)
      if (!currentWorkflow) {
        showError({ title: 'Save failed', description: 'No workflow to save' })
        return false
      }
      if (!willPatchExisting && !selectedProject?.id) {
        showError({ title: 'Project required', description: 'Select a project to save this workflow.' })
        if (onMissingProjectForCreate) onMissingProjectForCreate()
        return false
      }

      const nameToSave =
        isNew && workflowName === DEFAULT_WORKFLOW_NAME && workflowsListResources
          ? getNextDefaultWorkflowName(workflowsListResources)
          : workflowName

      const workflowDef = getWorkflowDefinition()
      workflowDef.name = nameToSave
      const { createPayload, patchPayload } = buildSavePayloads({
        nameToSave,
        workflowDescription,
        workflowDef,
        selectedProjectId: selectedProject!.id,
        expectedVersion: effectiveExpectedVersion,
      })

      const saveResult = willPatchExisting
        ? await promisifyUpdate(updateWorkflow, workflowId!, patchPayload)
        : await promisifyCreate(createWorkflow, createPayload)

      // Check for version conflict before attempting force-save retry
      if (saveResult.error && isWorkflowVersionConflictError(saveResult.error) && onConflict) {
        onConflict(extractVersionConflictInfo(saveResult.error))
        return false
      }

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
        onVersionUpdated,
      })
    },
    [
      currentWorkflow,
      workflowName,
      workflowDescription,
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
      expectedVersion,
      onConflict,
      onVersionUpdated,
      setLocation,
      queryClient,
      markClean,
    ]
  )
}
