import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { useResourceActions } from './useResourceActions'

type QueryResult = { data: unknown; isLoading: boolean; error: Error | null }
const mockUseQuery = vi.fn<(...args: unknown[]) => QueryResult>()

vi.mock('./accessClient', () => ({
  accessClient: {
    useQuery: (...args: unknown[]): QueryResult => mockUseQuery(...args),
  },
  accessFetchClient: { use: vi.fn() },
}))

vi.mock('../../client', () => ({
  authMiddleware: { onRequest: vi.fn() },
}))

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useResourceActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
  })

  it('returns resource types and actions from API response', () => {
    mockUseQuery.mockReturnValue({
      data: {
        resource_actions: {
          workflow: ['create', 'read'],
          project: ['delete', 'read'],
        },
      },
      isLoading: false,
      error: null,
    })

    const { result } = renderHook(() => useResourceActions(), { wrapper })

    expect(result.current.resourceTypes).toEqual(['project', 'workflow'])
    expect(result.current.actionsByResource.get('workflow')).toEqual(['create', 'read'])
    expect(result.current.actionsByResource.get('project')).toEqual(['delete', 'read'])
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('returns empty state when data is not yet loaded', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    })

    const { result } = renderHook(() => useResourceActions(), { wrapper })

    expect(result.current.resourceTypes).toEqual([])
    expect(result.current.actionsByResource.size).toBe(0)
    expect(result.current.isLoading).toBe(true)
  })

  it('sorts resource types alphabetically', () => {
    mockUseQuery.mockReturnValue({
      data: {
        resource_actions: {
          zebra: ['read'],
          alpha: ['write'],
          middle: ['delete'],
        },
      },
      isLoading: false,
      error: null,
    })

    const { result } = renderHook(() => useResourceActions(), { wrapper })

    expect(result.current.resourceTypes).toEqual(['alpha', 'middle', 'zebra'])
  })

  it('calls accessClient.useQuery with correct arguments', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false, error: null })

    renderHook(() => useResourceActions(), { wrapper })

    expect(mockUseQuery).toHaveBeenCalledWith('get', '/authz/resource-actions')
  })

  it('passes through error from query', () => {
    const err = new Error('Network error')
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: err,
    })

    const { result } = renderHook(() => useResourceActions(), { wrapper })

    expect(result.current.error).toBe(err)
    expect(result.current.resourceTypes).toEqual([])
  })
})
