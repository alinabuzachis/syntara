import { useCallback } from 'react'

import type { FilterConfig, FilterFieldDefinition, FilterOperator } from '../../types/filters'

/**
 * Custom hook for FilterBar event handlers
 */
export function useFilterBarHandlers(
  filters: FilterConfig[],
  onFilterChange: (filters: FilterConfig[]) => void,
  keywordField?: FilterFieldDefinition
) {
  // Handle keyword search - emit immediately
  const handleKeywordChange = useCallback(
    (_event: React.FormEvent<HTMLInputElement>, value: string) => {
      if (!keywordField) return

      // Add or update keyword filter immediately
      if (value.trim()) {
        const keywordFilter: FilterConfig = {
          key: keywordField.key,
          operator: keywordField.defaultOperator ?? 'contains',
          value: value.trim(),
        }

        const otherFilters = filters.filter((f) => f.key !== keywordField.key)
        onFilterChange([...otherFilters, keywordFilter])
      } else {
        // Remove keyword filter
        const otherFilters = filters.filter((f) => f.key !== keywordField.key)
        onFilterChange(otherFilters)
      }
    },
    [keywordField, filters, onFilterChange]
  )

  // Handle keyword search clear
  const handleKeywordClear = useCallback(() => {
    if (keywordField) {
      const otherFilters = filters.filter((f) => f.key !== keywordField.key)
      onFilterChange(otherFilters)
    }
  }, [keywordField, filters, onFilterChange])

  // Handle filter change for individual filters
  const handleFilterChange = useCallback(
    (fieldKey: string, filter: FilterConfig | null) => {
      if (filter) {
        // Add or update filter
        const otherFilters = filters.filter((f) => f.key !== fieldKey)
        onFilterChange([...otherFilters, filter])
      } else {
        // Remove filter
        const otherFilters = filters.filter((f) => f.key !== fieldKey)
        onFilterChange(otherFilters)
      }
    },
    [filters, onFilterChange]
  )

  // Handle date range filter change (multiple filters)
  const handleDateRangeChange = useCallback(
    (fieldKey: string, dateFilters: FilterConfig[]) => {
      // Remove existing filters for this field
      const otherFilters = filters.filter((f) => f.key !== fieldKey)
      onFilterChange([...otherFilters, ...dateFilters])
    },
    [filters, onFilterChange]
  )

  // Handle label filter change
  const handleLabelChange = useCallback(
    (labelParams: Record<string, string>) => {
      // LabelFilter.buildLabelParams already emits keys like "labels[env]"
      // so use the keys as-is without double-wrapping
      const labelFilters: FilterConfig[] = Object.entries(labelParams).map(([key, value]) => ({
        key,
        operator: 'eq' as const,
        value,
      }))

      // Remove existing label filters
      const otherFilters = filters.filter((f) => !f.key.startsWith('labels['))
      onFilterChange([...otherFilters, ...labelFilters])
    },
    [filters, onFilterChange]
  )

  // Handle chip removal (removes specific filter by key and operator)
  const handleChipRemove = useCallback(
    (fieldKey: string, operator?: FilterOperator) => {
      // Remove the filter matching both key and operator
      const otherFilters = filters.filter((f) => !(f.key === fieldKey && (f.operator ?? 'eq') === (operator ?? 'eq')))
      onFilterChange(otherFilters)
    },
    [filters, onFilterChange]
  )

  // Handle field removal (removes all filters with matching key)
  const handleFieldRemove = useCallback(
    (fieldKey: string) => {
      // Remove all filters with the matching key
      const otherFilters = filters.filter((f) => f.key !== fieldKey)
      onFilterChange(otherFilters)
    },
    [filters, onFilterChange]
  )

  // Handle clear all filters
  const handleClearAll = useCallback(() => {
    onFilterChange([])
  }, [onFilterChange])

  return {
    handleKeywordChange,
    handleKeywordClear,
    handleFilterChange,
    handleDateRangeChange,
    handleLabelChange,
    handleChipRemove,
    handleFieldRemove,
    handleClearAll,
  }
}
