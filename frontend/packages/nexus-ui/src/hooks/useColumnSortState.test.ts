import { SortByDirection } from '@patternfly/react-table'
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { useColumnSortState } from './useColumnSortState'

const mockSetSearchParams = vi.fn()
let mockSearchParams = new URLSearchParams()

vi.mock('./routing/useSearchParams', () => ({
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
}))

const sortFieldByColumn: Record<number, string> = {
  0: 'name',
  2: 'description',
  3: 'is_builtin',
}

describe('useColumnSortState', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams()
    mockSetSearchParams.mockClear()
  })

  describe('parsing', () => {
    it('should return undefined activeSortIndex when no sort param in URL', () => {
      const { result } = renderHook(() => useColumnSortState(sortFieldByColumn))

      expect(result.current.activeSortIndex).toBeUndefined()
      expect(result.current.sortDirection).toBe('asc')
      expect(result.current.sortParam).toBeUndefined()
    })

    it('should parse ascending sort from URL', () => {
      mockSearchParams = new URLSearchParams('sort=name')

      const { result } = renderHook(() => useColumnSortState(sortFieldByColumn))

      expect(result.current.activeSortIndex).toBe(0)
      expect(result.current.sortDirection).toBe('asc')
      expect(result.current.sortParam).toBe('name')
    })

    it('should parse descending sort from URL', () => {
      mockSearchParams = new URLSearchParams('sort=-name')

      const { result } = renderHook(() => useColumnSortState(sortFieldByColumn))

      expect(result.current.activeSortIndex).toBe(0)
      expect(result.current.sortDirection).toBe('desc')
      expect(result.current.sortParam).toBe('-name')
    })

    it('should parse non-zero column index', () => {
      mockSearchParams = new URLSearchParams('sort=is_builtin')

      const { result } = renderHook(() => useColumnSortState(sortFieldByColumn))

      expect(result.current.activeSortIndex).toBe(3)
      expect(result.current.sortDirection).toBe('asc')
    })

    it('should return undefined activeSortIndex for unknown sort field', () => {
      mockSearchParams = new URLSearchParams('sort=unknown_field')

      const { result } = renderHook(() => useColumnSortState(sortFieldByColumn))

      expect(result.current.activeSortIndex).toBeUndefined()
      expect(result.current.sortParam).toBeUndefined()
    })

    it('should treat empty sort param as unsorted', () => {
      mockSearchParams = new URLSearchParams('sort=')

      const { result } = renderHook(() => useColumnSortState(sortFieldByColumn))

      expect(result.current.activeSortIndex).toBeUndefined()
      expect(result.current.sortDirection).toBe('asc')
      expect(result.current.sortParam).toBeUndefined()
    })

    it('should build descending sortParam for a non-zero column', () => {
      mockSearchParams = new URLSearchParams('sort=-description')

      const { result } = renderHook(() => useColumnSortState(sortFieldByColumn))

      expect(result.current.activeSortIndex).toBe(2)
      expect(result.current.sortDirection).toBe('desc')
      expect(result.current.sortParam).toBe('-description')
    })

    it('should treat bare "-" sort param as unknown field', () => {
      mockSearchParams = new URLSearchParams('sort=-')

      const { result } = renderHook(() => useColumnSortState(sortFieldByColumn))

      expect(result.current.activeSortIndex).toBeUndefined()
      expect(result.current.sortParam).toBeUndefined()
    })
  })

  describe('getSortParams', () => {
    it('should return correct sort params for a column', () => {
      mockSearchParams = new URLSearchParams('sort=name')

      const { result } = renderHook(() => useColumnSortState(sortFieldByColumn))
      const sortParams = result.current.getSortParams(0)

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
    })

    it('should write ascending sort param to URL on sort', () => {
      const { result } = renderHook(() => useColumnSortState(sortFieldByColumn))
      const sortParams = result.current.getSortParams(0)

      act(() => {
        sortParams!.onSort!(new MouseEvent('click') as never, 0, SortByDirection.asc, {})
      })

      expect(mockSetSearchParams).toHaveBeenCalledTimes(1)
      const params = mockSetSearchParams.mock.calls[0][0] as URLSearchParams
      expect(params.get('sort')).toBe('name')
    })

    it('should write descending sort param to URL on sort', () => {
      const { result } = renderHook(() => useColumnSortState(sortFieldByColumn))
      const sortParams = result.current.getSortParams(0)

      act(() => {
        sortParams!.onSort!(new MouseEvent('click') as never, 0, SortByDirection.desc, {})
      })

      expect(mockSetSearchParams).toHaveBeenCalledTimes(1)
      const params = mockSetSearchParams.mock.calls[0][0] as URLSearchParams
      expect(params.get('sort')).toBe('-name')
    })

    it('should ignore sort for unknown column index', () => {
      const { result } = renderHook(() => useColumnSortState(sortFieldByColumn))
      const sortParams = result.current.getSortParams(99)

      act(() => {
        sortParams!.onSort!(new MouseEvent('click') as never, 99, SortByDirection.asc, {})
      })

      expect(mockSetSearchParams).not.toHaveBeenCalled()
    })

    it('should preserve other search params when sorting', () => {
      mockSearchParams = new URLSearchParams('name%5Bcontains%5D=deploy&sort=name')

      const { result } = renderHook(() => useColumnSortState(sortFieldByColumn))
      const sortParams = result.current.getSortParams(3)

      act(() => {
        sortParams!.onSort!(new MouseEvent('click') as never, 3, SortByDirection.desc, {})
      })

      expect(mockSetSearchParams).toHaveBeenCalledTimes(1)
      const params = mockSetSearchParams.mock.calls[0][0] as URLSearchParams
      expect(params.get('sort')).toBe('-is_builtin')
      expect(params.get('name[contains]')).toBe('deploy')
    })
  })

  describe('onSortChange callback', () => {
    it('should call onSortChange when sort changes', () => {
      const onSortChange = vi.fn()
      const { result } = renderHook(() => useColumnSortState(sortFieldByColumn, onSortChange))
      const sortParams = result.current.getSortParams(0)

      act(() => {
        sortParams!.onSort!(new MouseEvent('click') as never, 0, SortByDirection.asc, {})
      })

      expect(onSortChange).toHaveBeenCalledTimes(1)
    })

    it('should not call onSortChange for unknown column', () => {
      const onSortChange = vi.fn()
      const { result } = renderHook(() => useColumnSortState(sortFieldByColumn, onSortChange))
      const sortParams = result.current.getSortParams(99)

      act(() => {
        sortParams!.onSort!(new MouseEvent('click') as never, 99, SortByDirection.asc, {})
      })

      expect(onSortChange).not.toHaveBeenCalled()
    })

    it('should update URL without onSortChange when callback is omitted', () => {
      const { result } = renderHook(() => useColumnSortState(sortFieldByColumn))
      const sortParams = result.current.getSortParams(2)

      act(() => {
        sortParams!.onSort!(new MouseEvent('click') as never, 2, SortByDirection.desc, {})
      })

      expect(mockSetSearchParams).toHaveBeenCalledTimes(1)
      const params = mockSetSearchParams.mock.calls[0][0] as URLSearchParams
      expect(params.get('sort')).toBe('-description')
    })
  })
})
