import { useCallback, useEffect, useMemo, useState } from 'react'

import type { PaginationFooterProps } from '../components/table/PaginationFooter'
import type { FilterConfig } from '../types/filters'
import { buildFilterParams } from '../utils/filterUtils'

import { createFilterChangeHandler } from './useFilterChangeHandler'
import { useFilterState } from './useFilterState'

type PaginatedResponse = {
  resources?: unknown[]
  prev?: string | null
  next?: string | null
  total?: number | null
}

type UseCursorPaginationOptions = {
  /** Default page size (defaults to 20) */
  limit?: number
  /** Default filters from URL or other sources */
  defaultFilters?: FilterConfig[]
  /** Optional transform for filter values before applying (e.g., string → boolean) */
  transformFilters?: (filters: FilterConfig[]) => FilterConfig[]
  /** Extra query params merged into every request (e.g., provider_id) */
  extraParams?: Record<string, unknown>
}

export type UseCursorPaginationResult = {
  /** Current pagination cursor */
  cursor: string | null
  /** Set cursor directly */
  setCursor: (cursor: string | null) => void
  /** Reset both cursor and page to initial state */
  resetPagination: () => void
  /** Current active filters */
  filters: FilterConfig[]
  /** Whether any filters are active */
  hasActiveFilters: boolean
  /** Built query params ready to pass to useQuery */
  queryParams: Record<string, unknown>
  /** Handler for FilterBar onFilterChange */
  handleFilterChange: (newFilters: FilterConfig[]) => void
  /** Handler for "Clear all filters" button */
  handleClearAllFilters: () => void
  /** Current page number (1-based) */
  page: number
  /** Current items per page */
  perPage: number
  /** Handler for changing items per page */
  handlePerPageChange: (perPage: number) => void
  /** Build footer props for NxScrollableTableContainer from a query response */
  getFooterProps: (data: PaginatedResponse | undefined) => PaginationFooterProps
}

/**
 * Encapsulates the cursor-based pagination pattern used across all list views.
 *
 * Handles:
 * - Cursor state management
 * - Filter state (via useFilterState) with optional transform
 * - Query params building (filters + cursor + limit + extras)
 * - Cursor reset when data is empty and no filters active
 * - handleClearAllFilters (reset cursor + clear filters)
 * - Footer props for NxScrollableTableContainer
 */
export function useCursorPagination(options: UseCursorPaginationOptions = {}): UseCursorPaginationResult {
  const { limit = 20, defaultFilters, transformFilters, extraParams } = options

  const [cursor, setCursor] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(limit)
  const { filters, clearAllFilters, setAllFilters } = useFilterState(defaultFilters)

  const hasActiveFilters = filters.length > 0

  const resetPagination = useCallback(() => {
    setCursor(null)
    setPage(1)
  }, [])

  const handleFilterChange = useMemo(
    () => createFilterChangeHandler(cursor, resetPagination, clearAllFilters, setAllFilters, transformFilters),
    [cursor, resetPagination, clearAllFilters, setAllFilters, transformFilters]
  )

  const handleClearAllFilters = useCallback(() => {
    clearAllFilters()
    resetPagination()
  }, [clearAllFilters, resetPagination])

  const handlePerPageChange = useCallback(
    (newPerPage: number) => {
      setPerPage(newPerPage)
      resetPagination()
    },
    [resetPagination]
  )

  // Reset pagination when extraParams change (e.g., project selection).
  // Uses the React "store previous value" pattern to detect change during render
  // so queryParams excludes the stale cursor in the same render cycle.
  //
  // Timing: setCursor(null) clears the cursor state, but React batches state updates
  // so `cursor` still holds its previous value during this render. The `extraParamsChanged`
  // guard below prevents the stale cursor from leaking into queryParams for this one
  // render cycle. On the next render both `cursor` and `prevExtraParamsKey` are up to date,
  // so `extraParamsChanged` becomes false and normal cursor inclusion resumes.
  const extraParamsKey = JSON.stringify(extraParams)
  const [prevExtraParamsKey, setPrevExtraParamsKey] = useState(extraParamsKey)
  const extraParamsChanged = prevExtraParamsKey !== extraParamsKey
  if (extraParamsChanged) {
    setPrevExtraParamsKey(extraParamsKey)
    setCursor(null)
    setPage(1)
  }

  const queryParams = useMemo(() => {
    const params: Record<string, unknown> = {
      limit: perPage,
      include_total: true,
      ...extraParams,
    }

    const filterParams = buildFilterParams(filters)
    Object.assign(params, filterParams)

    if (cursor && !extraParamsChanged) {
      params.cursor = cursor
    }

    return params
  }, [filters, cursor, perPage, extraParams, extraParamsChanged])

  const getFooterProps = useCallback(
    (data: PaginatedResponse | undefined): PaginationFooterProps => ({
      page,
      perPage,
      total: data?.total ?? null,
      hasNext: !!data?.next,
      onPrev: () => {
        setCursor(data?.prev ?? null)
        setPage((p) => Math.max(1, p - 1))
      },
      onNext: () => {
        setCursor(data?.next ?? null)
        setPage((p) => p + 1)
      },
      onPerPageChange: handlePerPageChange,
    }),
    [page, perPage, handlePerPageChange]
  )

  return {
    cursor,
    setCursor,
    resetPagination,
    filters,
    hasActiveFilters,
    queryParams,
    handleFilterChange,
    handleClearAllFilters,
    page,
    perPage,
    handlePerPageChange,
    getFooterProps,
  }
}

/**
 * Auto-resets pagination when:
 * - There are no items to display
 * - No active filters (i.e., it's not a "no results" from filtering)
 * - A cursor is currently set
 * - The query is not fetching (to avoid resetting mid-pagination)
 *
 * Use this in list views after getting query results.
 */
export function useCursorReset(
  itemCount: number,
  hasActiveFilters: boolean,
  cursor: string | null,
  isFetching: boolean,
  resetPagination: () => void
): void {
  useEffect(() => {
    if (itemCount === 0 && !hasActiveFilters && cursor && !isFetching) {
      resetPagination()
    }
  }, [itemCount, hasActiveFilters, cursor, isFetching, resetPagination])
}
