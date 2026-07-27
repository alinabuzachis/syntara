import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { executionsClient } from '../../../client'
import { useCursorPagination } from '../../../hooks/useCursorPagination'
import { runHistoryDefaultSort, runHistoryTableColumns } from '../../builder/runHistoryTableColumns'

import { useExecutionRunHistory } from './useExecutionRunHistory'

vi.mock('../../../client', () => ({
  executionsClient: {
    useQuery: vi.fn(),
  },
}))

vi.mock('../../../hooks/useCursorPagination', () => ({
  useCursorPagination: vi.fn(),
}))

const useCursorPaginationMock = vi.mocked(useCursorPagination)
const useQueryMock = vi.mocked(executionsClient.useQuery)

describe('useExecutionRunHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useCursorPaginationMock.mockReturnValue({
      filters: [],
      queryParams: { sort: '-created_at', workflow_id: 'wf-1', limit: 20, include_total: true },
      handleFilterChange: vi.fn(),
      getFooterProps: vi.fn(() => ({
        page: 1,
        perPage: 20,
        total: 0,
        hasNext: false,
        onPrev: vi.fn(),
        onNext: vi.fn(),
        onPerPageChange: vi.fn(),
      })),
      getSortParams: vi.fn(),
      cursor: null,
      setCursor: vi.fn(),
      resetPagination: vi.fn(),
      hasActiveFilters: false,
      handleClearAllFilters: vi.fn(),
      page: 1,
      perPage: 20,
      handlePerPageChange: vi.fn(),
      sort: runHistoryDefaultSort,
      sortParam: '-created_at',
      setSort: vi.fn(),
      clearSort: vi.fn(),
      toggleSort: vi.fn(),
      handleSort: vi.fn(),
    })
    useQueryMock.mockReturnValue({ data: { resources: [] } } as ReturnType<typeof executionsClient.useQuery>)
  })

  it('wires default sort and columns into useCursorPagination', () => {
    renderHook(() => useExecutionRunHistory('wf-1'))

    expect(useCursorPaginationMock).toHaveBeenCalledWith({
      limit: 20,
      extraParams: { workflow_id: 'wf-1' },
      defaultSort: runHistoryDefaultSort,
      columns: runHistoryTableColumns,
    })
  })

  it('queries executions with pagination query params when workflow id is set', () => {
    renderHook(() => useExecutionRunHistory('wf-1'))

    expect(useQueryMock).toHaveBeenCalledWith(
      'get',
      '/executions',
      {
        params: {
          query: { sort: '-created_at', workflow_id: 'wf-1', limit: 20, include_total: true },
        },
      },
      { enabled: true }
    )
  })

  it('disables the executions query when workflow id is missing', () => {
    renderHook(() => useExecutionRunHistory(undefined))

    expect(useQueryMock).toHaveBeenCalledWith('get', '/executions', expect.anything(), { enabled: false })
  })
})
