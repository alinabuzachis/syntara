import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'wouter'

import type { FilterConfig } from '../types/filters'
import { buildFilterParams, parseFiltersFromUrl } from '../utils/filterUtils'

/**
 * Result from useFilterState hook
 */
export interface UseFilterStateResult {
  /** Current active filters parsed from URL */
  filters: FilterConfig[]
  /** Add or update a filter */
  setFilter: (filter: FilterConfig) => void
  /** Remove a filter by key */
  removeFilter: (key: string) => void
  /** Remove all filters */
  clearAllFilters: () => void
}

/**
 * Manages filter state in URL query parameters
 *
 * Enables bookmarkable/shareable filtered views by syncing filter state
 * with URL search parameters. All filter changes are reflected in the URL,
 * and the URL can be shared to restore the exact filter state.
 *
 * @param defaultFilters - Optional default filters to apply if URL has no filters
 * @returns Filter state and management functions
 *
 * @example
 * ```typescript
 * function WorkflowsPage() {
 *   const { filters, setFilter, removeFilter, clearAllFilters } = useFilterState()
 *
 *   // Apply a filter
 *   const handleSearch = (value: string) => {
 *     setFilter({ key: 'name', operator: 'contains', value })
 *   }
 *
 *   // Remove a filter
 *   const handleRemoveStatus = () => {
 *     removeFilter('status')
 *   }
 *
 *   // Clear all filters
 *   const handleClearAll = () => {
 *     clearAllFilters()
 *   }
 *
 *   return (
 *     <>
 *       <SearchInput onSearch={handleSearch} />
 *       <FilterChips filters={filters} onRemove={removeFilter} />
 *       <Button onClick={handleClearAll}>Clear All</Button>
 *     </>
 *   )
 * }
 * ```
 *
 * @example
 * ```typescript
 * // With default filters
 * const { filters } = useFilterState([
 *   { key: 'is_enabled', value: true }
 * ])
 * // URL will show: ?is_enabled=true
 * ```
 */
export function useFilterState(defaultFilters: FilterConfig[] = []): UseFilterStateResult {
  const [searchParams, setSearchParams] = useSearchParams()

  // Parse current filters from URL
  const filters = useMemo(() => {
    const urlFilters = parseFiltersFromUrl(searchParams)
    // Use URL filters if present, otherwise use defaults
    return urlFilters.length > 0 ? urlFilters : defaultFilters
  }, [searchParams, defaultFilters])

  /**
   * Add or update a filter
   * If a filter with the same key exists, it will be replaced
   */
  const setFilter = useCallback(
    (newFilter: FilterConfig) => {
      // Get current filters from URL
      const currentFilters = parseFiltersFromUrl(searchParams)

      // Remove any existing filter with the same key
      const updatedFilters = currentFilters.filter((f) => f.key !== newFilter.key)

      // Add the new filter
      updatedFilters.push(newFilter)

      // Convert to URL params and update
      const filterParams = buildFilterParams(updatedFilters)
      const newSearchParams = new URLSearchParams(filterParams as Record<string, string>)

      setSearchParams(newSearchParams)
    },
    [searchParams, setSearchParams]
  )

  /**
   * Remove a filter by key
   */
  const removeFilter = useCallback(
    (key: string) => {
      // Get current filters from URL
      const currentFilters = parseFiltersFromUrl(searchParams)

      // Remove the filter with the matching key
      const updatedFilters = currentFilters.filter((f) => f.key !== key)

      // Convert to URL params and update
      if (updatedFilters.length === 0) {
        // Clear all search params if no filters remain
        setSearchParams(new URLSearchParams())
      } else {
        const filterParams = buildFilterParams(updatedFilters)
        const newSearchParams = new URLSearchParams(filterParams as Record<string, string>)
        setSearchParams(newSearchParams)
      }
    },
    [searchParams, setSearchParams]
  )

  /**
   * Clear all filters from URL
   */
  const clearAllFilters = useCallback(() => {
    setSearchParams(new URLSearchParams())
  }, [setSearchParams])

  return {
    filters,
    setFilter,
    removeFilter,
    clearAllFilters,
  }
}
