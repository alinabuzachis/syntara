import { SortByDirection } from '@patternfly/react-table'
import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SortableColumn, SortConfig } from '../types/sorting'

import { useSortableTable } from './useSortableTable'
import { useSortState } from './useSortState'

const { mockSetSort, mockToggleSort, mockClearSort } = vi.hoisted(() => ({
  mockSetSort: vi.fn(),
  mockToggleSort: vi.fn(),
  mockClearSort: vi.fn(),
}))

let mockSort: SortConfig | null = null

vi.mock('./useSortState', () => ({
  useSortState: vi.fn(() => ({
    sort: mockSort,
    setSort: mockSetSort,
    clearSort: mockClearSort,
    toggleSort: mockToggleSort,
  })),
}))

const columns: SortableColumn[] = [
  { field: 'name', label: 'Name', isSortable: true },
  { field: 'status', label: 'Status' },
  { field: 'created_at', label: 'Created', isSortable: true },
]

describe('useSortableTable', () => {
  beforeEach(() => {
    mockSort = null
    mockSetSort.mockClear()
    mockToggleSort.mockClear()
    mockClearSort.mockClear()
    vi.mocked(useSortState).mockClear()
  })

  describe('useSortState integration', () => {
    it('should pass defaultSort to useSortState', () => {
      const defaultSort: SortConfig = { field: 'name', direction: 'asc' }

      renderHook(() => useSortableTable(columns, defaultSort))

      expect(useSortState).toHaveBeenCalledWith(defaultSort, undefined)
    })

    it('should call useSortState without default when omitted', () => {
      renderHook(() => useSortableTable(columns))

      expect(useSortState).toHaveBeenCalledWith(undefined, undefined)
    })

    it('should pass paramName options through to useSortState', () => {
      const defaultSort: SortConfig = { field: 'timestamp', direction: 'asc' }

      renderHook(() => useSortableTable(columns, defaultSort, { paramName: 'activity_sort' }))

      expect(useSortState).toHaveBeenCalledWith(defaultSort, { paramName: 'activity_sort' })
    })

    it('should return current sort config from useSortState', () => {
      mockSort = { field: 'created_at', direction: 'desc' }

      const { result } = renderHook(() => useSortableTable(columns))

      expect(result.current.sort).toEqual({ field: 'created_at', direction: 'desc' })
    })
  })

  describe('sortParam', () => {
    it('should return undefined when unsorted', () => {
      mockSort = null

      const { result } = renderHook(() => useSortableTable(columns))

      expect(result.current.sortParam).toBeUndefined()
    })

    it('should return ascending API sort param for useFilteredQuery', () => {
      mockSort = { field: 'name', direction: 'asc' }

      const { result } = renderHook(() => useSortableTable(columns))

      expect(result.current.sortParam).toBe('name')
    })

    it('should return descending API sort param for useFilteredQuery', () => {
      mockSort = { field: 'created_at', direction: 'desc' }

      const { result } = renderHook(() => useSortableTable(columns))

      expect(result.current.sortParam).toBe('-created_at')
    })
  })

  describe('getSortParams', () => {
    it('should return correct PatternFly format for a sortable column', () => {
      mockSort = { field: 'name', direction: 'asc' }

      const { result } = renderHook(() => useSortableTable(columns))
      const sortParams = result.current.getSortParams('name')

      expect(sortParams).toEqual(
        expect.objectContaining({
          sortBy: {
            index: 0,
            direction: 'asc',
            defaultDirection: 'asc',
          },
          columnIndex: 0,
        })
      )
      expect(sortParams?.onSort).toEqual(expect.any(Function))
    })

    it('should map non-zero column indexes for later sortable columns', () => {
      mockSort = { field: 'created_at', direction: 'desc' }

      const { result } = renderHook(() => useSortableTable(columns))
      const sortParams = result.current.getSortParams('created_at')

      expect(sortParams).toEqual(
        expect.objectContaining({
          sortBy: {
            index: 2,
            direction: 'desc',
            defaultDirection: 'asc',
          },
          columnIndex: 2,
        })
      )
    })

    it('should return undefined for a non-sortable column', () => {
      const { result } = renderHook(() => useSortableTable(columns))

      expect(result.current.getSortParams('status')).toBeUndefined()
    })

    it('should return undefined for an unknown column field', () => {
      const { result } = renderHook(() => useSortableTable(columns))

      expect(result.current.getSortParams('unknown')).toBeUndefined()
    })

    it('should leave active sort index undefined when unsorted', () => {
      mockSort = null

      const { result } = renderHook(() => useSortableTable(columns))
      const sortParams = result.current.getSortParams('name')

      expect(sortParams?.sortBy.index).toBeUndefined()
      expect(sortParams?.sortBy.direction).toBe('asc')
    })

    it('should update sort state via setSort when PatternFly onSort fires', () => {
      mockSort = { field: 'name', direction: 'asc' }

      const { result } = renderHook(() => useSortableTable(columns))
      const sortParams = result.current.getSortParams('name')

      act(() => {
        sortParams!.onSort!(new MouseEvent('click') as never, 0, SortByDirection.desc, {})
      })

      expect(mockSetSort).toHaveBeenCalledTimes(1)
      expect(mockSetSort).toHaveBeenCalledWith({ field: 'name', direction: 'desc' })
    })

    it('should set ascending sort for a different column via onSort', () => {
      mockSort = { field: 'name', direction: 'desc' }

      const { result } = renderHook(() => useSortableTable(columns))
      const sortParams = result.current.getSortParams('created_at')

      act(() => {
        sortParams!.onSort!(new MouseEvent('click') as never, 2, SortByDirection.asc, {})
      })

      expect(mockSetSort).toHaveBeenCalledWith({ field: 'created_at', direction: 'asc' })
    })
  })

  describe('handleSort', () => {
    it('should update sort state via toggleSort', () => {
      mockSort = { field: 'name', direction: 'asc' }

      const { result } = renderHook(() => useSortableTable(columns))

      act(() => {
        result.current.handleSort('name')
      })

      expect(mockToggleSort).toHaveBeenCalledTimes(1)
      expect(mockToggleSort).toHaveBeenCalledWith('name')
    })

    it('should toggle direction when clicking the same column', () => {
      mockSort = { field: 'name', direction: 'asc' }
      mockToggleSort.mockImplementation((field: string) => {
        if (mockSort !== null && mockSort.field === field) {
          mockSort = {
            field,
            direction: mockSort.direction === 'asc' ? 'desc' : 'asc',
          }
        }
      })

      const { result, rerender } = renderHook(() => useSortableTable(columns))

      act(() => {
        result.current.handleSort('name')
      })
      rerender()

      expect(mockToggleSort).toHaveBeenCalledWith('name')
      expect(result.current.sort).toEqual({ field: 'name', direction: 'desc' })
    })

    it('should reset to ascending when clicking a different column', () => {
      mockSort = { field: 'name', direction: 'desc' }
      mockToggleSort.mockImplementation((field: string) => {
        if (mockSort !== null && mockSort.field === field) {
          mockSort = {
            field,
            direction: mockSort.direction === 'asc' ? 'desc' : 'asc',
          }
          return
        }
        mockSort = { field, direction: 'asc' }
      })

      const { result, rerender } = renderHook(() => useSortableTable(columns))

      act(() => {
        result.current.handleSort('created_at')
      })
      rerender()

      expect(mockToggleSort).toHaveBeenCalledWith('created_at')
      expect(result.current.sort).toEqual({ field: 'created_at', direction: 'asc' })
    })

    it('should be a no-op for non-sortable columns', () => {
      const { result } = renderHook(() => useSortableTable(columns))

      act(() => {
        result.current.handleSort('status')
      })

      expect(mockToggleSort).not.toHaveBeenCalled()
    })

    it('should be a no-op for unknown column fields', () => {
      const { result } = renderHook(() => useSortableTable(columns))

      act(() => {
        result.current.handleSort('missing')
      })

      expect(mockToggleSort).not.toHaveBeenCalled()
    })
  })

  describe('URL updates on sort change', () => {
    it('should persist sort through useSortState setSort (URL sync)', () => {
      mockSort = null

      const { result } = renderHook(() => useSortableTable(columns))
      const sortParams = result.current.getSortParams('name')

      act(() => {
        sortParams!.onSort!(new MouseEvent('click') as never, 0, SortByDirection.asc, {})
      })

      // useSortState owns URL writes; asserting setSort is how this hook triggers them
      expect(mockSetSort).toHaveBeenCalledWith({ field: 'name', direction: 'asc' })
    })

    it('should persist sort through useSortState toggleSort (URL sync)', () => {
      mockSort = { field: 'name', direction: 'asc' }

      const { result } = renderHook(() => useSortableTable(columns))

      act(() => {
        result.current.handleSort('name')
      })

      expect(mockToggleSort).toHaveBeenCalledWith('name')
    })
  })
})
