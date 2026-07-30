import { ExecutionStatusEnum } from '@syntara/contracts'
import { describe, expect, it } from 'vitest'

import { isExecutionCancellable } from './executionCancellable'

describe('isExecutionCancellable', () => {
  it.each([ExecutionStatusEnum.PENDING, ExecutionStatusEnum.RUNNING, ExecutionStatusEnum.PAUSED])(
    'returns true for %s',
    (status) => {
      expect(isExecutionCancellable(status)).toBe(true)
    }
  )

  it.each([ExecutionStatusEnum.COMPLETED, ExecutionStatusEnum.CANCELLED, ExecutionStatusEnum.FAILED, null, undefined])(
    'returns false for %s',
    (status) => {
      expect(isExecutionCancellable(status)).toBe(false)
    }
  )
})
