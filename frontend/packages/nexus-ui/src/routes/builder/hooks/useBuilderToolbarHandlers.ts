import { ActivityTypeEnum } from '@ansible/nexus-contracts'
import type { ReactFlowInstance } from '@xyflow/react'
import { useCallback, type Dispatch } from 'react'

import type { AlertMessage } from '../../../providers/alerts'
import { useWorkflowStore } from '../../../stores/useWorkflowStore'
import type { WorkflowDefinition } from '../../../stores/workflowStoreTypes'
import { getErrorMessage } from '../../../utils/apiErrors'
import { detachPromise } from '../../../utils/detachPromise'
import type { BuilderAction } from '../builderReducer'
import { DEFAULT_MAX_WAIT_SECONDS, fetchMaxWaitDuration } from '../node-forms/useMaxWaitDuration'
import { validateWorkflow } from '../utils/validation'
import { validateMinimumWorkflow } from '../utils/validation/rules/validateMinimumWorkflow'

type ShowAlert = (options: AlertMessage) => void

type ExecuteWorkflowMutate = (
  variables: { body: { workflow_id: string; input_data?: Record<string, unknown>; trigger_node_id?: string | null } },
  options?: {
    onSuccess?: (data: { id?: string }) => void
    onError?: (error: unknown) => void
  }
) => void

type DeleteWorkflowMutate = (
  variables: { params: { path: { workflow_id: string } } },
  options?: {
    onSuccess?: () => void
    onError?: (error: unknown) => void
  }
) => void

export type UseBuilderToolbarHandlersOptions = {
  workflow: { id?: string } | undefined
  workflowName: string
  detailsOpen: boolean
  historyCardOpen: boolean
  reactFlowInstance: ReactFlowInstance
  executionsQuery: { refetch: () => Promise<unknown> }
  dispatch: Dispatch<BuilderAction>
  executeWorkflow: ExecuteWorkflowMutate
  deleteWorkflow: DeleteWorkflowMutate
  showSuccess: ShowAlert
  showError: ShowAlert
  setLocation: (to: string) => void
  handleSaveWorkflow: () => Promise<boolean>
  currentWorkflow: WorkflowDefinition | null
}

/**
 * Header toolbar actions: details/history toggles, run, delete workflow.
 */
