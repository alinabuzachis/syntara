import { useCallback, useEffect, useMemo, useState } from 'react'

import { TotalCount } from '../components/table/TotalCount'
import type { FilterConfig } from '../types/filters'
import { buildFilterParams } from '../utils/filterUtils'

import { createFilterChangeHandler } from './useFilterChangeHandler'
import { useFilterState } from './useFilterState'

interface PaginatedResponse {
  resources?: unknown[]
  prev?: string | null
  next?: string | null
  total?: number | null
}

interface UseCursorPaginationOptions {
  /** Default page size (defaults to 20) */
  limit?: number
  /** Default filters from URL or other sources */
  defaultFilters?: FilterConfig[]
  /** Optional transform for filter values before applying (e.g., string → boolean) */
  transformFilters?: (filters: FilterConfig[]) => FilterConfig[]
  /** Extra query params merged into every request (e.g., provider_id) */
  extraParams?: Record<string, unknown>
}

export interface UseCursorPaginationResult {
  /** Current pagination cursor */
  cursor: string | null
  /** Set cursor directly */
  setCursor: (cursor: string | null) => void
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
  /** Build footer props for ScrollableTableContainer from a query response */
  getFooterProps: (
    data: PaginatedResponse | undefined,
    itemCount: number,
    singularLabel: string,
    pluralLabel: string
  ) => {
    content: React.ReactNode
    prev: string | null
    next: string | null
    onPrev: () => void
    onNext: () => void
  }
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
 * - Footer props for ScrollableTableContainer
 */
export function useCursorPagination(options: UseCursorPaginationOptions = {}): UseCursorPaginationResult {
  const { limit = 20, defaultFilters, transformFilters, extraParams } = options

  const [cursor, setCursor] = useState<string | null>(null)
  const { filters, clearAllFilters, setAllFilters } = useFilterState(defaultFilters)

  const hasActiveFilters = filters.length > 0

  const handleFilterChange = useMemo(
    () => createFilterChangeHandler(cursor, () => setCursor(null), clearAllFilters, setAllFilters, transformFilters),
    [cursor, clearAllFilters, setAllFilters, transformFilters]
  )

  const handleClearAllFilters = useCallback(() => {
    if (cursor) {
      setCursor(null)
    }
    clearAllFilters()
  }, [cursor, clearAllFilters])

  const queryParams = useMemo(() => {
    const params: Record<string, unknown> = {
      limit,
      include_total: true,
      ...extraParams,
    }

    const filterParams = buildFilterParams(filters)
    Object.assign(params, filterParams)

    if (cursor) {
      params.cursor = cursor
    }

    return params
  }, [filters, cursor, limit, extraParams])

  const getFooterProps = useCallback(
    (data: PaginatedResponse | undefined, itemCount: number, singularLabel: string, pluralLabel: string) => ({
      content: (
        <>
          {itemCount} {itemCount === 1 ? singularLabel : pluralLabel}
          {data?.total != null && data.total > itemCount && <TotalCount total={data.total} />}
        </>
      ),
      prev: data?.prev ?? null,
      next: data?.next ?? null,
      onPrev: () => setCursor(data?.prev ?? null),
      onNext: () => setCursor(data?.next ?? null),
    }),
    []
  )

  return {
    cursor,
    setCursor,
    filters,
    hasActiveFilters,
    queryParams,
    handleFilterChange,
    handleClearAllFilters,
    getFooterProps,
  }
}

/**
 * Auto-resets cursor when:
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
  setCursor: (cursor: string | null) => void
): void {
  useEffect(() => {
    if (itemCount === 0 && !hasActiveFilters && cursor && !isFetching) {
      setCursor(null)
    }
  }, [itemCount, hasActiveFilters, cursor, isFetching, setCursor])
}
