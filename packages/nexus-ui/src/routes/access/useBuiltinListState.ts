import { useCallback, useMemo, useState } from 'react'

import { useFilterState } from '../../hooks/useFilterState'
import { useSortState } from '../../hooks/useSortState'
import type { FilterConfig } from '../../types/filters'
import { buildFilterParams } from '../../utils/filterUtils'

export function useBuiltinListState(sortFieldByColumn: Record<number, string>) {
  const { filters, setAllFilters, clearAllFilters } = useFilterState()
  const [cursor, setCursor] = useState<string | null>(null)
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([null])
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)

  const resetPagination = useCallback(() => {
    setCursor(null)
    setCursorHistory([null])
    setPage(1)
  }, [])

  const { sortParam, getSortParams } = useSortState(sortFieldByColumn, resetPagination)

  const handleFilterChange = useCallback(
    (newFilters: FilterConfig[]) => {
      setAllFilters(newFilters)
      resetPagination()
    },
    [setAllFilters, resetPagination]
  )

  const handlePerPageChange = useCallback(
    (newPerPage: number) => {
      setPerPage(newPerPage)
      resetPagination()
    },
    [resetPagination]
  )

  const resetAll = useCallback(() => {
    clearAllFilters()
    resetPagination()
  }, [clearAllFilters, resetPagination])

  const queryParams = useMemo(() => {
    const params: Record<string, unknown> = { limit: perPage, include_total: true }
    const filterParams = buildFilterParams(
      filters.map((f) => {
        if (f.key === 'type') {
          return { key: 'is_builtin', value: f.value === 'builtin' }
        }
        return f
      })
    )
    Object.assign(params, filterParams)
    if (cursor) params.cursor = cursor
    if (sortParam) params.sort = sortParam
    return params
  }, [filters, cursor, perPage, sortParam])

  const goToPrevPage = useCallback(() => {
    const prevCursor = cursorHistory[cursorHistory.length - 2] ?? null
    setCursor(prevCursor)
    setCursorHistory((prev) => prev.slice(0, -1))
    setPage(page - 1)
  }, [cursorHistory, page])

  const goToNextPage = useCallback(
    (nextCursorValue: string | null) => {
      setCursorHistory((prev) => [...prev, nextCursorValue])
      setCursor(nextCursorValue)
      setPage(page + 1)
    },
    [page]
  )

  return {
    filters,
    hasActiveFilters: filters.length > 0,
    handleFilterChange,
    clearAllFilters: resetAll,
    getSortParams,
    queryParams,
    page,
    perPage,
    handlePerPageChange,
    goToPrevPage,
    goToNextPage,
  }
}
