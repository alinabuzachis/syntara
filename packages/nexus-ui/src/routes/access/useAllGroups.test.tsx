import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { accessFetchClient } from './accessClient'
import { useAllGroups } from './useAllGroups'

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

describe('useAllGroups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
  })

  it('returns groups on successful fetch', async () => {
    const mockGroups = [
      {
        id: 'g1',
        name: 'authenticated',
        description: 'All authenticated users',
        is_builtin: true,
        created_at: null,
        updated_at: null,
      },
      { id: 'g2', name: 'developers', description: 'Dev team', is_builtin: false, created_at: null, updated_at: null },
    ]

    vi.mocked(accessFetchClient.GET).mockResolvedValue({
      data: { resources: mockGroups },
      error: null,
    } as never)

    const { result } = renderHook(() => useAllGroups(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.groups).toEqual(mockGroups)
    expect(result.current.error).toBeNull()
  })

  it('paginates through multiple pages', async () => {
    const page1 = [
      { id: 'g1', name: 'authenticated', description: null, is_builtin: true, created_at: null, updated_at: null },
    ]
    const page2 = [
      { id: 'g2', name: 'developers', description: null, is_builtin: false, created_at: null, updated_at: null },
    ]

    vi.mocked(accessFetchClient.GET)
      .mockResolvedValueOnce({ data: { resources: page1, next: 'cursor-1' }, error: null } as never)
      .mockResolvedValueOnce({ data: { resources: page2 }, error: null } as never)

    const { result } = renderHook(() => useAllGroups(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.groups).toEqual([...page1, ...page2])
    expect(accessFetchClient.GET).toHaveBeenCalledTimes(2)
  })

  it('returns error when fetch fails', async () => {
    vi.mocked(accessFetchClient.GET).mockResolvedValue({
      data: undefined,
      error: { detail: 'Forbidden' },
    } as never)

    const { result } = renderHook(() => useAllGroups(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBeTruthy()
  })

  it('returns empty array when no groups exist', async () => {
    vi.mocked(accessFetchClient.GET).mockResolvedValue({
      data: { resources: [] },
      error: null,
    } as never)

    const { result } = renderHook(() => useAllGroups(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.groups).toEqual([])
  })

  it('is loading initially', () => {
    vi.mocked(accessFetchClient.GET).mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useAllGroups(), { wrapper })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.groups).toEqual([])
  })

  it('passes correct query parameters', async () => {
    vi.mocked(accessFetchClient.GET).mockResolvedValue({
      data: { resources: [] },
      error: null,
    } as never)

    renderHook(() => useAllGroups(), { wrapper })

    await waitFor(() => {
      expect(accessFetchClient.GET).toHaveBeenCalledWith('/groups', {
        params: { query: { limit: 100, cursor: undefined } },
      })
    })
  })
})
