import { ExecutionStatusEnum } from '@syntara/contracts'

/**
 * Poll execution query every 3s while status is pending or running.
 * Paused executions rely on WebSocket for approval state updates —
 * polling during paused would overwhelm the API when multiple
 * approval tests run in parallel (3 CI workers × 3s interval).
 */
export function executionRefetchInterval(query: { state: { data?: { status?: string } } }): number | false {
  const status = query.state.data?.status
  if (!status || status === ExecutionStatusEnum.PENDING || status === ExecutionStatusEnum.RUNNING) {
    return 3000
  }
  return false
}
