import { ACTIVITY_STATUS } from '../../../../builder/utils/executionState/executionHelpers'
import { useExecutionStore } from '../../../stores/useExecutionStore'

export function useLoopIterationCount(nodeId: string): number | null {
  return useExecutionStore((state) => {
    const activity = state.activityStates.get(nodeId)
    if (!activity?.outputData) return null

    const iterationCount = activity.outputData.iteration_count
    if (typeof iterationCount !== 'number') return null

    if (activity.status === ACTIVITY_STATUS.SKIPPED) return null
    if (activity.status === ACTIVITY_STATUS.COMPLETED) return iterationCount
    return iterationCount + 1
  })
}
