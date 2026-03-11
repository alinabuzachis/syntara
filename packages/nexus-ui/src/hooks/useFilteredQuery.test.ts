import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useQueryState } from '../components/states/useQueryState'
import { FilterOperatorEnum } from '../types/filters'

import { useFilteredQuery } from './useFilteredQuery'

// Mock useQueryState to avoid rendering components in tests
vi.mock('../components/states/useQueryState', () => ({
  useQueryState: vi.fn((state) => {
    if (state.error) return { type: 'error' }
    if (state.isPending) return { type: 'loading' }
    return null
  }),
}))

describe('useFilteredQuery', () => {
  // Mock client with useQuery method
  // Type assertion needed for test mock - the client type is too complex to mock perfectly
  const mockClient = {
    useQuery: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any

  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock return value - can be overridden in individual tests
    mockClient.useQuery.mockReturnValue({
      data: undefined,
      error: null,
      isPending: false,
      refetch: vi.fn(),
    })
  })

  describe('Query Parameter Building', () => {
    it('should build query params from filters with contains operator', () => {
      // Arrange
      const filters = [{ key: 'name', operator: FilterOperatorEnum.CONTAINS, value: 'deploy' }]

      // Act
      renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
          filters,
        })
      )

      // Assert
      expect(mockClient.useQuery).toHaveBeenCalledWith('get', '/workflows', {
        params: {
          query: {
            'name[contains]': 'deploy',
          },
        },
      })
    })

    it('should build query params with multiple filters', () => {
      // Arrange
      const filters = [
        { key: 'name', operator: FilterOperatorEnum.CONTAINS, value: 'test' },
        { key: 'status', operator: FilterOperatorEnum.IN, value: ['running', 'failed'] },
        { key: 'is_enabled', operator: FilterOperatorEnum.EQ, value: true },
      ]

      // Act
      renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
          filters,
        })
      )

      // Assert
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
      // Arrange
      const testDate = new Date('2024-01-01T00:00:00.000Z')
      const filters = [{ key: 'created_at', operator: FilterOperatorEnum.GTE, value: testDate }]

      // Act
      renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
          filters,
        })
      )

      // Assert
      expect(mockClient.useQuery).toHaveBeenCalledWith('get', '/workflows', {
        params: {
          query: {
            'created_at[gte]': '2024-01-01T00:00:00.000Z',
          },
        },
      })
    })

    it('should handle empty filters array', () => {
      // Arrange
      // Act
      renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
          filters: [],
        })
      )

      // Assert
      expect(mockClient.useQuery).toHaveBeenCalledWith('get', '/workflows', {
        params: {
          query: {},
        },
      })
    })

    it('should skip filters with empty string values', () => {
      // Arrange
      const filters = [
        { key: 'name', operator: FilterOperatorEnum.CONTAINS, value: '' },
        { key: 'status', operator: FilterOperatorEnum.EQ, value: 'active' },
      ]

      // Act
      renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
          filters,
        })
      )

      // Assert
      expect(mockClient.useQuery).toHaveBeenCalledWith('get', '/workflows', {
        params: {
          query: {
            status: 'active',
          },
        },
      })
    })

    it('should skip filters with empty array values', () => {
      // Arrange
      const filters = [
        { key: 'status', operator: FilterOperatorEnum.IN, value: [] },
        { key: 'name', operator: FilterOperatorEnum.CONTAINS, value: 'test' },
      ]

      // Act
      renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
          filters,
        })
      )

      // Assert
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
      // Arrange
      // Act
      renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
          sort: '-created_at',
        })
      )

      // Assert
      expect(mockClient.useQuery).toHaveBeenCalledWith('get', '/workflows', {
        params: {
          query: {
            sort: '-created_at',
          },
        },
      })
    })

    it('should include limit parameter', () => {
      // Arrange
      // Act
      renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
          limit: 50,
        })
      )

      // Assert
      expect(mockClient.useQuery).toHaveBeenCalledWith('get', '/workflows', {
        params: {
          query: {
            limit: 50,
          },
        },
      })
    })

    it('should include cursor parameter', () => {
      // Arrange
      // Act
      renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
          cursor: 'abc123',
        })
      )

      // Assert
      expect(mockClient.useQuery).toHaveBeenCalledWith('get', '/workflows', {
        params: {
          query: {
            cursor: 'abc123',
          },
        },
      })
    })

    it('should not include cursor when null', () => {
      // Arrange
      // Act
      renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
          cursor: null,
        })
      )

      // Assert
      expect(mockClient.useQuery).toHaveBeenCalledWith('get', '/workflows', {
        params: {
          query: {},
        },
      })
    })

    it('should include include_total when includeTotalCount is true', () => {
      // Arrange
      // Act
      renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
          includeTotalCount: true,
        })
      )

      // Assert
      expect(mockClient.useQuery).toHaveBeenCalledWith('get', '/workflows', {
        params: {
          query: {
            include_total: true,
          },
        },
      })
    })

    it('should combine filters, sort, limit, cursor, and total count', () => {
      // Arrange
      const filters = [{ key: 'name', operator: FilterOperatorEnum.CONTAINS, value: 'deploy' }]

      // Act
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

      // Assert
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
      // Arrange
      const mockData = { resources: [{ id: '1', name: 'Test Workflow' }] }

      mockClient.useQuery.mockReturnValue({
        data: mockData,
        error: null,
        isPending: false,
        refetch: vi.fn(),
      })

      // Act
      const { result } = renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
        })
      )

      // Assert
      expect(result.current.data).toEqual(mockData)
      expect(result.current.error).toBeNull()
      expect(result.current.isPending).toBe(false)
      expect(result.current.queryState).toBeNull()
    })

    it('should return error when query fails', () => {
      // Arrange
      const mockError = new Error('Network error')

      mockClient.useQuery.mockReturnValue({
        data: undefined,
        error: mockError,
        isPending: false,
        refetch: vi.fn(),
      })

      // Act
      const { result } = renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
        })
      )

      // Assert
      expect(result.current.data).toBeUndefined()
      expect(result.current.error).toEqual(mockError)
      expect(result.current.isPending).toBe(false)
      // queryState should return error component (mocked as <div>Error</div>)
      expect(result.current.queryState).toBeTruthy()
    })

    it('should return isPending when query is loading', () => {
      // Arrange
      mockClient.useQuery.mockReturnValue({
        data: undefined,
        error: null,
        isPending: true,
        refetch: vi.fn(),
      })

      // Act
      const { result } = renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
        })
      )

      // Assert
      expect(result.current.data).toBeUndefined()
      expect(result.current.error).toBeNull()
      expect(result.current.isPending).toBe(true)
      // queryState should return loading component (mocked as <div>Loading</div>)
      expect(result.current.queryState).toBeTruthy()
    })

    it('should provide refetch function', () => {
      // Arrange
      const mockRefetch = vi.fn()
      mockClient.useQuery.mockReturnValue({
        data: undefined,
        error: null,
        isPending: false,
        refetch: mockRefetch,
      })

      // Act
      const { result } = renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
        })
      )

      // Assert
      expect(result.current.refetch).toBe(mockRefetch)
    })
  })

  describe('Query Refetch on Filter Change', () => {
    it('should rebuild query params when filters change', () => {
      // Arrange
      const initialFilters = [{ key: 'name', operator: FilterOperatorEnum.CONTAINS, value: 'initial' }]

      // Act - initial render
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

      // Assert initial call
      expect(mockClient.useQuery).toHaveBeenCalledWith('get', '/workflows', {
        params: {
          query: {
            'name[contains]': 'initial',
          },
        },
      })

      // Clear mock calls
      mockClient.useQuery.mockClear()

      // Act - update filters
      const updatedFilters = [{ key: 'name', operator: FilterOperatorEnum.CONTAINS, value: 'updated' }]
      rerender({ filters: updatedFilters })

      // Assert updated call
      expect(mockClient.useQuery).toHaveBeenCalledWith('get', '/workflows', {
        params: {
          query: {
            'name[contains]': 'updated',
          },
        },
      })
    })

    it('should rebuild query params when pagination changes', () => {
      // Arrange
      // Act - initial render
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

      // Assert initial call
      expect(mockClient.useQuery).toHaveBeenCalledWith('get', '/workflows', {
        params: {
          query: {
            limit: 20,
          },
        },
      })

      // Clear mock calls
      mockClient.useQuery.mockClear()

      // Act - update cursor
      rerender({ cursor: 'next_page' })

      // Assert updated call
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
      // Arrange
      // Act
      renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
          // filters not provided (defaults to [])
        })
      )

      // Assert
      expect(mockClient.useQuery).toHaveBeenCalledWith('get', '/workflows', {
        params: {
          query: {},
        },
      })
    })

    it('should handle limit of 0', () => {
      // Arrange
      // Act
      renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
          limit: 0,
        })
      )

      // Assert - limit 0 should be included
      expect(mockClient.useQuery).toHaveBeenCalledWith('get', '/workflows', {
        params: {
          query: {
            limit: 0,
          },
        },
      })
    })

    it('should handle all filter operators', () => {
      // Arrange
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

      // Act
      renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
          filters,
        })
      )

      // Assert
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
    it('should pass errorOptions to useQueryState', async () => {
      // Arrange
      const mockError = new Error('Test error')
      const mockRefetch = vi.fn()
      const mockUseQueryState = vi.mocked(useQueryState)

      mockClient.useQuery.mockReturnValue({
        data: undefined,
        error: mockError,
        isPending: false,
        refetch: mockRefetch,
      })

      const errorOptions = {
        title: 'Error loading workflows',
        onRetry: vi.fn(),
      }

      // Act
      renderHook(() =>
        useFilteredQuery({
          client: mockClient,
          method: 'get',
          path: '/workflows',
          errorOptions,
        })
      )

      // Assert - verify useQueryState was called with query result and errorOptions
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
