import { SortByDirection } from '@patternfly/react-table'
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { useSortState } from './useSortState'

const mockSetSearchParams = vi.fn()
let mockSearchStr = ''

vi.mock('./routing/useSearchParams', () => ({
  useSearchParams: () => [new URLSearchParams(mockSearchStr), mockSetSearchParams] as const,
}))

const sortFieldByColumn: Record<number, string> = {
  0: 'name',
  2: 'description',
  3: 'is_builtin',
}

describe('useSortState', () => {
  beforeEach(() => {
    mockSearchStr = ''
    mockSetSearchParams.mockClear()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '' },
      writable: true,
    })
  })

  describe('parsing', () => {
    it('should return undefined activeSortIndex when no sort param in URL', () => {
      const { result } = renderHook(() => useSortState(sortFieldByColumn))

      expect(result.current.activeSortIndex).toBeUndefined()
      expect(result.current.sortDirection).toBe('asc')
      expect(result.current.sortParam).toBeUndefined()
    })

    it('should parse ascending sort from URL', () => {
      mockSearchStr = '?sort=name'

      const { result } = renderHook(() => useSortState(sortFieldByColumn))

      expect(result.current.activeSortIndex).toBe(0)
      expect(result.current.sortDirection).toBe('asc')
      expect(result.current.sortParam).toBe('name')
    })

    it('should parse descending sort from URL', () => {
      mockSearchStr = '?sort=-name'

      const { result } = renderHook(() => useSortState(sortFieldByColumn))

      expect(result.current.activeSortIndex).toBe(0)
      expect(result.current.sortDirection).toBe('desc')
      expect(result.current.sortParam).toBe('-name')
    })

    it('should parse non-zero column index', () => {
      mockSearchStr = '?sort=is_builtin'

      const { result } = renderHook(() => useSortState(sortFieldByColumn))

      expect(result.current.activeSortIndex).toBe(3)
      expect(result.current.sortDirection).toBe('asc')
    })

    it('should return undefined activeSortIndex for unknown sort field', () => {
      mockSearchStr = '?sort=unknown_field'

      const { result } = renderHook(() => useSortState(sortFieldByColumn))

      expect(result.current.activeSortIndex).toBeUndefined()
      expect(result.current.sortParam).toBeUndefined()
    })
  })

  describe('getSortParams', () => {
    it('should return correct sort params for a column', () => {
      mockSearchStr = '?sort=name'

      const { result } = renderHook(() => useSortState(sortFieldByColumn))
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
      const { result } = renderHook(() => useSortState(sortFieldByColumn))
      const sortParams = result.current.getSortParams(0)

      act(() => {
        sortParams!.onSort!(new MouseEvent('click') as never, 0, SortByDirection.asc, {})
      })

      expect(mockSetSearchParams).toHaveBeenCalledTimes(1)
      const params = mockSetSearchParams.mock.calls[0][0] as URLSearchParams
      expect(params.get('sort')).toBe('name')
    })

    it('should write descending sort param to URL on sort', () => {
      const { result } = renderHook(() => useSortState(sortFieldByColumn))
      const sortParams = result.current.getSortParams(0)

      act(() => {
        sortParams!.onSort!(new MouseEvent('click') as never, 0, SortByDirection.desc, {})
      })

      expect(mockSetSearchParams).toHaveBeenCalledTimes(1)
      const params = mockSetSearchParams.mock.calls[0][0] as URLSearchParams
      expect(params.get('sort')).toBe('-name')
    })

    it('should ignore sort for unknown column index', () => {
      const { result } = renderHook(() => useSortState(sortFieldByColumn))
      const sortParams = result.current.getSortParams(99)

      act(() => {
        sortParams!.onSort!(new MouseEvent('click') as never, 99, SortByDirection.asc, {})
      })

      expect(mockSetSearchParams).not.toHaveBeenCalled()
    })

    it('should preserve other search params when sorting', () => {
      mockSearchStr = '?name%5Bcontains%5D=deploy&sort=name'
      Object.defineProperty(window, 'location', {
        value: { ...window.location, search: '?name%5Bcontains%5D=deploy&sort=name' },
        writable: true,
      })

      const { result } = renderHook(() => useSortState(sortFieldByColumn))
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
      const { result } = renderHook(() => useSortState(sortFieldByColumn, onSortChange))
      const sortParams = result.current.getSortParams(0)

      act(() => {
        sortParams!.onSort!(new MouseEvent('click') as never, 0, SortByDirection.asc, {})
      })

      expect(onSortChange).toHaveBeenCalledTimes(1)
    })

    it('should not call onSortChange for unknown column', () => {
      const onSortChange = vi.fn()
      const { result } = renderHook(() => useSortState(sortFieldByColumn, onSortChange))
      const sortParams = result.current.getSortParams(99)

      act(() => {
        sortParams!.onSort!(new MouseEvent('click') as never, 99, SortByDirection.asc, {})
      })

      expect(onSortChange).not.toHaveBeenCalled()
    })
  })
})
