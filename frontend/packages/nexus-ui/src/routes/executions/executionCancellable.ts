import { ExecutionStatusEnum } from '@ansible/nexus-contracts'
import type { ExecutionStatus } from '@ansible/nexus-contracts'

export function isExecutionCancellable(status: ExecutionStatus | null | undefined): boolean {
  return (
    status === ExecutionStatusEnum.PENDING ||
    status === ExecutionStatusEnum.RUNNING ||
    status === ExecutionStatusEnum.PAUSED
  )
}
