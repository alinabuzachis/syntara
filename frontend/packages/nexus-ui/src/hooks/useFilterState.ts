import { useCallback, useMemo } from 'react'

import type { FilterConfig } from '../types/filters'
import { buildFilterParams, parseFiltersFromUrl } from '../utils/filterUtils'

import { useSearchParams } from './routing/useSearchParams'

/**
 * Result from useFilterState hook
 */
export type UseFilterStateResult = {
  /** Current active filters parsed from URL */
  filters: FilterConfig[]
  /** Add or update a filter */
  setFilter: (filter: FilterConfig) => void
  /** Remove a filter by key */
  removeFilter: (key: string) => void
  /** Remove all filters */
  clearAllFilters: () => void
  /** Replace all filters at once (preserves order) */
  setAllFilters: (filters: FilterConfig[]) => void
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
   * Only replaces filters with the same key AND operator to preserve sibling operators
   * (e.g., created_at >= and created_at <= can coexist)
   */
  const setFilter = useCallback(
    (newFilter: FilterConfig) => {
      // Work from canonical filters (includes defaults)
      const currentFilters = filters

      // Remove only filters matching both key and operator
      const updatedFilters = currentFilters.filter(
        (f) => !(f.key === newFilter.key && (f.operator ?? 'eq') === (newFilter.operator ?? 'eq'))
      )

      // Add the new filter
      updatedFilters.push(newFilter)

      // Convert to URL params - preserve non-filter params
      const newSearchParams = new URLSearchParams(searchParams)
      const filterParams = buildFilterParams(updatedFilters)

      // Remove existing filter params
      const filterKeys = new Set(
        updatedFilters.map((f) => {
          const operator = f.operator ?? 'eq'
          return operator === 'eq' ? f.key : `${f.key}[${operator}]`
        })
      )

      // Clean up old filter params
      Array.from(newSearchParams.keys()).forEach((key) => {
        if (key.startsWith('labels[') || key.includes('[') || filterKeys.has(key)) {
          newSearchParams.delete(key)
        }
      })

      // Add new filter params
      Object.entries(filterParams).forEach(([key, value]) => {
        newSearchParams.set(key, String(value))
      })

      setSearchParams(newSearchParams)
    },
    [filters, searchParams, setSearchParams]
  )

  /**
   * Remove a filter by key
   */
  const removeFilter = useCallback(
    (key: string) => {
      // Work from canonical filters (includes defaults)
      const currentFilters = filters

      // Remove the filter with the matching key
      const updatedFilters = currentFilters.filter((f) => f.key !== key)

      // Preserve non-filter params
      const newSearchParams = new URLSearchParams(searchParams)

      // Remove filter-specific keys
      Array.from(newSearchParams.keys()).forEach((paramKey) => {
        if (paramKey === key || paramKey.startsWith(`${key}[`)) {
          newSearchParams.delete(paramKey)
        }
      })

      // If there are remaining filters, add them back
      if (updatedFilters.length > 0) {
        const filterParams = buildFilterParams(updatedFilters)
        Object.entries(filterParams).forEach(([k, v]) => {
          newSearchParams.set(k, String(v))
        })
      }

      setSearchParams(newSearchParams)
    },
    [filters, searchParams, setSearchParams]
  )

  /**
   * Clear all filters from URL (preserves non-filter params)
   */
  const clearAllFilters = useCallback(() => {
    // Preserve non-filter params (like pagination, sort, tabs)
    const newSearchParams = new URLSearchParams(searchParams)

    // Remove all filter-related keys
    Array.from(newSearchParams.keys()).forEach((key) => {
      // Remove if it's a filter key (contains brackets or is a known filter field)
      if (key.includes('[') || filters.some((f) => f.key === key)) {
        newSearchParams.delete(key)
      }
    })

    setSearchParams(newSearchParams)
  }, [filters, searchParams, setSearchParams])

  /**
   * Replace all filters at once (preserves order and makes atomic update)
   * This is more efficient than calling clearAll + setFilter multiple times
   */
  const setAllFilters = useCallback(
    (newFilters: FilterConfig[]) => {
      // Build set of all possible filter keys (old + new) to remove
      const filterKeysToRemove = new Set<string>()

      // Add keys from current filters (what's currently in URL)
      filters.forEach((f) => {
        const operator = f.operator ?? 'eq'
        filterKeysToRemove.add(operator === 'eq' ? f.key : `${f.key}[${operator}]`)
        // Also add base key to handle edge cases
        filterKeysToRemove.add(f.key)
      })

      // Preserve non-filter params - convert to string then back to ensure proper copying
      const newSearchParams = new URLSearchParams(searchParams.toString())

      // Remove only the specific filter keys we identified
      Array.from(newSearchParams.keys()).forEach((key) => {
        // Remove if it's a known filter key or starts with 'labels[' (label filters)
        if (filterKeysToRemove.has(key) || key.startsWith('labels[')) {
          newSearchParams.delete(key)
        }
      })

      // Add new filter params
      if (newFilters.length > 0) {
        const filterParams = buildFilterParams(newFilters)
        Object.entries(filterParams).forEach(([key, value]) => {
          newSearchParams.set(key, String(value))
        })
      }

      setSearchParams(newSearchParams)
    },
    [filters, searchParams, setSearchParams]
  )

  return {
    filters,
    setFilter,
    removeFilter,
    clearAllFilters,
    setAllFilters,
  }
}
