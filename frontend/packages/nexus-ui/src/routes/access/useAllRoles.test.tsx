import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { accessFetchClient } from './accessClient'
import { useAllRoles } from './useAllRoles'

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

describe('useAllRoles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
  })

  it('returns roles on successful fetch', async () => {
    const mockRoles = [
      {
        id: 'r1',
        name: 'Admin',
        description: null,
        policies: [],
        is_builtin: true,
        project_id: null,
        labels: {},
        created_at: null,
        updated_at: null,
      },
    ]

    vi.mocked(accessFetchClient.GET).mockResolvedValue({
      data: { resources: mockRoles },
      error: null,
    } as never)

    const { result } = renderHook(() => useAllRoles(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.roles).toEqual(mockRoles)
    expect(result.current.error).toBeNull()
  })

  it('paginates through multiple pages', async () => {
    const page1Roles = [
      {
        id: 'r1',
        name: 'Admin',
        description: null,
        policies: [],
        is_builtin: true,
        project_id: null,
        labels: {},
        created_at: null,
        updated_at: null,
      },
    ]
    const page2Roles = [
      {
        id: 'r2',
        name: 'Viewer',
        description: null,
        policies: [],
        is_builtin: true,
        project_id: null,
        labels: {},
        created_at: null,
        updated_at: null,
      },
    ]

    vi.mocked(accessFetchClient.GET)
      .mockResolvedValueOnce({ data: { resources: page1Roles, next: 'cursor-1' }, error: null } as never)
      .mockResolvedValueOnce({ data: { resources: page2Roles }, error: null } as never)

    const { result } = renderHook(() => useAllRoles(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.roles).toEqual([...page1Roles, ...page2Roles])
    expect(accessFetchClient.GET).toHaveBeenCalledTimes(2)
  })

  it('returns error when fetch fails', async () => {
    vi.mocked(accessFetchClient.GET).mockResolvedValue({
      data: undefined,
      error: { detail: 'Unauthorized' },
    } as never)

    const { result } = renderHook(() => useAllRoles(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBeTruthy()
  })

  it('passes correct query parameters', async () => {
    vi.mocked(accessFetchClient.GET).mockResolvedValue({
      data: { resources: [] },
      error: null,
    } as never)

    renderHook(() => useAllRoles(), { wrapper })

    await waitFor(() => {
      expect(accessFetchClient.GET).toHaveBeenCalledWith('/roles', {
        params: { query: { limit: 100, cursor: undefined } },
      })
    })
  })
})
