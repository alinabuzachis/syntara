import { describe, expect, it, vi } from 'vitest'

import { assignNewThenDeleteOldWithRollback } from './editAssignmentMutations'

describe('assignNewThenDeleteOldWithRollback', () => {
  it('assigns then deletes when both succeed', async () => {
    const assignNew = vi.fn().mockResolvedValue({ id: 'new-1' })
    const deleteOld = vi.fn().mockResolvedValue(undefined)
    const revokeNew = vi.fn().mockResolvedValue(undefined)

    await assignNewThenDeleteOldWithRollback({ assignNew, deleteOld, revokeNew })

    expect(assignNew).toHaveBeenCalledOnce()
    expect(deleteOld).toHaveBeenCalledOnce()
    expect(revokeNew).not.toHaveBeenCalled()
  })

  it('throws when assign response has no assignment id', async () => {
    const assignNew = vi.fn().mockResolvedValue({})
    const deleteOld = vi.fn()
    const revokeNew = vi.fn()

    await expect(assignNewThenDeleteOldWithRollback({ assignNew, deleteOld, revokeNew })).rejects.toThrow(
      /did not include an assignment id/
    )
    expect(deleteOld).not.toHaveBeenCalled()
  })

  it('revokes new assignment and rethrows delete error when delete fails then revoke succeeds', async () => {
    const assignNew = vi.fn().mockResolvedValue({ id: 'new-1' })
    const deleteOld = vi.fn().mockRejectedValue(new Error('delete failed'))
    const revokeNew = vi.fn().mockResolvedValue(undefined)

    await expect(assignNewThenDeleteOldWithRollback({ assignNew, deleteOld, revokeNew })).rejects.toThrow(
      'delete failed'
    )
    expect(revokeNew).toHaveBeenCalledWith('new-1')
  })

  it('throws combined error when delete and revoke both fail', async () => {
    const reportError = vi.fn()
    const original = globalThis.reportError
    globalThis.reportError = reportError as typeof globalThis.reportError

    try {
      const assignNew = vi.fn().mockResolvedValue({ id: 'new-2' })
      const deleteOld = vi.fn().mockRejectedValue(new Error('delete failed'))
      const revokeNew = vi.fn().mockRejectedValue('revoke boom')

      await expect(assignNewThenDeleteOldWithRollback({ assignNew, deleteOld, revokeNew })).rejects.toSatisfy(
        (err: unknown) => {
          if (!(err instanceof Error)) return false
          if (!err.message.includes('New assignment id: new-2')) return false
          if (!err.message.includes('Delete error: delete failed')) return false
          if (!err.message.includes('Revoke error: revoke boom')) return false
          const cause = (err as Error & { cause?: { newAssignmentId?: string } }).cause
          return cause?.newAssignmentId === 'new-2'
        }
      )

      expect(reportError).toHaveBeenCalledOnce()
    } finally {
      globalThis.reportError = original
    }
  })

  it('wraps non-Error delete failure when revoke succeeds', async () => {
    const assignNew = vi.fn().mockResolvedValue({ id: 'new-3' })
    const deleteOld = vi.fn().mockRejectedValue('plain delete')
    const revokeNew = vi.fn().mockResolvedValue(undefined)

    await expect(assignNewThenDeleteOldWithRollback({ assignNew, deleteOld, revokeNew })).rejects.toThrow(
      'plain delete'
    )
  })
})
