import { SortByDirection } from '@patternfly/react-table'
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { useBuiltinListState } from './useBuiltinListState'

const mockSetSearchParams = vi.fn()
let mockSearchParams = new URLSearchParams()

vi.mock('../../hooks/routing/useSearchParams', () => ({
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
}))

vi.mock('../../hooks/useFilterState', () => ({
  useFilterState: () => ({
    filters: [],
    setAllFilters: vi.fn(),
    clearAllFilters: vi.fn(),
  }),
}))

const sortFieldByColumn: Record<number, string> = {
  0: 'name',
  1: 'description',
}

describe('useBuiltinListState', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams()
    mockSetSearchParams.mockClear()
  })

  it('should include descending sort in queryParams from useColumnSortState', () => {
    mockSearchParams = new URLSearchParams('sort=-name')

    const { result } = renderHook(() => useBuiltinListState(sortFieldByColumn))

    expect(result.current.queryParams.sort).toBe('-name')
  })

  it('should omit sort from queryParams when unsorted', () => {
    const { result } = renderHook(() => useBuiltinListState(sortFieldByColumn))

    expect(result.current.queryParams.sort).toBeUndefined()
  })

  it('should update sort via getSortParams', () => {
    const { result } = renderHook(() => useBuiltinListState(sortFieldByColumn))
    const sortParams = result.current.getSortParams(0)

    act(() => {
      sortParams!.onSort!(new MouseEvent('click') as never, 0, SortByDirection.desc, {})
    })

    expect(mockSetSearchParams).toHaveBeenCalledTimes(1)
    const params = mockSetSearchParams.mock.calls[0][0] as URLSearchParams
    expect(params.get('sort')).toBe('-name')
  })
})
