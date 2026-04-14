import { act, render, renderHook } from '@testing-library/react'
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
    it('returns singular label when itemCount is 1', () => {
      const { result } = renderHook(() => useCursorPagination())

      const footerProps = result.current.getFooterProps(
        { resources: [{}], prev: null, next: null, total: 1 },
        1,
        'workflow',
        'workflows'
      )

      // content is a React element; extract text from the fragment
      const { container } = renderContent(footerProps.content)
      expect(container.textContent).toContain('1 workflow')
      expect(container.textContent).not.toContain('1 workflows')
    })

    it('returns plural label when itemCount is not 1', () => {
      const { result } = renderHook(() => useCursorPagination())

      const footerProps = result.current.getFooterProps(
        { resources: [{}, {}], prev: null, next: null, total: 2 },
        2,
        'workflow',
        'workflows'
      )

      const { container } = renderContent(footerProps.content)
      expect(container.textContent).toContain('2 workflows')
    })

    it('returns plural label when itemCount is 0', () => {
      const { result } = renderHook(() => useCursorPagination())

      const footerProps = result.current.getFooterProps(
        { resources: [], prev: null, next: null, total: 0 },
        0,
        'credential',
        'credentials'
      )

      const { container } = renderContent(footerProps.content)
      expect(container.textContent).toContain('0 credentials')
    })

    it('shows total count when total exceeds itemCount', () => {
      const { result } = renderHook(() => useCursorPagination())

      const footerProps = result.current.getFooterProps(
        { resources: Array.from<unknown>({ length: 20 }), prev: null, next: 'next-cursor', total: 100 },
        20,
        'item',
        'items'
      )

      const { container } = renderContent(footerProps.content)
      expect(container.textContent).toContain('20 items')
      expect(container.textContent).toContain('of 100 total')
    })

    it('does not show total count when total equals itemCount', () => {
      const { result } = renderHook(() => useCursorPagination())

      const footerProps = result.current.getFooterProps(
        { resources: Array.from<unknown>({ length: 5 }), prev: null, next: null, total: 5 },
        5,
        'item',
        'items'
      )

      const { container } = renderContent(footerProps.content)
      expect(container.textContent).not.toContain('total')
    })

    it('does not show total count when total is null', () => {
      const { result } = renderHook(() => useCursorPagination())

      const footerProps = result.current.getFooterProps(
        { resources: [{}, {}], prev: null, next: null, total: null },
        2,
        'item',
        'items'
      )

      const { container } = renderContent(footerProps.content)
      expect(container.textContent).not.toContain('total')
    })

    it('does not show total count when total is undefined', () => {
      const { result } = renderHook(() => useCursorPagination())

      const footerProps = result.current.getFooterProps({ resources: [{}], prev: null, next: null }, 1, 'item', 'items')

      const { container } = renderContent(footerProps.content)
      expect(container.textContent).not.toContain('total')
    })

    it('returns prev and next cursors from data', () => {
      const { result } = renderHook(() => useCursorPagination())

      const footerProps = result.current.getFooterProps(
        { resources: [{}], prev: 'prev-cursor', next: 'next-cursor', total: 50 },
        20,
        'item',
        'items'
      )

      expect(footerProps.prev).toBe('prev-cursor')
      expect(footerProps.next).toBe('next-cursor')
    })

    it('returns null for prev and next when data is undefined', () => {
      const { result } = renderHook(() => useCursorPagination())

      const footerProps = result.current.getFooterProps(undefined, 0, 'item', 'items')

      expect(footerProps.prev).toBeNull()
      expect(footerProps.next).toBeNull()
    })

    it('returns null for prev and next when cursors are null', () => {
      const { result } = renderHook(() => useCursorPagination())

      const footerProps = result.current.getFooterProps({ resources: [{}], prev: null, next: null }, 1, 'item', 'items')

      expect(footerProps.prev).toBeNull()
      expect(footerProps.next).toBeNull()
    })

    it('onPrev sets cursor to prev value', () => {
      const { result } = renderHook(() => useCursorPagination())

      const footerProps = result.current.getFooterProps(
        { resources: [{}], prev: 'prev-cursor', next: 'next-cursor' },
        1,
        'item',
        'items'
      )

      act(() => {
        footerProps.onPrev()
      })

      expect(result.current.cursor).toBe('prev-cursor')
    })

    it('onNext sets cursor to next value', () => {
      const { result } = renderHook(() => useCursorPagination())

      const footerProps = result.current.getFooterProps(
        { resources: [{}], prev: 'prev-cursor', next: 'next-cursor' },
        1,
        'item',
        'items'
      )

      act(() => {
        footerProps.onNext()
      })

      expect(result.current.cursor).toBe('next-cursor')
    })

    it('onPrev sets cursor to null when prev is null', () => {
      const { result } = renderHook(() => useCursorPagination())

      // First set a cursor so we can verify it gets cleared
      act(() => {
        result.current.setCursor('some-cursor')
      })

      const footerProps = result.current.getFooterProps({ resources: [{}], prev: null, next: null }, 1, 'item', 'items')

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

      const footerProps = result.current.getFooterProps({ resources: [{}] }, 1, 'item', 'items')

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
  it('resets cursor when all conditions are met', () => {
    // Arrange
    const setCursor = vi.fn()

    // Act
    renderHook(() => useCursorReset(0, false, 'some-cursor', false, setCursor))

    // Assert
    expect(setCursor).toHaveBeenCalledWith(null)
  })

  it('does not reset cursor when itemCount is greater than 0', () => {
    const setCursor = vi.fn()

    renderHook(() => useCursorReset(5, false, 'some-cursor', false, setCursor))

    expect(setCursor).not.toHaveBeenCalled()
  })

  it('does not reset cursor when filters are active', () => {
    const setCursor = vi.fn()

    renderHook(() => useCursorReset(0, true, 'some-cursor', false, setCursor))

    expect(setCursor).not.toHaveBeenCalled()
  })

  it('does not reset cursor when cursor is null', () => {
    const setCursor = vi.fn()

    renderHook(() => useCursorReset(0, false, null, false, setCursor))

    expect(setCursor).not.toHaveBeenCalled()
  })

  it('does not reset cursor when query is fetching', () => {
    const setCursor = vi.fn()

    renderHook(() => useCursorReset(0, false, 'some-cursor', true, setCursor))

    expect(setCursor).not.toHaveBeenCalled()
  })

  it('resets cursor when conditions change from non-reset to reset', () => {
    const setCursor = vi.fn()

    const { rerender } = renderHook(
      ({ itemCount, isFetching }) => useCursorReset(itemCount, false, 'cursor-val', isFetching, setCursor),
      {
        initialProps: { itemCount: 5, isFetching: false },
      }
    )

    // Should not reset when itemCount > 0
    expect(setCursor).not.toHaveBeenCalled()

    // Rerender with 0 items — should trigger reset
    rerender({ itemCount: 0, isFetching: false })

    expect(setCursor).toHaveBeenCalledWith(null)
  })

  it('does not reset when isFetching transitions from false to true with 0 items', () => {
    const setCursor = vi.fn()

    const { rerender } = renderHook(({ isFetching }) => useCursorReset(0, false, 'cursor-val', isFetching, setCursor), {
      initialProps: { isFetching: false },
    })

    // First render: 0 items, not fetching, cursor set => resets
    expect(setCursor).toHaveBeenCalledWith(null)
    setCursor.mockClear()

    // Rerender with fetching=true => should not reset
    rerender({ isFetching: true })

    expect(setCursor).not.toHaveBeenCalled()
  })
})

/**
 * Helper to render React content (ReactNode) and return the container for text assertions.
 */
function renderContent(content: React.ReactNode) {
  return render(<>{content}</>)
}
