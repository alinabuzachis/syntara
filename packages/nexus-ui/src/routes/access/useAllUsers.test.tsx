import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { accessFetchClient } from './accessClient'
import { useAllUsers } from './useAllUsers'

vi.mock('./accessClient', () => ({
  accessClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
  accessFetchClient: {
    GET: vi.fn(),
    use: vi.fn(),
  },
}))

vi.mock('../../client', () => ({
  authMiddleware: { onRequest: vi.fn() },
}))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
)

describe('useAllUsers', () => {
  beforeEach(() => {
    queryClient.clear()
  })

  it('returns users on successful fetch', async () => {
    const mockUsers = [
      { id: 'u1', username: 'alice', full_name: 'Alice Smith' },
      { id: 'u2', username: 'bob', full_name: 'Bob Jones' },
    ]

    vi.mocked(accessFetchClient.GET).mockResolvedValue({
      data: { resources: mockUsers },
      error: null,
    })

    const { result } = renderHook(() => useAllUsers(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.users).toEqual(mockUsers)
    expect(result.current.error).toBeNull()
  })

  it('returns empty array when response has no resources', async () => {
    vi.mocked(accessFetchClient.GET).mockResolvedValue({
      data: undefined,
      error: null,
    })

    const { result } = renderHook(() => useAllUsers(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.users).toEqual([])
  })

  it('returns error when fetch fails', async () => {
    vi.mocked(accessFetchClient.GET).mockResolvedValue({
      data: undefined,
      error: { detail: 'Unauthorized' },
    })

    const { result } = renderHook(() => useAllUsers(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBeTruthy()
  })

  it('passes correct query parameters', async () => {
    vi.mocked(accessFetchClient.GET).mockResolvedValue({
      data: { resources: [] },
      error: null,
    })

    renderHook(() => useAllUsers(), { wrapper })

    await waitFor(() => {
      expect(accessFetchClient.GET).toHaveBeenCalledWith('/users', {
        params: { query: { limit: 100 } },
      })
    })
  })

  it('is loading initially', () => {
    vi.mocked(accessFetchClient.GET).mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useAllUsers(), { wrapper })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.users).toEqual([])
  })
})
