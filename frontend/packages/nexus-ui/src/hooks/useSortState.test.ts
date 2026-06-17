import { SortByDirection } from '@patternfly/react-table'
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { useSortState } from './useSortState'

const mockNavigate = vi.fn()
let mockSearch = ''
let mockLocation = '/system-administration/access-management/roles'

vi.mock('./routing/useLocation', () => ({
  useLocation: () => mockLocation,
}))
vi.mock('./routing/useNavigate', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('./routing/useSearch', () => ({
  useSearch: () => mockSearch,
}))

const sortFieldByColumn: Record<number, string> = {
  0: 'name',
  2: 'description',
  3: 'is_builtin',
}

describe('useSortState', () => {
  beforeEach(() => {
    mockSearch = ''
    mockLocation = '/system-administration/access-management/roles'
    mockNavigate.mockClear()
    // Sync window.location.search for live-read in onSort
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
      mockSearch = '?sort=name'

      const { result } = renderHook(() => useSortState(sortFieldByColumn))

      expect(result.current.activeSortIndex).toBe(0)
      expect(result.current.sortDirection).toBe('asc')
      expect(result.current.sortParam).toBe('name')
    })

    it('should parse descending sort from URL', () => {
      mockSearch = '?sort=-name'

      const { result } = renderHook(() => useSortState(sortFieldByColumn))

      expect(result.current.activeSortIndex).toBe(0)
      expect(result.current.sortDirection).toBe('desc')
      expect(result.current.sortParam).toBe('-name')
    })

    it('should parse non-zero column index', () => {
      mockSearch = '?sort=is_builtin'

      const { result } = renderHook(() => useSortState(sortFieldByColumn))

      expect(result.current.activeSortIndex).toBe(3)
      expect(result.current.sortDirection).toBe('asc')
    })

    it('should return undefined activeSortIndex for unknown sort field', () => {
      mockSearch = '?sort=unknown_field'

      const { result } = renderHook(() => useSortState(sortFieldByColumn))

      expect(result.current.activeSortIndex).toBeUndefined()
      expect(result.current.sortParam).toBeUndefined()
    })
  })

  describe('getSortParams', () => {
    it('should return correct sort params for a column', () => {
      mockSearch = '?sort=name'

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

      expect(mockNavigate).toHaveBeenCalledTimes(1)
      const navigatedUrl = mockNavigate.mock.calls[0][0] as string
      const params = new URLSearchParams(navigatedUrl.split('?')[1])
      expect(params.get('sort')).toBe('name')
    })

    it('should write descending sort param to URL on sort', () => {
      const { result } = renderHook(() => useSortState(sortFieldByColumn))
      const sortParams = result.current.getSortParams(0)

      act(() => {
        sortParams!.onSort!(new MouseEvent('click') as never, 0, SortByDirection.desc, {})
      })

      expect(mockNavigate).toHaveBeenCalledTimes(1)
      const navigatedUrl = mockNavigate.mock.calls[0][0] as string
      const params = new URLSearchParams(navigatedUrl.split('?')[1])
      expect(params.get('sort')).toBe('-name')
    })

    it('should ignore sort for unknown column index', () => {
      const { result } = renderHook(() => useSortState(sortFieldByColumn))
      const sortParams = result.current.getSortParams(99)

      act(() => {
        sortParams!.onSort!(new MouseEvent('click') as never, 99, SortByDirection.asc, {})
      })

      expect(mockNavigate).not.toHaveBeenCalled()
    })

    it('should preserve other search params when sorting', () => {
      mockSearch = '?name%5Bcontains%5D=deploy&sort=name'
      // Sync window.location.search so onSort reads live params
      Object.defineProperty(window, 'location', {
        value: { ...window.location, search: '?name%5Bcontains%5D=deploy&sort=name' },
        writable: true,
      })

      const { result } = renderHook(() => useSortState(sortFieldByColumn))
      const sortParams = result.current.getSortParams(3)

      act(() => {
        sortParams!.onSort!(new MouseEvent('click') as never, 3, SortByDirection.desc, {})
      })

      expect(mockNavigate).toHaveBeenCalledTimes(1)
      const navigatedUrl = mockNavigate.mock.calls[0][0] as string
      const params = new URLSearchParams(navigatedUrl.split('?')[1])
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
