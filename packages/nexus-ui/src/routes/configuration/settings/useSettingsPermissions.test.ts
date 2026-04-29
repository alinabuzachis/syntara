import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { accessFetchClient } from '../../access/accessClient'

import { useSettingsPermissions } from './useSettingsPermissions'

vi.mock('../../access/accessClient', () => ({
  accessFetchClient: {
    POST: vi.fn(),
    use: vi.fn(),
  },
}))

vi.mock('../../../client', () => ({
  authMiddleware: { onRequest: vi.fn() },
}))

describe('useSettingsPermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns canRead and canWrite true when both are allowed', async () => {
    vi.mocked(accessFetchClient.POST).mockResolvedValue({
      data: { allowed: true },
    })

    const { result } = renderHook(() => useSettingsPermissions())

    await waitFor(() => {
      expect(result.current.canRead).toBe(true)
    })

    expect(result.current.canWrite).toBe(true)
    expect(accessFetchClient.POST).toHaveBeenCalledWith('/authz/can-i', {
      body: { action: 'read', resource_type: 'setting' },
    })
    expect(accessFetchClient.POST).toHaveBeenCalledWith('/authz/can-i', {
      body: { action: 'write', resource_type: 'setting' },
    })
  })

  it('returns canRead true and canWrite false for auditor role', async () => {
    vi.mocked(accessFetchClient.POST).mockImplementation((_path: string, options: { body: { action: string } }) => {
      if (options.body.action === 'read') {
        return Promise.resolve({ data: { allowed: true } })
      }
      return Promise.resolve({ data: { allowed: false } })
    })

    const { result } = renderHook(() => useSettingsPermissions())

    await waitFor(() => {
      expect(result.current.canRead).toBe(true)
    })

    expect(result.current.canWrite).toBe(false)
  })

  it('returns both false when user has no settings access', async () => {
    vi.mocked(accessFetchClient.POST).mockResolvedValue({
      data: { allowed: false },
    })

    const { result } = renderHook(() => useSettingsPermissions())

    await waitFor(() => {
      expect(accessFetchClient.POST).toHaveBeenCalledTimes(2)
    })

    expect(result.current.canRead).toBe(false)
    expect(result.current.canWrite).toBe(false)
  })

  it('returns both false when response has no data', async () => {
    vi.mocked(accessFetchClient.POST).mockResolvedValue({
      data: undefined,
    })

    const { result } = renderHook(() => useSettingsPermissions())

    await waitFor(() => {
      expect(accessFetchClient.POST).toHaveBeenCalledTimes(2)
    })

    expect(result.current.canRead).toBe(false)
    expect(result.current.canWrite).toBe(false)
  })

  it('defaults to both false while requests are in flight', () => {
    vi.mocked(accessFetchClient.POST).mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useSettingsPermissions())

    expect(result.current.canRead).toBe(false)
    expect(result.current.canWrite).toBe(false)
  })

  it('does not update state after unmount', async () => {
    let resolve: (value: unknown) => void
    vi.mocked(accessFetchClient.POST).mockReturnValue(
      new Promise((r) => {
        resolve = r
      })
    )

    const { result, unmount } = renderHook(() => useSettingsPermissions())

    unmount()

    resolve!({ data: { allowed: true } })
    await vi.waitFor(() => {
      expect(accessFetchClient.POST).toHaveBeenCalled()
    })

    expect(result.current.canRead).toBe(false)
    expect(result.current.canWrite).toBe(false)
  })

  it('returns safe defaults when requests fail', async () => {
    vi.mocked(accessFetchClient.POST).mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => useSettingsPermissions())

    await waitFor(() => {
      expect(accessFetchClient.POST).toHaveBeenCalledTimes(2)
    })

    expect(result.current.canRead).toBe(false)
    expect(result.current.canWrite).toBe(false)
  })
})
