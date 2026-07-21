import { useMemo } from 'react'

import type { SortConfig } from '../types/sorting'
import { buildSortParam, parseSortParam, toggleSortDirection } from '../utils/sortUtils'

import { useSearchParams } from './routing/useSearchParams'

const SORT_PARAM = 'sort'

/**
 * Result from useSortState hook
 */
export type UseSortStateResult = {
  /** Current sort parsed from the URL, or `defaultSort` when the URL has no valid sort */
  sort: SortConfig | null
  /** Set sort and sync it to the `sort` URL query parameter */
  setSort: (sort: SortConfig) => void
  /** Remove the `sort` query parameter from the URL */
  clearSort: () => void
  /**
   * Toggle sort for a field.
   * Same field flips direction; a new field resets to ascending.
   */
  toggleSort: (field: string) => void
}

/**
 * Manages sort state in the URL `sort` query parameter.
 *
 * Enables bookmarkable/shareable sorted views by syncing `SortConfig` with the
 * Nexus API sort format (`field` ascending, `-field` descending). Browser
 * back/forward updates the hook via `useSearchParams`.
 *
 * @param defaultSort - Optional default sort when the URL has no valid `sort` param
 * @returns Sort state and management functions
 *
 * @example
 * ```typescript
 * function WorkflowsPage() {
 *   const { sort, setSort, clearSort, toggleSort } = useSortState({
 *     field: 'name',
 *     direction: 'asc',
 *   })
 *
 *   // Apply an explicit sort
 *   setSort({ field: 'created_at', direction: 'desc' })
 *
 *   // Toggle a column header
 *   toggleSort('name')
 *
 *   // Clear sort from the URL
 *   clearSort()
 * }
 * ```
 */
export function useSortState(defaultSort?: SortConfig): UseSortStateResult {
  const [searchParams, setSearchParams] = useSearchParams()

  const sort = useMemo(() => {
    const urlSort = parseSortParam(searchParams.get(SORT_PARAM))
    if (urlSort !== null) {
      return urlSort
    }
    if (defaultSort !== undefined) {
      return defaultSort
    }
    return null
  }, [searchParams, defaultSort])

  const writeSortParam = (nextSort: SortConfig | null) => {
    const newSearchParams = new URLSearchParams(searchParams)
    const param = buildSortParam(nextSort)

    if (param === null) {
      newSearchParams.delete(SORT_PARAM)
    } else {
      newSearchParams.set(SORT_PARAM, param)
    }

    setSearchParams(newSearchParams)
  }

  const setSort = (newSort: SortConfig) => {
    writeSortParam(newSort)
  }

  const clearSort = () => {
    writeSortParam(null)
  }

  const toggleSort = (field: string) => {
    if (sort !== null && sort.field === field) {
      writeSortParam({ field, direction: toggleSortDirection(sort.direction) })
      return
    }

    writeSortParam({ field, direction: 'asc' })
  }

  return {
    sort,
    setSort,
    clearSort,
    toggleSort,
  }
}
