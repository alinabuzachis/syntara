import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { SortConfig } from '../types/sorting'

import { useSortState } from './useSortState'

// Mock the app's useSearchParams bridge (TanStack Router). Story wording refers to
// react-router-dom; this project routes search params through ./routing/useSearchParams.
const mockSetSearchParams = vi.fn()
let mockSearchParams = new URLSearchParams()

vi.mock('./routing/useSearchParams', () => ({
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
}))

describe('useSortState', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams()
    mockSetSearchParams.mockClear()
  })

  describe('sort', () => {
    it('should return null when no sort in URL and no default', () => {
      const { result } = renderHook(() => useSortState())

      expect(result.current.sort).toBeNull()
    })

    it('should deserialize ascending sort from URL on mount', () => {
      mockSearchParams = new URLSearchParams('sort=name')

      const { result } = renderHook(() => useSortState())

      expect(result.current.sort).toEqual({ field: 'name', direction: 'asc' })
    })

    it('should deserialize descending sort from URL on mount', () => {
      mockSearchParams = new URLSearchParams('sort=-created_at')

      const { result } = renderHook(() => useSortState())

      expect(result.current.sort).toEqual({ field: 'created_at', direction: 'desc' })
    })

    it('should use defaultSort when URL has no sort param', () => {
      const defaultSort: SortConfig = { field: 'name', direction: 'asc' }

      const { result } = renderHook(() => useSortState(defaultSort))

      expect(result.current.sort).toEqual(defaultSort)
    })

    it('should prefer URL sort over defaultSort', () => {
      mockSearchParams = new URLSearchParams('sort=-created_at')
      const defaultSort: SortConfig = { field: 'name', direction: 'asc' }

      const { result } = renderHook(() => useSortState(defaultSort))

      expect(result.current.sort).toEqual({ field: 'created_at', direction: 'desc' })
    })

    it('should fall back to defaultSort when URL sort is invalid', () => {
      mockSearchParams = new URLSearchParams('sort=-')
      const defaultSort: SortConfig = { field: 'name', direction: 'asc' }

      const { result } = renderHook(() => useSortState(defaultSort))

      expect(result.current.sort).toEqual(defaultSort)
    })

    it('should return null when URL sort is empty and defaultSort is undefined', () => {
      mockSearchParams = new URLSearchParams('sort=')

      const { result } = renderHook(() => useSortState(undefined))

      expect(result.current.sort).toBeNull()
    })
  })

  describe('setSort', () => {
    it('should update URL with ascending sort format', () => {
      const { result } = renderHook(() => useSortState())

      act(() => {
        result.current.setSort({ field: 'name', direction: 'asc' })
      })

      expect(mockSetSearchParams).toHaveBeenCalledWith(expect.any(URLSearchParams))
      const calledParams = mockSetSearchParams.mock.calls[0][0] as URLSearchParams
      expect(calledParams.get('sort')).toBe('name')
    })

    it('should update URL with descending sort format', () => {
      const { result } = renderHook(() => useSortState())

      act(() => {
        result.current.setSort({ field: 'created_at', direction: 'desc' })
      })

      const calledParams = mockSetSearchParams.mock.calls[0][0] as URLSearchParams
      expect(calledParams.get('sort')).toBe('-created_at')
    })

    it('should sync sort state to URL query parameter', () => {
      const { result, rerender } = renderHook(() => useSortState())

      act(() => {
        result.current.setSort({ field: 'name', direction: 'desc' })
      })

      mockSearchParams = mockSetSearchParams.mock.calls[0][0] as URLSearchParams
      rerender()

      expect(result.current.sort).toEqual({ field: 'name', direction: 'desc' })
      expect(mockSearchParams.get('sort')).toBe('-name')
    })

    it('should preserve non-sort params when setting sort', () => {
      mockSearchParams = new URLSearchParams('name[contains]=deploy&cursor=abc')

      const { result } = renderHook(() => useSortState())

      act(() => {
        result.current.setSort({ field: 'name', direction: 'asc' })
      })

      const calledParams = mockSetSearchParams.mock.calls[0][0] as URLSearchParams
      expect(calledParams.get('sort')).toBe('name')
      expect(calledParams.get('name[contains]')).toBe('deploy')
      expect(calledParams.get('cursor')).toBe('abc')
    })

    it('should remove sort param when setSort receives an invalid field', () => {
      mockSearchParams = new URLSearchParams('sort=name')

      const { result } = renderHook(() => useSortState())

      act(() => {
        result.current.setSort({ field: 'name desc', direction: 'asc' })
      })

      const calledParams = mockSetSearchParams.mock.calls[0][0] as URLSearchParams
      expect(calledParams.has('sort')).toBe(false)
    })
  })

  describe('clearSort', () => {
    it('should remove sort param from URL', () => {
      mockSearchParams = new URLSearchParams('sort=-name')

      const { result } = renderHook(() => useSortState())

      act(() => {
        result.current.clearSort()
      })

      const calledParams = mockSetSearchParams.mock.calls[0][0] as URLSearchParams
      expect(calledParams.has('sort')).toBe(false)
    })

    it('should preserve non-sort params when clearing sort', () => {
      mockSearchParams = new URLSearchParams('sort=name&name[contains]=deploy')

      const { result } = renderHook(() => useSortState())

      act(() => {
        result.current.clearSort()
      })

      const calledParams = mockSetSearchParams.mock.calls[0][0] as URLSearchParams
      expect(calledParams.has('sort')).toBe(false)
      expect(calledParams.get('name[contains]')).toBe('deploy')
    })

    it('should restore defaultSort after clear when URL has no sort', () => {
      mockSearchParams = new URLSearchParams('sort=-created_at')
      const defaultSort: SortConfig = { field: 'name', direction: 'asc' }
      const { result, rerender } = renderHook(() => useSortState(defaultSort))

      act(() => {
        result.current.clearSort()
      })

      mockSearchParams = mockSetSearchParams.mock.calls[0][0] as URLSearchParams
      rerender()

      expect(result.current.sort).toEqual(defaultSort)
    })
  })

  describe('toggleSort', () => {
    it('should set ascending sort when no sort is active', () => {
      const { result } = renderHook(() => useSortState())

      act(() => {
        result.current.toggleSort('name')
      })

      const calledParams = mockSetSearchParams.mock.calls[0][0] as URLSearchParams
      expect(calledParams.get('sort')).toBe('name')
    })

    it('should switch direction on the same field', () => {
      mockSearchParams = new URLSearchParams('sort=name')

      const { result, rerender } = renderHook(() => useSortState())

      act(() => {
        result.current.toggleSort('name')
      })

      let calledParams = mockSetSearchParams.mock.calls[0][0] as URLSearchParams
      expect(calledParams.get('sort')).toBe('-name')

      mockSearchParams = calledParams
      rerender()

      act(() => {
        result.current.toggleSort('name')
      })

      calledParams = mockSetSearchParams.mock.calls[1][0] as URLSearchParams
      expect(calledParams.get('sort')).toBe('name')
    })

    it("should reset to 'asc' on a new field", () => {
      mockSearchParams = new URLSearchParams('sort=-created_at')

      const { result } = renderHook(() => useSortState())

      act(() => {
        result.current.toggleSort('name')
      })

      const calledParams = mockSetSearchParams.mock.calls[0][0] as URLSearchParams
      expect(calledParams.get('sort')).toBe('name')
    })

    it('should toggle from defaultSort when URL has no sort param', () => {
      const defaultSort: SortConfig = { field: 'name', direction: 'asc' }
      const { result } = renderHook(() => useSortState(defaultSort))

      act(() => {
        result.current.toggleSort('name')
      })

      const calledParams = mockSetSearchParams.mock.calls[0][0] as URLSearchParams
      expect(calledParams.get('sort')).toBe('-name')
    })

    it("should reset to 'asc' when toggling a different field from defaultSort", () => {
      const defaultSort: SortConfig = { field: 'name', direction: 'desc' }
      const { result } = renderHook(() => useSortState(defaultSort))

      act(() => {
        result.current.toggleSort('created_at')
      })

      const calledParams = mockSetSearchParams.mock.calls[0][0] as URLSearchParams
      expect(calledParams.get('sort')).toBe('created_at')
    })
  })

  describe('browser navigation', () => {
    it('should preserve sort state on browser back/forward navigation', () => {
      mockSearchParams = new URLSearchParams('sort=name')
      const { result, rerender } = renderHook(() => useSortState())

      expect(result.current.sort).toEqual({ field: 'name', direction: 'asc' })

      act(() => {
        result.current.setSort({ field: 'created_at', direction: 'desc' })
      })

      // Simulate browser back — URL restores previous sort
      mockSearchParams = new URLSearchParams('sort=name')
      rerender()

      expect(result.current.sort).toEqual({ field: 'name', direction: 'asc' })

      // Simulate browser forward
      mockSearchParams = new URLSearchParams('sort=-created_at')
      rerender()

      expect(result.current.sort).toEqual({ field: 'created_at', direction: 'desc' })
    })
  })

  describe('paramName option', () => {
    it('reads and writes a namespaced query param', () => {
      mockSearchParams = new URLSearchParams('activity_sort=-timestamp&sort=-created_at')

      const { result } = renderHook(() => useSortState(undefined, { paramName: 'activity_sort' }))

      expect(result.current.sort).toEqual({ field: 'timestamp', direction: 'desc' })

      act(() => {
        result.current.setSort({ field: 'status', direction: 'asc' })
      })

      const calledParams = mockSetSearchParams.mock.calls[0][0] as URLSearchParams
      expect(calledParams.get('activity_sort')).toBe('status')
      expect(calledParams.get('sort')).toBe('-created_at')
    })

    it('clears only the namespaced param', () => {
      mockSearchParams = new URLSearchParams('activity_sort=timestamp&sort=-created_at')

      const { result } = renderHook(() => useSortState(undefined, { paramName: 'activity_sort' }))

      act(() => {
        result.current.clearSort()
      })

      const calledParams = mockSetSearchParams.mock.calls[0][0] as URLSearchParams
      expect(calledParams.has('activity_sort')).toBe(false)
      expect(calledParams.get('sort')).toBe('-created_at')
    })
  })
})
