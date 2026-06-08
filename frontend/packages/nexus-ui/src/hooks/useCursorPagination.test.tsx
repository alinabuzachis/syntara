import { act, renderHook } from '@testing-library/react'
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FilterConfig } from '../types/filters'

import { useCursorPagination, useCursorReset } from './useCursorPagination'
import { createFilterChangeHandler } from './useFilterChangeHandler'
import { useFilterState } from './useFilterState'

vi.mock('./useFilterState', () => ({
  useFilterState: vi.fn(() => ({
    filters: [],
    setFilter: vi.fn(),
    removeFilter: vi.fn(),
    clearAllFilters: vi.fn(),
    setAllFilters: vi.fn(),
  })),
}))

vi.mock('./useFilterChangeHandler', () => ({
  createFilterChangeHandler: vi.fn(() => vi.fn()),
}))

const mockUseFilterState = vi.mocked(useFilterState)
const mockCreateFilterChangeHandler = vi.mocked(createFilterChangeHandler)

describe('useCursorPagination', () => {
  let mockClearAllFilters: Mock
  let mockSetAllFilters: Mock

  beforeEach(() => {
    vi.clearAllMocks()

    mockClearAllFilters = vi.fn()
    mockSetAllFilters = vi.fn()

    mockUseFilterState.mockReturnValue({
      filters: [],
      setFilter: vi.fn(),
      removeFilter: vi.fn(),
      clearAllFilters: mockClearAllFilters,
      setAllFilters: mockSetAllFilters,
    })

    mockCreateFilterChangeHandler.mockReturnValue(vi.fn())
  })

  describe('default state', () => {
    it('starts with cursor as null', () => {
      const { result } = renderHook(() => useCursorPagination())

      expect(result.current.cursor).toBeNull()
    })

    it('starts with hasActiveFilters as false when no filters', () => {
      const { result } = renderHook(() => useCursorPagination())

      expect(result.current.hasActiveFilters).toBe(false)
    })

    it('includes limit and include_total in default queryParams', () => {
      const { result } = renderHook(() => useCursorPagination())

      expect(result.current.queryParams).toEqual({
        limit: 20,
        include_total: true,
      })
    })

    it('does not include cursor in queryParams when cursor is null', () => {
      const { result } = renderHook(() => useCursorPagination())

      expect(result.current.queryParams).not.toHaveProperty('cursor')
    })

    it('calls useFilterState with undefined when no defaultFilters provided', () => {
      renderHook(() => useCursorPagination())

      expect(mockUseFilterState).toHaveBeenCalledWith(undefined)
    })
  })

  describe('options', () => {
    it('uses custom limit when provided', () => {
      const { result } = renderHook(() => useCursorPagination({ limit: 50 }))

      expect(result.current.queryParams).toEqual({
        limit: 50,
        include_total: true,
      })
    })

    it('passes defaultFilters to useFilterState', () => {
      const defaultFilters: FilterConfig[] = [{ key: 'status', value: 'active' }]

      renderHook(() => useCursorPagination({ defaultFilters }))

      expect(mockUseFilterState).toHaveBeenCalledWith(defaultFilters)
    })

    it('merges extraParams into queryParams', () => {
      const { result } = renderHook(() =>
        useCursorPagination({
          extraParams: { provider_id: 'abc-123', sort: '-name' },
        })
      )

      expect(result.current.queryParams).toEqual({
        limit: 20,
        include_total: true,
        provider_id: 'abc-123',
        sort: '-name',
      })
    })

    it('passes transformFilters to createFilterChangeHandler', () => {
      const transformFilters = (filters: FilterConfig[]) => filters

      renderHook(() => useCursorPagination({ transformFilters }))

      expect(mockCreateFilterChangeHandler).toHaveBeenCalledWith(
        null,
        expect.any(Function),
        mockClearAllFilters,
        mockSetAllFilters,
        transformFilters
      )
    })
  })

  describe('hasActiveFilters', () => {
    it('returns true when filters are present', () => {
      mockUseFilterState.mockReturnValue({
        filters: [{ key: 'name', value: 'test' }],
        setFilter: vi.fn(),
        removeFilter: vi.fn(),
        clearAllFilters: mockClearAllFilters,
        setAllFilters: mockSetAllFilters,
      })

      const { result } = renderHook(() => useCursorPagination())

      expect(result.current.hasActiveFilters).toBe(true)
    })

    it('returns false when filters array is empty', () => {
      mockUseFilterState.mockReturnValue({
        filters: [],
        setFilter: vi.fn(),
        removeFilter: vi.fn(),
        clearAllFilters: mockClearAllFilters,
        setAllFilters: mockSetAllFilters,
      })

      const { result } = renderHook(() => useCursorPagination())

      expect(result.current.hasActiveFilters).toBe(false)
    })
  })

  describe('setCursor', () => {
    it('updates cursor state', () => {
      const { result } = renderHook(() => useCursorPagination())

      act(() => {
        result.current.setCursor('next-page-cursor')
      })

      expect(result.current.cursor).toBe('next-page-cursor')
    })

    it('includes cursor in queryParams after setting', () => {
      const { result } = renderHook(() => useCursorPagination())

      act(() => {
        result.current.setCursor('abc-cursor')
      })

      expect(result.current.queryParams).toEqual({
        limit: 20,
        include_total: true,
        cursor: 'abc-cursor',
      })
    })

    it('removes cursor from queryParams when set to null', () => {
      const { result } = renderHook(() => useCursorPagination())

      act(() => {
        result.current.setCursor('some-cursor')
      })

      expect(result.current.queryParams).toHaveProperty('cursor', 'some-cursor')

      act(() => {
        result.current.setCursor(null)
      })

      expect(result.current.queryParams).not.toHaveProperty('cursor')
    })
  })

  describe('queryParams', () => {
    it('includes filter params built from active filters', () => {
      mockUseFilterState.mockReturnValue({
        filters: [{ key: 'name', operator: 'contains', value: 'deploy' }],
        setFilter: vi.fn(),
        removeFilter: vi.fn(),
        clearAllFilters: mockClearAllFilters,
        setAllFilters: mockSetAllFilters,
      })

      const { result } = renderHook(() => useCursorPagination())

      expect(result.current.queryParams).toEqual({
        limit: 20,
        include_total: true,
        'name[contains]': 'deploy',
      })
    })

    it('combines filters, cursor, limit, and extraParams', () => {
      mockUseFilterState.mockReturnValue({
        filters: [{ key: 'status', value: 'active' }],
        setFilter: vi.fn(),
        removeFilter: vi.fn(),
        clearAllFilters: mockClearAllFilters,
        setAllFilters: mockSetAllFilters,
      })

      const { result } = renderHook(() =>
        useCursorPagination({
          limit: 10,
          extraParams: { sort: '-created_at' },
        })
      )

      act(() => {
        result.current.setCursor('page-2')
      })

      expect(result.current.queryParams).toEqual({
        limit: 10,
        include_total: true,
        sort: '-created_at',
        status: 'active',
        cursor: 'page-2',
      })
    })
  })

  describe('handleFilterChange', () => {
    it('delegates to createFilterChangeHandler result', () => {
      const mockHandler = vi.fn()
      mockCreateFilterChangeHandler.mockReturnValue(mockHandler)

      const { result } = renderHook(() => useCursorPagination())

      const newFilters: FilterConfig[] = [{ key: 'name', value: 'test' }]
      result.current.handleFilterChange(newFilters)

      expect(mockHandler).toHaveBeenCalledWith(newFilters)
    })

    it('creates handler with correct arguments', () => {
      renderHook(() => useCursorPagination())

      expect(mockCreateFilterChangeHandler).toHaveBeenCalledWith(
        null, // initial cursor
        expect.any(Function), // resetCursor
        mockClearAllFilters,
        mockSetAllFilters,
        undefined // no transformFilters
      )
    })
  })

  describe('handleClearAllFilters', () => {
    it('calls clearAllFilters from useFilterState', () => {
      const { result } = renderHook(() => useCursorPagination())

      act(() => {
        result.current.handleClearAllFilters()
      })

      expect(mockClearAllFilters).toHaveBeenCalledOnce()
    })

    it('resets cursor to null when cursor is set', () => {
      const { result } = renderHook(() => useCursorPagination())

      // Set a cursor first
      act(() => {
        result.current.setCursor('page-cursor')
      })

      expect(result.current.cursor).toBe('page-cursor')

      // Clear all filters should also reset cursor
      act(() => {
        result.current.handleClearAllFilters()
      })

      expect(result.current.cursor).toBeNull()
      expect(mockClearAllFilters).toHaveBeenCalledOnce()
    })

    it('still calls clearAllFilters when cursor is already null', () => {
      const { result } = renderHook(() => useCursorPagination())

      expect(result.current.cursor).toBeNull()

      act(() => {
        result.current.handleClearAllFilters()
      })

      expect(mockClearAllFilters).toHaveBeenCalledOnce()
    })
  })

  describe('getFooterProps', () => {
    it('returns hasNext true when data.next is a cursor string', () => {
      const { result } = renderHook(() => useCursorPagination())

      const footerProps = result.current.getFooterProps({ resources: [{}], prev: null, next: 'next-cursor' })

      expect(footerProps.hasNext).toBe(true)
    })

    it('returns hasNext false when data.next is null', () => {
      const { result } = renderHook(() => useCursorPagination())

      const footerProps = result.current.getFooterProps({ resources: [{}], prev: null, next: null })

      expect(footerProps.hasNext).toBe(false)
    })

    it('returns hasNext false when data is undefined', () => {
      const { result } = renderHook(() => useCursorPagination())

      const footerProps = result.current.getFooterProps(undefined)

      expect(footerProps.hasNext).toBe(false)
    })

    it('returns total from data', () => {
      const { result } = renderHook(() => useCursorPagination())

      const footerProps = result.current.getFooterProps({ resources: [{}], prev: null, next: null, total: 42 })

      expect(footerProps.total).toBe(42)
    })

    it('returns null total when data has no total', () => {
      const { result } = renderHook(() => useCursorPagination())

      const footerProps = result.current.getFooterProps({ resources: [{}] })

      expect(footerProps.total).toBeNull()
    })

    it('onPrev sets cursor to prev value', () => {
      const { result } = renderHook(() => useCursorPagination())

      const footerProps = result.current.getFooterProps({ resources: [{}], prev: 'prev-cursor', next: 'next-cursor' })

      act(() => {
        footerProps.onPrev()
      })

      expect(result.current.cursor).toBe('prev-cursor')
    })

    it('onNext sets cursor to next value', () => {
      const { result } = renderHook(() => useCursorPagination())

      const footerProps = result.current.getFooterProps({ resources: [{}], prev: 'prev-cursor', next: 'next-cursor' })

      act(() => {
        footerProps.onNext()
      })

      expect(result.current.cursor).toBe('next-cursor')
    })

    it('onPrev sets cursor to null when prev is null', () => {
      const { result } = renderHook(() => useCursorPagination())

      act(() => {
        result.current.setCursor('some-cursor')
      })

      const footerProps = result.current.getFooterProps({ resources: [{}], prev: null, next: null })

      act(() => {
        footerProps.onPrev()
      })

      expect(result.current.cursor).toBeNull()
    })

    it('onNext sets cursor to null when next is undefined on data', () => {
      const { result } = renderHook(() => useCursorPagination())

      act(() => {
        result.current.setCursor('some-cursor')
      })

      const footerProps = result.current.getFooterProps({ resources: [{}] })

      act(() => {
        footerProps.onNext()
      })

      expect(result.current.cursor).toBeNull()
    })
  })

  describe('filters passthrough', () => {
    it('exposes filters from useFilterState', () => {
      const activeFilters: FilterConfig[] = [
        { key: 'name', operator: 'contains', value: 'deploy' },
        { key: 'status', value: 'active' },
      ]

      mockUseFilterState.mockReturnValue({
        filters: activeFilters,
        setFilter: vi.fn(),
        removeFilter: vi.fn(),
        clearAllFilters: mockClearAllFilters,
        setAllFilters: mockSetAllFilters,
      })

      const { result } = renderHook(() => useCursorPagination())

      expect(result.current.filters).toEqual(activeFilters)
    })
  })
})

