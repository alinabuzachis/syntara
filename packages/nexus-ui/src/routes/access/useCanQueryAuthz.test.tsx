import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useCanQueryAuthz', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns canQuery true when the user is allowed to query authz', async () => {
    vi.mocked(accessFetchClient.POST).mockResolvedValue({
      data: { allowed: true },
    })

    const { result } = renderHook(() => useCanQueryAuthz(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current).toEqual({ canQuery: true, isChecking: false })
    })

    expect(accessFetchClient.POST).toHaveBeenCalledWith('/authz/can_i', {
      body: { action: 'query', resource_type: 'authz' },
    })
  })

  it('returns canQuery false when the user is not allowed', async () => {
    vi.mocked(accessFetchClient.POST).mockResolvedValue({
      data: { allowed: false },
    })

    const { result } = renderHook(() => useCanQueryAuthz(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current).toEqual({ canQuery: false, isChecking: false })
    })
  })

  it('returns canQuery false when the response has no data', async () => {
    vi.mocked(accessFetchClient.POST).mockResolvedValue({
      data: undefined,
    })

    const { result } = renderHook(() => useCanQueryAuthz(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current).toEqual({ canQuery: false, isChecking: false })
    })
  })

  it('returns isChecking true while the request is in flight', () => {
    vi.mocked(accessFetchClient.POST).mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useCanQueryAuthz(), { wrapper: createWrapper() })

    expect(result.current).toEqual({ canQuery: false, isChecking: true })
  })

  it('returns canQuery false on network error', async () => {
    vi.mocked(accessFetchClient.POST).mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useCanQueryAuthz(), { wrapper: createWrapper() })

    await waitFor(() => {
      expect(result.current.isChecking).toBe(false)
    })
    expect(result.current.canQuery).toBe(false)
  })
})
