import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { accessFetchClient } from './accessClient'
import { useAllProjectRoles } from './useAllProjectRoles'

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
  interfaceTagMiddleware: { onRequest: vi.fn() },
}))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
)

describe('useAllProjectRoles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
  })

  it('does not fetch when projectId is undefined', () => {
    const { result } = renderHook(() => useAllProjectRoles(undefined), { wrapper })

    expect(result.current.roles).toEqual([])
    expect(accessFetchClient.GET).not.toHaveBeenCalled()
  })

  it('returns roles on successful fetch', async () => {
    const mockRoles = [
      {
        id: 'r1',
        name: 'Editor',
        description: null,
        policies: [],
        is_builtin: false,
        project_id: 'proj-1',
        labels: {},
        created_at: null,
        updated_at: null,
      },
    ]

    vi.mocked(accessFetchClient.GET).mockResolvedValue({
      data: { resources: mockRoles },
      error: null,
    } as never)

    const { result } = renderHook(() => useAllProjectRoles('proj-1'), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.roles).toEqual(mockRoles)
    expect(accessFetchClient.GET).toHaveBeenCalledWith('/projects/{project_id}/roles', {
      params: { path: { project_id: 'proj-1' }, query: { sort: 'name', limit: 100, cursor: undefined } },
    })
  })

  it('paginates through multiple pages', async () => {
    const r1 = [
      {
        id: 'r1',
        name: 'A',
        description: null,
        policies: [],
        is_builtin: false,
        project_id: 'p',
        labels: {},
        created_at: null,
        updated_at: null,
      },
    ]
    const r2 = [
      {
        id: 'r2',
        name: 'B',
        description: null,
        policies: [],
        is_builtin: false,
        project_id: 'p',
        labels: {},
        created_at: null,
        updated_at: null,
      },
    ]

    vi.mocked(accessFetchClient.GET)
      .mockResolvedValueOnce({ data: { resources: r1, next: 'c1' }, error: null } as never)
      .mockResolvedValueOnce({ data: { resources: r2 }, error: null } as never)

    const { result } = renderHook(() => useAllProjectRoles('p'), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.roles).toEqual([...r1, ...r2])
    expect(accessFetchClient.GET).toHaveBeenCalledTimes(2)
  })
})
