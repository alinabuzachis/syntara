import type { FilterConfig } from '../types/filters'

/**
 * Creates a filter change handler that resets pagination cursor and manages filter state
 *
 * This handler follows the standard pattern for list views with server-side filtering:
 * 1. Reset pagination cursor to first page when filters change
 * 2. Optionally transform filter values before applying
 * 3. Apply filters atomically to URL state
 *
 * @param cursor - Current pagination cursor value
 * @param resetCursor - Function to reset the pagination cursor to null
 * @param clearAllFilters - Function to clear all active filters
 * @param setAllFilters - Function to set all filters atomically
 * @param transformFilters - Optional function to transform filters before applying (e.g., convert string to boolean)
 * @returns Filter change handler function
 *
 * @example
 * // Basic usage (Integrations, Integration Tools)
 * const handleFilterChange = createFilterChangeHandler(
 *   cursor,
 *   () => setCursor(null),
 *   clearAllFilters,
 *   setAllFilters
 * )
 *
 * @example
 * // With value transformation (Automations - convert is_enabled string to boolean)
 * const handleFilterChange = createFilterChangeHandler(
 *   cursor,
 *   () => dispatch({ type: 'SET_CURSOR', payload: null }),
 *   clearAllFilters,
 *   setAllFilters,
 *   (filters) => filters.map((filter) => {
 *     if (filter.key === 'is_enabled' && typeof filter.value === 'string') {
 *       return { ...filter, value: filter.value === 'true' }
 *     }
 *     return filter
 *   })
 * )
 */
export const createFilterChangeHandler = (
  cursor: string | null,
  resetCursor: () => void,
  clearAllFilters: () => void,
  setAllFilters: (filters: FilterConfig[]) => void,
  transformFilters?: (filters: FilterConfig[]) => FilterConfig[]
) => {
  return (newFilters: FilterConfig[]) => {
    // Reset to first page when filters change
    if (cursor) {
      resetCursor()
    }

    // If clearing all filters (empty array), use clearAllFilters
    if (newFilters.length === 0) {
      clearAllFilters()
      return
    }

    // Apply optional transformations (e.g., string to boolean conversion)
    const finalFilters = transformFilters ? transformFilters(newFilters) : newFilters

    // Apply all filters atomically with setAllFilters
    setAllFilters(finalFilters)
  }
}
