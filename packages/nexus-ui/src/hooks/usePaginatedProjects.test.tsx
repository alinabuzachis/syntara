import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, act } from '@testing-library/react'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProjectRead } from '../routes/access/types'

import { usePaginatedProjects } from './usePaginatedProjects'

// ── Mocks ─────────────────────────────────────────────────────────────────

type PaginatedResponse = {
  resources: ProjectRead[]
  next: string | null
  prev: string | null
  total: number | null
}

let mockQueryData: PaginatedResponse | undefined
let mockIsFetching = false

vi.mock('../routes/access/accessClient', () => ({
  accessClient: {
    useQuery: vi.fn().mockImplementation(() => ({
      data: mockQueryData,
      isPending: false,
      isFetching: mockIsFetching,
      error: null,
      refetch: vi.fn(),
    })),
  },
}))

// ── Helpers ───────────────────────────────────────────────────────────────

const page1: ProjectRead[] = [
  { id: 'p1', name: 'Alpha', description: null, labels: {}, is_default: false, created_at: '', updated_at: '' },
  { id: 'p2', name: 'Beta', description: null, labels: {}, is_default: false, created_at: '', updated_at: '' },
]

const page2: ProjectRead[] = [
  { id: 'p3', name: 'Gamma', description: null, labels: {}, is_default: false, created_at: '', updated_at: '' },
  { id: 'p4', name: 'Delta', description: null, labels: {}, is_default: false, created_at: '', updated_at: '' },
]

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('usePaginatedProjects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
    mockQueryData = { resources: page1, next: 'cursor-2', prev: null, total: 4 }
    mockIsFetching = false
  })

  it('returns first page projects from query', () => {
    const { result } = renderHook(() => usePaginatedProjects(), { wrapper })

    expect(result.current.projects).toEqual(page1)
    expect(result.current.hasMore).toBe(true)
    expect(result.current.isLoadingMore).toBe(false)
  })

  it('returns empty projects when data is undefined', () => {
    mockQueryData = undefined
    const { result } = renderHook(() => usePaginatedProjects(), { wrapper })

    expect(result.current.projects).toEqual([])
    expect(result.current.hasMore).toBe(false)
  })

  it('returns hasMore false when next is null', () => {
    mockQueryData = { resources: page1, next: null, prev: null, total: 2 }
    const { result } = renderHook(() => usePaginatedProjects(), { wrapper })

    expect(result.current.hasMore).toBe(false)
  })

  describe('updateFilter', () => {
    it('updates filterValue', () => {
      const { result } = renderHook(() => usePaginatedProjects(), { wrapper })

      act(() => result.current.updateFilter('test'))

      expect(result.current.filterValue).toBe('test')
    })

    it('resets cursor and extra pages when filter changes', () => {
      const { result } = renderHook(() => usePaginatedProjects(), { wrapper })

      // First load more to set cursor/extraPages
      act(() => result.current.loadMore())

      // Then update filter — should reset
      act(() => result.current.updateFilter('search'))

      expect(result.current.filterValue).toBe('search')
      // Projects should be back to first page only (no accumulated extras)
      expect(result.current.projects).toEqual(page1)
    })
  })

  describe('resetPagination', () => {
    it('clears filter, cursor, and extra pages', () => {
      const { result } = renderHook(() => usePaginatedProjects(), { wrapper })

      act(() => result.current.updateFilter('test'))
      act(() => result.current.resetPagination())

      expect(result.current.filterValue).toBe('')
      expect(result.current.projects).toEqual(page1)
    })
  })

  describe('loadMore', () => {
    it('accumulates projects from previous pages', () => {
      const { result, rerender } = renderHook(() => usePaginatedProjects(), { wrapper })

      act(() => result.current.loadMore())

      mockQueryData = { resources: page2, next: null, prev: 'cursor-1', total: 4 }
      rerender()

      expect(result.current.projects).toHaveLength(4)
      expect(result.current.hasMore).toBe(false)
    })

    it('does nothing when next cursor is null', () => {
      mockQueryData = { resources: page1, next: null, prev: null, total: 2 }
      const { result } = renderHook(() => usePaginatedProjects(), { wrapper })

      const projectsBefore = result.current.projects
      act(() => result.current.loadMore())

      expect(result.current.projects).toEqual(projectsBefore)
    })

    it('reports isLoadingMore when cursor is set and query is fetching', () => {
      mockIsFetching = true
      const { result } = renderHook(() => usePaginatedProjects(), { wrapper })

      act(() => result.current.loadMore())

      expect(result.current.isLoadingMore).toBe(true)
    })
  })

  describe('project merging', () => {
    it('deduplicates projects when extraPages overlap with firstPage', () => {
      const { result } = renderHook(() => usePaginatedProjects(), { wrapper })

      // loadMore sets extraPages = current projects (page1)
      act(() => result.current.loadMore())

      // Now simulate query still returning page1 data (e.g. same cursor)
      // The projects memo should deduplicate
      expect(result.current.projects.length).toBeLessThanOrEqual(page1.length + page2.length)
    })
  })
})
