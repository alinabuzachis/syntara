import type { ReactFlowInstance } from '@xyflow/react'
import { useCallback, type Dispatch } from 'react'

import type { AlertMessage } from '../../../components/alerts'
import { getErrorMessage } from '../../../utils/apiErrors'
import { detachPromise } from '../../../utils/detachPromise'
import type { BuilderAction } from '../builderReducer'

type ShowAlert = (options: AlertMessage) => void

type ExecuteWorkflowMutate = (
  variables: { body: { workflow_id: string; input_data?: Record<string, never> } },
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
}: UseBuilderToolbarHandlersOptions) {
  const handleRunWorkflow = useCallback(() => {
    if (!workflow?.id) return

    executeWorkflow(
      { body: { workflow_id: workflow.id, input_data: {} } },
      {
        onSuccess: (data) => {
          showSuccess({ title: 'Workflow started', description: `Successfully started workflow "${workflowName}"` })
          dispatch({ type: 'SET_CONFIRM_DIALOG', payload: false })
          setLocation(`/executions/${data.id!}?history=open`)
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
  }, [workflow, workflowName, executeWorkflow, showSuccess, showError, setLocation, dispatch])

  const handleDeleteWorkflow = useCallback(() => {
    if (!workflow?.id) return

    deleteWorkflow(
      { params: { path: { workflow_id: workflow.id } } },
      {
        onSuccess: () => {
          showSuccess({ title: 'Workflow deleted', description: `Successfully deleted workflow "${workflowName}"` })
          dispatch({ type: 'SET_DELETE_DIALOG', payload: false })
          setLocation('/workflow-builder/new')
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
