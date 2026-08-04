import { ExecutionStatusEnum } from '@syntara/contracts'
import type { ExecutionStatus } from '@syntara/contracts'

export function isExecutionCancellable(status: ExecutionStatus | null | undefined): boolean {
  return (
    status === ExecutionStatusEnum.PENDING ||
    status === ExecutionStatusEnum.RUNNING ||
    status === ExecutionStatusEnum.PAUSED
  )
}
