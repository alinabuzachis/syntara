import type { Dispatch, SetStateAction } from 'react'
import { useEffect, useRef } from 'react'

import type { WorkflowDefinition } from '../../../stores/workflowStoreTypes'
import { buildTriggerNodeId } from '../../../utils/triggerNodeIds'
import type { ActivityState } from '../../workflows/execution/types'
import type { EdgeType } from '../utils/workflowToGraph'

import { executionStateEnricher } from './useBuilderFlowGraph'

type UseEdgeExecutionStatusOptions = {
  effectiveExecutionStatus: string | null
  isInitialized: boolean
  currentWorkflow: WorkflowDefinition | null
  activityStates: Map<string, ActivityState>
  setEdges: Dispatch<SetStateAction<EdgeType[]>>
}

export function useEdgeExecutionStatus({
  effectiveExecutionStatus,
  isInitialized,
  currentWorkflow,
  activityStates,
  setEdges,
}: UseEdgeExecutionStatusOptions) {
  const prevExecutionStatusRef = useRef(effectiveExecutionStatus)

  useEffect(() => {
    const prev = prevExecutionStatusRef.current
    prevExecutionStatusRef.current = effectiveExecutionStatus

    // Cleanup: clear edge statuses when execution ends (truthy → null transition).
    if (prev && !effectiveExecutionStatus && isInitialized) {
      setEdges((edges) => {
        if (!edges.some((e) => e.data?.executionStatus != null)) return edges
        return edges.map((e) =>
          e.data?.executionStatus != null ? { ...e, data: { ...e.data, executionStatus: undefined } } : e
        )
      })
      return
    }

    // Enrichment: set edge statuses during active execution.
    if (!effectiveExecutionStatus || !isInitialized) return

    const activities = currentWorkflow?.workflow.activities ?? []
    const triggers = currentWorkflow?.triggers ?? []
    const triggerDisplayToRealId = new Map(triggers.map((t, i) => [buildTriggerNodeId(i), t.id]))

    setEdges((currentEdges) =>
      currentEdges.map((edge) => {
        const edgeExecutionStatus = executionStateEnricher.determineEdgeStatus(
          edge,
          activityStates,
          activities,
          triggerDisplayToRealId
        )

        if (edge.data?.executionStatus !== edgeExecutionStatus) {
          return {
            ...edge,
            data: {
              ...edge.data,
              executionStatus: edgeExecutionStatus,
            },
          }
        }

        return edge
      })
    )
  }, [activityStates, effectiveExecutionStatus, isInitialized, currentWorkflow, setEdges])
}