describe('useCursorReset', () => {
  it('resets pagination when all conditions are met', () => {
    const resetPagination = vi.fn()

    renderHook(() => useCursorReset(0, false, 'some-cursor', false, resetPagination))

    expect(resetPagination).toHaveBeenCalled()
  })

  it('does not reset when itemCount is greater than 0', () => {
    const resetPagination = vi.fn()

    renderHook(() => useCursorReset(5, false, 'some-cursor', false, resetPagination))

    expect(resetPagination).not.toHaveBeenCalled()
  })

  it('does not reset when filters are active', () => {
    const resetPagination = vi.fn()

    renderHook(() => useCursorReset(0, true, 'some-cursor', false, resetPagination))

    expect(resetPagination).not.toHaveBeenCalled()
  })

  it('does not reset when cursor is null', () => {
    const resetPagination = vi.fn()

    renderHook(() => useCursorReset(0, false, null, false, resetPagination))

    expect(resetPagination).not.toHaveBeenCalled()
  })

  it('does not reset when query is fetching', () => {
    const resetPagination = vi.fn()

    renderHook(() => useCursorReset(0, false, 'some-cursor', true, resetPagination))

    expect(resetPagination).not.toHaveBeenCalled()
  })

  it('resets pagination when conditions change from non-reset to reset', () => {
    const resetPagination = vi.fn()

    const { rerender } = renderHook(
      ({ itemCount, isFetching }) => useCursorReset(itemCount, false, 'cursor-val', isFetching, resetPagination),
      {
        initialProps: { itemCount: 5, isFetching: false },
      }
    )

    expect(resetPagination).not.toHaveBeenCalled()

    rerender({ itemCount: 0, isFetching: false })

    expect(resetPagination).toHaveBeenCalled()
  })

  it('does not reset when isFetching transitions from false to true with 0 items', () => {
    const resetPagination = vi.fn()

    const { rerender } = renderHook(
      ({ isFetching }) => useCursorReset(0, false, 'cursor-val', isFetching, resetPagination),
      {
        initialProps: { isFetching: false },
      }
    )

    expect(resetPagination).toHaveBeenCalled()
    resetPagination.mockClear()

    rerender({ isFetching: true })

    expect(resetPagination).not.toHaveBeenCalled()
  })
})
