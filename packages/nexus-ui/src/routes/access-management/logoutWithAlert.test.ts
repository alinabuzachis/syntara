import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getErrorMessage } from '../../utils/apiErrors'
import { detachPromise } from '../../utils/detachPromise'

import { logoutWithAlert } from './logoutWithAlert'

vi.mock('../../utils/detachPromise', () => ({
  detachPromise: vi.fn(),
}))

vi.mock('../../utils/apiErrors', () => ({
  getErrorMessage: vi.fn((e: unknown) => String(e)),
}))

describe('logoutWithAlert', () => {
  const mockLogout = vi.fn().mockResolvedValue(undefined)
  const mockShowAlert = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a success alert with the given title', () => {
    logoutWithAlert(mockLogout, mockShowAlert, 'Signing out')

    expect(mockShowAlert).toHaveBeenCalledWith({
      title: 'Signing out',
      variant: 'success',
      autoDismiss: true,
    })
  })

  it('calls logout and passes result to detachPromise with onReject', () => {
    logoutWithAlert(mockLogout, mockShowAlert, 'Signing out')

    expect(mockLogout).toHaveBeenCalledTimes(1)
    expect(detachPromise).toHaveBeenCalledTimes(1)
    const callArgs = vi.mocked(detachPromise).mock.calls[0] as unknown[]
    expect(callArgs[1]).toHaveProperty('onReject')
  })

  it('shows a danger alert when logout rejects', () => {
    logoutWithAlert(mockLogout, mockShowAlert, 'Signing out')

    const options = vi.mocked(detachPromise).mock.calls[0]?.[1] as { onReject: (e: unknown) => void } | undefined
    const error = new Error('network failure')
    options?.onReject(error)

    expect(getErrorMessage).toHaveBeenCalledWith(error)
    expect(mockShowAlert).toHaveBeenCalledWith({
      title: 'Sign out failed',
      description: String(error),
      variant: 'danger',
      autoDismiss: false,
    })
  })
})
