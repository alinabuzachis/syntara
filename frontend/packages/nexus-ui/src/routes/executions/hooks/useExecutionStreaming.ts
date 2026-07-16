import type { ExecutionsAPI } from '@ansible/nexus-contracts'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { detachPromise } from '../../../utils/detachPromise'
import { useExecutionWebSocket } from '../../workflows/hooks/useExecutionWebSocket'
import { useExecutionStore } from '../../workflows/stores/useExecutionStore'

type Execution = ExecutionsAPI.components['schemas']['ExecutionRead']
type ActivityData = ExecutionsAPI.components['schemas']['ActivityData']
type ActivityExecution = ExecutionsAPI.components['schemas']['ActivityExecution']

type WorkflowDefinitionLike = {
  nodes?: Array<{ id: string; name?: string }>
  workflow?: { activities?: Array<{ id: string; name?: string }> }
}

export function useExecutionStreaming(executionId: string | undefined, execution: Execution | undefined) {
  const queryClient = useQueryClient()
  const shouldStream =
    execution?.status === 'running' || execution?.status === 'pending' || execution?.status === 'paused'
  useExecutionWebSocket(executionId ?? '', {
    enabled: shouldStream && !!executionId,
    onExecutionComplete: () => {
      detachPromise(
        Promise.all([
          queryClient.invalidateQueries({
            queryKey: ['get', '/executions/{execution_id}'],
          }),
          queryClient.invalidateQueries({
            queryKey: ['get', '/executions'],
          }),
        ])
      )
    },
  })
}

export function useSyncActivityStore(
  execution: Execution | undefined,
  activities: (ActivityData | ActivityExecution)[]
) {
  const { setActivityExecutions } = useExecutionStore.getState()
  useEffect(() => {
    if (activities.length > 0) {
      setActivityExecutions(activities)
    } else if (execution?.status === 'pending' || execution?.status === 'running' || execution?.status === 'paused') {
      const { activityStates } = useExecutionStore.getState()
      if (activityStates.size === 0) {
        const wfDef = execution?.workflow_definition as unknown as WorkflowDefinitionLike | undefined
        const workflowActivities = wfDef?.nodes ?? wfDef?.workflow?.activities
        if (workflowActivities) {
          const pendingActivities = workflowActivities.map((activity) => ({
            id: activity.id,
            created_at: '',
            updated_at: '',
            execution_id: execution.id,
            activity_name: activity.name ?? activity.id,
            temporal_activity_id: '',
            status: 'pending' as const,
            error_details: null,
            started_at: null,
            completed_at: null,
          })) as ActivityExecution[]
          setActivityExecutions(pendingActivities)
        }
      }
    } else {
      setActivityExecutions([])
    }
  }, [activities, execution?.id, execution?.status, execution?.workflow_definition, setActivityExecutions])
}