export function useBuilderToolbarHandlers({
  workflow,
  workflowName,
  detailsOpen,
  historyCardOpen,
  reactFlowInstance,
  executionsQuery,
  dispatch,
  executeWorkflow,
  deleteWorkflow,
  showSuccess,
  showError,
  setLocation,
  handleSaveWorkflow,
  currentWorkflow,
}: UseBuilderToolbarHandlersOptions) {
  const handleRunWorkflow = useCallback(
    async (inputData?: Record<string, unknown>, triggerNodeId?: string) => {
      if (!workflow?.id) return

      // Save workflow first if there are unsaved changes (always save, even if validation fails)
      const isDirty = useWorkflowStore.getState().isDirty
      if (isDirty) {
        try {
          const saved = await handleSaveWorkflow()
          if (!saved) {
            // Save failed, close dialog and don't proceed with run
            dispatch({ type: 'SET_CONFIRM_DIALOG', payload: false })
            return
          }
        } catch {
          // Save threw an error, close dialog and abort run
          dispatch({ type: 'SET_CONFIRM_DIALOG', payload: false })
          return
        }
      }

      // Validate workflow has minimum requirements to run (after save)
      if (!currentWorkflow) {
        showError({ title: 'Cannot run workflow', description: 'No workflow data available' })
        dispatch({ type: 'SET_CONFIRM_DIALOG', payload: false })
        return
      }

      const edges = useWorkflowStore.getState().edges
      const activities = currentWorkflow.workflow.activities
      const triggers = currentWorkflow.triggers

      // Check minimum workflow requirements (trigger + node + connection)
      const minimumValidation = validateMinimumWorkflow(activities, edges, triggers)
      if (minimumValidation.length > 0) {
        const errorMessages = minimumValidation.map((error) => error.message).join('\n• ')
        showError({ title: 'Cannot run workflow', description: `${errorMessages}` })
        dispatch({ type: 'SET_CONFIRM_DIALOG', payload: false })
        return
      }

      // Check all other validation rules (dangling nodes, invalid connections, etc.)
      const validationResult = validateWorkflow(activities, edges)
      if (!validationResult.valid) {
        const errorMessages = validationResult.errors.map((error) => error.message).join('\n• ')
        showError({ title: 'Cannot run workflow', description: `Workflow validation failed:\n• ${errorMessages}` })
        dispatch({ type: 'SET_CONFIRM_DIALOG', payload: false })
        return
      }

      const waitErrors = await validateWaitNodeDurations(activities)
      if (waitErrors.length > 0) {
        showError({ title: 'Cannot run workflow', description: waitErrors.join('\n• ') })
        dispatch({ type: 'SET_CONFIRM_DIALOG', payload: false })
        return
      }

      executeWorkflow(
        {
          body: {
            workflow_id: workflow.id,
            input_data: inputData ?? {},
            ...(triggerNodeId && { trigger_node_id: triggerNodeId }),
          },
        },
        {
          onSuccess: (data) => {
            dispatch({ type: 'SET_CONFIRM_DIALOG', payload: false })
            if (data.id) {
              setLocation(`/executions/${data.id}?history=closed`)
            }
          },
          onError: (error) => {
            showError({
              title: 'Workflow failed',
              description: `Failed to start workflow "${workflowName}": ${getErrorMessage(error)}`,
            })
            dispatch({ type: 'SET_CONFIRM_DIALOG', payload: false })
          },
        }
      )
    },
    [workflow, workflowName, executeWorkflow, handleSaveWorkflow, showError, dispatch, currentWorkflow, setLocation]
  )

  const handleDeleteWorkflow = useCallback(() => {
    if (!workflow?.id) return

    deleteWorkflow(
      { params: { path: { workflow_id: workflow.id } } },
      {
        onSuccess: () => {
          showSuccess({ title: 'Workflow deleted', description: `Successfully deleted workflow "${workflowName}"` })
          dispatch({ type: 'SET_DELETE_DIALOG', payload: false })
          setLocation('/workflows')
        },
        onError: (error) => {
          showError({
            title: 'Delete failed',
            description: `Failed to delete workflow "${workflowName}": ${getErrorMessage(error)}`,
          })
          dispatch({ type: 'SET_DELETE_DIALOG', payload: false })
        },
      }
    )
  }, [workflow, workflowName, deleteWorkflow, showSuccess, showError, setLocation, dispatch])

  const handleToggleDetails = useCallback(() => {
    dispatch({ type: 'TOGGLE_DETAILS' })
    if (!detailsOpen) {
      reactFlowInstance.setNodes((nodes) => nodes.map((node) => ({ ...node, selected: false })))
    }
  }, [reactFlowInstance, detailsOpen, dispatch])

  const handleToggleHistory = useCallback(() => {
    dispatch({ type: 'TOGGLE_HISTORY' })
    if (!historyCardOpen) {
      detachPromise(executionsQuery.refetch())
    }
  }, [historyCardOpen, executionsQuery, dispatch])

  return { handleRunWorkflow, handleDeleteWorkflow, handleToggleDetails, handleToggleHistory }
}

async function validateWaitNodeDurations(activities: WorkflowDefinition['workflow']['activities']): Promise<string[]> {
  const waitNodes = activities.filter((a) => a.type === ActivityTypeEnum.WAIT)
  if (waitNodes.length === 0) return []

  const maxWaitSeconds = await fetchMaxWaitDuration().catch(() => DEFAULT_MAX_WAIT_SECONDS)
  const errors: string[] = []

  for (const node of waitNodes) {
    const total = (node.parameters as { duration?: number } | undefined)?.duration ?? 0
    if (total > maxWaitSeconds) {
      errors.push(
        `Wait step "${node.name || 'Untitled'}" duration (${total}s) exceeds maximum allowed (${maxWaitSeconds}s)`
      )
    }
  }

  return errors
}
