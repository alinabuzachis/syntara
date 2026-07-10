import { ExecutionStatusEnum } from '@ansible/nexus-contracts'
import type { ExecutionStatus } from '@ansible/nexus-contracts'

const RETRYABLE_STATUSES = new Set<ExecutionStatus>([
  ExecutionStatusEnum.COMPLETED,
  ExecutionStatusEnum.COMPLETED_WITH_ERRORS,
  ExecutionStatusEnum.FAILED,
  ExecutionStatusEnum.CANCELLED,
])

export function isExecutionRetryable(status: ExecutionStatus | null | undefined, mode?: string | null): boolean {
  if (!status) return false
  if (mode === 'test') return false
  return RETRYABLE_STATUSES.has(status)
}
