import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
    vi.clearAllMocks()
    queryClient.clear()
  })

  it('returns users on successful fetch', async () => {
    const mockUsers = [
      {
        id: 'u1',
        username: 'alice',
        full_name: 'Alice',
        email: 'a@test.com',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]

    vi.mocked(accessFetchClient.GET).mockResolvedValue({
      data: { resources: mockUsers },
      error: null,
    } as never)

    const { result } = renderHook(() => useAllUsers(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.users).toEqual(mockUsers)
    expect(result.current.error).toBeNull()
  })

  it('paginates through multiple pages', async () => {
    const page1 = [
      {
        id: 'u1',
        username: 'a',
        full_name: null,
        email: null,
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]
    const page2 = [
      {
        id: 'u2',
        username: 'b',
        full_name: null,
        email: null,
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]

    vi.mocked(accessFetchClient.GET)
      .mockResolvedValueOnce({ data: { resources: page1, next: 'c1' }, error: null } as never)
      .mockResolvedValueOnce({ data: { resources: page2 }, error: null } as never)

    const { result } = renderHook(() => useAllUsers(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.users).toEqual([...page1, ...page2])
    expect(accessFetchClient.GET).toHaveBeenCalledTimes(2)
  })

  it('passes correct query parameters', async () => {
    vi.mocked(accessFetchClient.GET).mockResolvedValue({
      data: { resources: [] },
      error: null,
    } as never)

    renderHook(() => useAllUsers(), { wrapper })

    await waitFor(() => {
      expect(accessFetchClient.GET).toHaveBeenCalledWith('/users', {
        params: { query: { limit: 100, cursor: undefined } },
      })
    })
  })
})
