import type { ReactFlowInstance } from '@xyflow/react'
import { useCallback, type Dispatch } from 'react'

import { getErrorMessage } from '../../../utils/apiErrors'
import { detachPromise } from '../../../utils/detachPromise'
import type { BuilderAction } from '../builderReducer'

type ShowAlert = (message: string, title?: string) => void

type ExecuteAutomationMutate = (
  variables: { body: { workflow_id: string; input_data?: Record<string, never> } },
  options?: {
    onSuccess?: (data: { id: string }) => void
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

export interface UseBuilderToolbarHandlersOptions {
  workflow: { id: string } | undefined
  workflowName: string
  detailsOpen: boolean
  historyCardOpen: boolean
  reactFlowInstance: ReactFlowInstance
  executionsQuery: { refetch: () => Promise<unknown> }
  dispatch: Dispatch<BuilderAction>
  executeAutomation: ExecuteAutomationMutate
  deleteWorkflow: DeleteWorkflowMutate
  showSuccess: ShowAlert
  showError: ShowAlert
  setLocation: (to: string) => void
}

/**
 * Header toolbar actions: details/history toggles, run, delete automation.
 */
export function useBuilderToolbarHandlers({
  workflow,
  workflowName,
  detailsOpen,
  historyCardOpen,
  reactFlowInstance,
  executionsQuery,
  dispatch,
  executeAutomation,
  deleteWorkflow,
  showSuccess,
  showError,
  setLocation,
}: UseBuilderToolbarHandlersOptions) {
  const handleRunAutomation = useCallback(() => {
    if (!workflow?.id) return

    executeAutomation(
      { body: { workflow_id: workflow.id, input_data: {} } },
      {
        onSuccess: (data) => {
          showSuccess(`Successfully started automation "${workflowName}"`, 'Automation Started')
          dispatch({ type: 'SET_CONFIRM_DIALOG', payload: false })
          setLocation(`/executions/${data.id}?history=open`)
        },
        onError: (error) => {
          showError(`Failed to start automation "${workflowName}": ${getErrorMessage(error)}`, 'Automation Failed')
          dispatch({ type: 'SET_CONFIRM_DIALOG', payload: false })
        },
      }
    )
  }, [workflow, workflowName, executeAutomation, showSuccess, showError, setLocation, dispatch])

  const handleDeleteAutomation = useCallback(() => {
    if (!workflow?.id) return

    deleteWorkflow(
      { params: { path: { workflow_id: workflow.id } } },
      {
        onSuccess: () => {
          showSuccess(`Successfully deleted automation "${workflowName}"`, 'Automation Deleted')
          dispatch({ type: 'SET_DELETE_DIALOG', payload: false })
          setLocation('/automation-builder/new')
        },
        onError: (error) => {
          showError(`Failed to delete automation "${workflowName}": ${getErrorMessage(error)}`, 'Delete Failed')
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

  return { handleRunAutomation, handleDeleteAutomation, handleToggleDetails, handleToggleHistory }
}
