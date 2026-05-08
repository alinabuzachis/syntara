import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { accessFetchClient } from './accessClient'
import { useCanQueryAuthz } from './useCanQueryAuthz'

vi.mock('./accessClient', () => ({
  accessFetchClient: {
    POST: vi.fn(),
    use: vi.fn(),
  },
}))

vi.mock('../../client', () => ({
  authMiddleware: { onRequest: vi.fn() },
}))

describe('useCanQueryAuthz', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns canQuery true when the user is allowed to query authz', async () => {
    vi.mocked(accessFetchClient.POST).mockResolvedValue({
      data: { allowed: true },
    })

    const { result } = renderHook(() => useCanQueryAuthz())

    await waitFor(() => {
      expect(result.current).toEqual({ canQuery: true, isChecking: false })
    })

    expect(accessFetchClient.POST).toHaveBeenCalledWith('/authz/can-i', {
      body: { action: 'query', resource_type: 'authz' },
    })
  })

  it('returns canQuery false when the user is not allowed', async () => {
    vi.mocked(accessFetchClient.POST).mockResolvedValue({
      data: { allowed: false },
    })

    const { result } = renderHook(() => useCanQueryAuthz())

    await waitFor(() => {
      expect(result.current).toEqual({ canQuery: false, isChecking: false })
    })
  })

  it('returns canQuery false when the response has no data', async () => {
    vi.mocked(accessFetchClient.POST).mockResolvedValue({
      data: undefined,
    })

    const { result } = renderHook(() => useCanQueryAuthz())

    await waitFor(() => {
      expect(result.current).toEqual({ canQuery: false, isChecking: false })
    })
  })

  it('returns isChecking true while the request is in flight', () => {
    vi.mocked(accessFetchClient.POST).mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useCanQueryAuthz())

    expect(result.current).toEqual({ canQuery: false, isChecking: true })
  })

  it('sets isChecking false on network error', async () => {
    vi.mocked(accessFetchClient.POST).mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useCanQueryAuthz())

    await waitFor(() => {
      expect(result.current).toEqual({ canQuery: false, isChecking: false })
    })
  })

  it('does not update state after unmount', async () => {
    let resolve: (value: unknown) => void
    vi.mocked(accessFetchClient.POST).mockReturnValue(
      new Promise((r) => {
        resolve = r
      })
    )

    const { result, unmount } = renderHook(() => useCanQueryAuthz())

    unmount()

    resolve!({ data: { allowed: true } })
    await vi.waitFor(() => {
      expect(accessFetchClient.POST).toHaveBeenCalled()
    })

    expect(result.current).toEqual({ canQuery: false, isChecking: true })
  })
})
