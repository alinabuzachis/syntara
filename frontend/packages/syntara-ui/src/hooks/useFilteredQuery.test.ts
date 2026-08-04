import { renderHook } from '@testing-library/react'
import type { HttpMethod } from 'openapi-typescript-helpers'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'

import { useQueryState } from '../components/states/useQueryState'
import { FilterOperatorEnum } from '../types/filters'

import { useFilteredQuery, type UseFilteredQueryOptions } from './useFilteredQuery'

vi.mock('../components/states/useQueryState', () => ({
  useQueryState: vi.fn((state: { error?: unknown; isPending?: boolean }) => {
    if (state.error) return { type: 'error' }
    if (state.isPending) return { type: 'loading' }
    return null
  }),
}))

type MockQueryResult = {
  data: unknown
  error: Error | null
  isPending: boolean
  refetch: () => void
}

type UseQueryMockFn = (method: string, path: string, init?: Record<string, unknown>) => MockQueryResult

type TestPaths = { '/workflows': Record<HttpMethod, object> }
type TestClient = UseFilteredQueryOptions<TestPaths, 'get', '/workflows'>['client']

describe('useFilteredQuery', () => {
  const mockUseQuery: Mock<UseQueryMockFn> = vi.fn<UseQueryMockFn>()

  const mockClient = { useQuery: mockUseQuery } as unknown as TestClient & { useQuery: Mock<UseQueryMockFn> }

  beforeEach(() => {
    vi.clearAllMocks()

    mockClient.useQuery.mockReturnValue({
      data: undefined,
      error: null,
      isPending: false,
      refetch: vi.fn<() => void>(),
    })
  })

  describe('Query Parameter Building', () => {
    it('should build query params from filters with contains operator', () => {
      const filters = [{ key: 'name', operator: FilterOperatorEnum.CONTAINS, value: 'deploy' }]

      renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
          filters,
        })
      )

      expect(mockClient.useQuery).toHaveBeenCalledWith('get', '/workflows', {
        params: {
          query: {
            'name[contains]': 'deploy',
          },
        },
      })
    })

    it('should build query params with multiple filters', () => {
      const filters = [
        { key: 'name', operator: FilterOperatorEnum.CONTAINS, value: 'test' },
        { key: 'status', operator: FilterOperatorEnum.IN, value: ['running', 'failed'] },
        { key: 'is_enabled', operator: FilterOperatorEnum.EQ, value: true },
      ]

      renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
          filters,
        })
      )

      expect(mockClient.useQuery).toHaveBeenCalledWith('get', '/workflows', {
        params: {
          query: {
            'name[contains]': 'test',
            'status[in]': 'running,failed',
            is_enabled: true,
          },
        },
      })
    })

    it('should handle date filters with gte operator', () => {
      const testDate = new Date('2024-01-01T00:00:00.000Z')
      const filters = [{ key: 'created_at', operator: FilterOperatorEnum.GTE, value: testDate }]

      renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
          filters,
        })
      )

      expect(mockClient.useQuery).toHaveBeenCalledWith('get', '/workflows', {
        params: {
          query: {
            'created_at[gte]': '2024-01-01T00:00:00.000Z',
          },
        },
      })
    })

    it('should handle empty filters array', () => {
      renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
          filters: [],
        })
      )

      expect(mockClient.useQuery).toHaveBeenCalledWith('get', '/workflows', {
        params: {
          query: {},
        },
      })
    })

    it('should skip filters with empty string values', () => {
      const filters = [
        { key: 'name', operator: FilterOperatorEnum.CONTAINS, value: '' },
        { key: 'status', operator: FilterOperatorEnum.EQ, value: 'active' },
      ]

      renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
          filters,
        })
      )

      expect(mockClient.useQuery).toHaveBeenCalledWith('get', '/workflows', {
        params: {
          query: {
            status: 'active',
          },
        },
      })
    })

    it('should skip filters with empty array values', () => {
      const filters = [
        { key: 'status', operator: FilterOperatorEnum.IN, value: [] },
        { key: 'name', operator: FilterOperatorEnum.CONTAINS, value: 'test' },
      ]

      renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
          filters,
        })
      )

      expect(mockClient.useQuery).toHaveBeenCalledWith('get', '/workflows', {
        params: {
          query: {
            'name[contains]': 'test',
          },
        },
      })
    })
  })

  describe('Pagination and Sorting', () => {
    it('should include sort parameter', () => {
      renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
          sort: '-created_at',
        })
      )

      expect(mockClient.useQuery).toHaveBeenCalledWith('get', '/workflows', {
        params: {
          query: {
            sort: '-created_at',
          },
        },
      })
    })

    it('should include limit parameter', () => {
      renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
          limit: 50,
        })
      )

      expect(mockClient.useQuery).toHaveBeenCalledWith('get', '/workflows', {
        params: {
          query: {
            limit: 50,
          },
        },
      })
    })

    it('should include cursor parameter', () => {
      renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
          cursor: 'abc123',
        })
      )

      expect(mockClient.useQuery).toHaveBeenCalledWith('get', '/workflows', {
        params: {
          query: {
            cursor: 'abc123',
          },
        },
      })
    })

    it('should not include cursor when null', () => {
      renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
          cursor: null,
        })
      )

      expect(mockClient.useQuery).toHaveBeenCalledWith('get', '/workflows', {
        params: {
          query: {},
        },
      })
    })

    it('should include include_total when includeTotalCount is true', () => {
      renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
          includeTotalCount: true,
        })
      )

      expect(mockClient.useQuery).toHaveBeenCalledWith('get', '/workflows', {
        params: {
          query: {
            include_total: true,
          },
        },
      })
    })

    it('should combine filters, sort, limit, cursor, and total count', () => {
      const filters = [{ key: 'name', operator: FilterOperatorEnum.CONTAINS, value: 'deploy' }]

      renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
          filters,
          sort: '-created_at',
          limit: 20,
          cursor: 'xyz789',
          includeTotalCount: true,
        })
      )

      expect(mockClient.useQuery).toHaveBeenCalledWith('get', '/workflows', {
        params: {
          query: {
            'name[contains]': 'deploy',
            sort: '-created_at',
            limit: 20,
            cursor: 'xyz789',
            include_total: true,
          },
        },
      })
    })
  })

  describe('Query State Handling', () => {
    it('should return data when query succeeds', () => {
      const mockData = { resources: [{ id: '1', name: 'Test Workflow' }] }

      mockClient.useQuery.mockReturnValue({
        data: mockData,
        error: null,
        isPending: false,
        refetch: vi.fn<() => void>(),
      })

      const { result } = renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
        })
      )

      expect(result.current.data).toEqual(mockData)
      expect(result.current.error).toBeNull()
      expect(result.current.isPending).toBe(false)
      expect(result.current.queryState).toBeNull()
    })

    it('should return error when query fails', () => {
      const mockError = new Error('Network error')

      mockClient.useQuery.mockReturnValue({
        data: undefined,
        error: mockError,
        isPending: false,
        refetch: vi.fn<() => void>(),
      })

      const { result } = renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
        })
      )

      expect(result.current.data).toBeUndefined()
      expect(result.current.error).toEqual(mockError)
      expect(result.current.isPending).toBe(false)
      expect(result.current.queryState).toBeTruthy()
    })

    it('should return isPending when query is loading', () => {
      mockClient.useQuery.mockReturnValue({
        data: undefined,
        error: null,
        isPending: true,
        refetch: vi.fn<() => void>(),
      })

      const { result } = renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
        })
      )

      expect(result.current.data).toBeUndefined()
      expect(result.current.error).toBeNull()
      expect(result.current.isPending).toBe(true)
      expect(result.current.queryState).toBeTruthy()
    })

    it('should provide refetch function', () => {
      const mockRefetch = vi.fn<() => void>()
      mockClient.useQuery.mockReturnValue({
        data: undefined,
        error: null,
        isPending: false,
        refetch: mockRefetch,
      })

      const { result } = renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
        })
      )

      expect(result.current.refetch).toBe(mockRefetch)
    })
  })

  describe('Query Refetch on Filter Change', () => {
    it('should rebuild query params when filters change', () => {
      const initialFilters = [{ key: 'name', operator: FilterOperatorEnum.CONTAINS, value: 'initial' }]

      const { rerender } = renderHook(
        ({ filters }) =>
          useFilteredQuery({
            client: mockClient,
            method: 'get',
            path: '/workflows',
            filters,
          }),
        {
          initialProps: { filters: initialFilters },
        }
      )

      expect(mockClient.useQuery).toHaveBeenCalledWith('get', '/workflows', {
        params: {
          query: {
            'name[contains]': 'initial',
          },
        },
      })

      mockClient.useQuery.mockClear()

      const updatedFilters = [{ key: 'name', operator: FilterOperatorEnum.CONTAINS, value: 'updated' }]
      rerender({ filters: updatedFilters })

      expect(mockClient.useQuery).toHaveBeenCalledWith('get', '/workflows', {
        params: {
          query: {
            'name[contains]': 'updated',
          },
        },
      })
    })

    it('should rebuild query params when pagination changes', () => {
      const { rerender } = renderHook(
        ({ cursor }: { cursor: string | null }) =>
          useFilteredQuery({
            client: mockClient,
            method: 'get',
            path: '/workflows',
            cursor,
            limit: 20,
          }),
        {
          initialProps: { cursor: null as string | null },
        }
      )

      expect(mockClient.useQuery).toHaveBeenCalledWith('get', '/workflows', {
        params: {
          query: {
            limit: 20,
          },
        },
      })

      mockClient.useQuery.mockClear()

      rerender({ cursor: 'next_page' })

      expect(mockClient.useQuery).toHaveBeenCalledWith('get', '/workflows', {
        params: {
          query: {
            limit: 20,
            cursor: 'next_page',
          },
        },
      })
    })
  })

  describe('Edge Cases', () => {
    it('should handle undefined filters parameter', () => {
      renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
        })
      )

      expect(mockClient.useQuery).toHaveBeenCalledWith('get', '/workflows', {
        params: {
          query: {},
        },
      })
    })

    it('should handle limit of 0', () => {
      renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
          limit: 0,
        })
      )

      expect(mockClient.useQuery).toHaveBeenCalledWith('get', '/workflows', {
        params: {
          query: {
            limit: 0,
          },
        },
      })
    })

    it('should handle all filter operators', () => {
      const filters = [
        { key: 'name', operator: FilterOperatorEnum.EQ, value: 'exact' },
        { key: 'description', operator: FilterOperatorEnum.CONTAINS, value: 'deploy' },
        { key: 'title', operator: FilterOperatorEnum.STARTS_WITH, value: 'Prod' },
        { key: 'created_at', operator: FilterOperatorEnum.GT, value: new Date('2024-01-01') },
        { key: 'updated_at', operator: FilterOperatorEnum.GTE, value: new Date('2024-01-01') },
        { key: 'end_date', operator: FilterOperatorEnum.LT, value: new Date('2024-12-31') },
        { key: 'start_date', operator: FilterOperatorEnum.LTE, value: new Date('2024-12-31') },
        { key: 'status', operator: FilterOperatorEnum.IN, value: ['active', 'pending'] },
      ]

      renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
          filters,
        })
      )

      expect(mockClient.useQuery).toHaveBeenCalledWith('get', '/workflows', {
        params: {
          query: {
            name: 'exact',
            'description[contains]': 'deploy',
            'title[starts_with]': 'Prod',
            'created_at[gt]': '2024-01-01T00:00:00.000Z',
            'updated_at[gte]': '2024-01-01T00:00:00.000Z',
            'end_date[lt]': '2024-12-31T00:00:00.000Z',
            'start_date[lte]': '2024-12-31T00:00:00.000Z',
            'status[in]': 'active,pending',
          },
        },
      })
    })
  })

  describe('Error Options', () => {
    it('should pass errorOptions to useQueryState', () => {
      const mockError = new Error('Test error')
      const mockRefetch = vi.fn<() => void>()
      const mockUseQueryState = vi.mocked(useQueryState)

      mockClient.useQuery.mockReturnValue({
        data: undefined,
        error: mockError,
        isPending: false,
        refetch: mockRefetch,
      })

      const errorOptions = {
        title: 'Error loading workflows',
        onRetry: vi.fn<() => void>(),
      }

      renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
          errorOptions,
        })
      )

      expect(mockUseQueryState).toHaveBeenCalledWith(
        {
          data: undefined,
          error: mockError,
          isPending: false,
          refetch: mockRefetch,
        },
        errorOptions
      )
    })
  })
})
