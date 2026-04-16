import type { Execution } from '@ansible/nexus-contracts'
import { useEffect, useMemo, type Dispatch } from 'react'

import type { BuilderAction } from '../builderReducer'

interface ExecutionListQueryLike {
  data?: { resources?: Array<{ id: string }> } | null
}

interface ExecutionDetailQueryLike {
  data?: Execution
}

interface WorkflowDefinitionLike {
  metadata?: { name?: string; description?: string }
  workflow?: { activities?: Array<{ id: string }> }
  triggers?: unknown[]
}

/**
 * Execution list + selected-run detail for builder canvas (history panel, execution view).
 */
export function useBuilderExecutionCanvasState(
  historyCardOpen: boolean,
  selectedExecutionId: string | null,
  executionsQuery: ExecutionListQueryLike,
  selectedExecutionQuery: ExecutionDetailQueryLike,
  dispatch: Dispatch<BuilderAction>
) {
  const executions = useMemo(() => executionsQuery.data?.resources ?? [], [executionsQuery.data?.resources])

  useEffect(() => {
    if (historyCardOpen && !selectedExecutionId && executions.length > 0) {
      dispatch({ type: 'SET_SELECTED_EXECUTION_ID', payload: executions[0].id })
    }
  }, [historyCardOpen, selectedExecutionId, executions, dispatch])

  const selectedExecution = selectedExecutionQuery.data
  const executionWorkflow = useMemo(() => {
    if (!selectedExecution?.workflow_definition || !selectedExecution.workflow_id) return undefined
    const wfDef = selectedExecution.workflow_definition as unknown as WorkflowDefinitionLike
    return {
      id: selectedExecution.workflow_id,
      name: wfDef.metadata?.name ?? 'Workflow',
      version: { workflow_definition: selectedExecution.workflow_definition },
    }
  }, [selectedExecution])

  const executionActivities = useMemo(() => selectedExecution?.activities ?? [], [selectedExecution])

  const isViewingExecution = !!selectedExecutionId

  return { executions, selectedExecution, executionWorkflow, executionActivities, isViewingExecution }
}