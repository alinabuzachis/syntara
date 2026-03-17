import { Button, Toolbar, ToolbarContent, ToolbarGroup, ToolbarItem, ToolbarFilter } from '@patternfly/react-core'
import { useCallback } from 'react'

import type { FilterConfig, FilterFieldDefinition } from '../../types/filters'
import { FilterTypeEnum } from '../../types/filters'

import { ActiveFilterChips } from './ActiveFilterChips'
import { BooleanFilter } from './BooleanFilter'
import { DateRangeFilter } from './DateRangeFilter'
import { LabelFilter } from './LabelFilter'
import { TextFilter } from './TextFilter'

/**
 * Props for FilterTypeRenderer component
 */
interface FilterTypeRendererProps {
  field: FilterFieldDefinition
  filters: FilterConfig[]
  onFilterUpdate: (filter: FilterConfig | null, fieldKey?: string) => void
  onDateRangeChange: (fieldKey: string, dateFilters: FilterConfig[]) => void
  onLabelChange: (fieldKey: string, labelParams: Record<string, string>) => void
}

/**
 * Renders the appropriate filter component based on field type
 */
function FilterTypeRenderer({
  field,
  filters,
  onFilterUpdate,
  onDateRangeChange,
  onLabelChange,
}: FilterTypeRendererProps) {
  if (field.type === FilterTypeEnum.BOOLEAN) {
    return (
      <BooleanFilter
        fieldKey={field.key}
        label={field.label}
        value={filters.find((f) => f.key === field.key)?.value as boolean | undefined}
        onChange={(filter) => onFilterUpdate(filter, field.key)}
      />
    )
  }

  if (field.type === FilterTypeEnum.DATERANGE) {
    const gteFilter = filters.find((f) => f.key === field.key && f.operator === 'gte')
    const lteFilter = filters.find((f) => f.key === field.key && f.operator === 'lte')
    return (
      <DateRangeFilter
        fieldKey={field.key}
        label={field.label}
        startValue={gteFilter?.value ? new Date(String(gteFilter.value)) : undefined}
        endValue={lteFilter?.value ? new Date(String(lteFilter.value)) : undefined}
        onChange={(dateFilters) => onDateRangeChange(field.key, dateFilters)}
      />
    )
  }

  if (field.type === FilterTypeEnum.LABELS) {
    const labelFilters = filters.filter((f) => f.key === field.key)
    const labelParams: Record<string, string> = {}
    labelFilters.forEach((filter) => {
      const value = String(filter.value)
      // Split on first colon only to preserve colons in values
      const colonIndex = value.indexOf(':')
      if (colonIndex > 0) {
        const key = value.slice(0, colonIndex)
        const val = value.slice(colonIndex + 1)
        // LabelFilter expects keys in "labels[key]" format
        if (key && val) labelParams[`labels[${key}]`] = val
      }
    })
    return (
      <LabelFilter
        label={field.label}
        labels={labelParams}
        onChange={(labelParams) => onLabelChange(field.key, labelParams)}
      />
    )
  }

  return null
}

/**
 * Props for FilterBar component
 */
export interface FilterBarProps {
  /** Filter field definitions */
  fieldDefinitions: FilterFieldDefinition[]
  /** Current active filters */
  filters: FilterConfig[]
  /** Callback when filters change */
  onFilterChange: (filters: FilterConfig[]) => void
  /** Show "Clear all filters" button */
  showClearAll?: boolean
}

/**
 * Filter toolbar component with text filter pattern
 *
 * Uses PatternFly Toolbar with:
 * - Attribute search (field selector + value input)
 * - Active filter chips (removable)
 * - "Clear all filters" button
 *
 * @example
 * ```tsx
 * <FilterBar
 *   fieldDefinitions={[
 *     { key: 'name', label: 'Name', type: 'text', defaultOperator: 'contains' },
 *     { key: 'status', label: 'Status', type: 'select', options: statusOptions }
 *   ]}
 *   filters={activeFilters}
 *   onFilterChange={(filters) => setFilters(filters)}
 * />
 * ```
 */
// eslint-disable-next-line max-lines-per-function -- FilterBar is primarily declarative JSX
export function FilterBar({ fieldDefinitions, filters, onFilterChange, showClearAll = true }: FilterBarProps) {
  // Separate field definitions for TextFilter (TEXT/SELECT) vs other filter types
  const attributeSearchFields = fieldDefinitions.filter(
    (f) => f.type === FilterTypeEnum.TEXT || f.type === FilterTypeEnum.SELECT
  )
  const otherFilterFields = fieldDefinitions.filter(
    (f) => f.type !== FilterTypeEnum.TEXT && f.type !== FilterTypeEnum.SELECT
  )

  // Handle filter change from TextFilter
  const handleFilterUpdate = useCallback(
    (filter: FilterConfig | null, fieldKey?: string) => {
      if (filter) {
        // Add or update filter - match on both key and operator for date ranges
        const existingIndex = filters.findIndex((f) => f.key === filter.key && f.operator === filter.operator)
        if (existingIndex >= 0) {
          const newFilters = [...filters]
          newFilters[existingIndex] = filter
          onFilterChange(newFilters)
        } else {
          onFilterChange([...filters, filter])
        }
      } else if (fieldKey) {
        // Remove filter by field key
        onFilterChange(filters.filter((f) => f.key !== fieldKey))
      }
    },
    [filters, onFilterChange]
  )

  // Handle filter removal
  const handleFilterRemove = useCallback(
    (fieldKey: string, operator?: FilterConfig['operator']) => {
      if (operator) {
        // Remove specific filter matching both key and operator
        onFilterChange(filters.filter((f) => !(f.key === fieldKey && f.operator === operator)))
      } else {
        // Remove all filters with this key
        onFilterChange(filters.filter((f) => f.key !== fieldKey))
      }
    },
    [filters, onFilterChange]
  )

  // Handle date range filter changes (gte/lte operators on same field)
  const handleDateRangeChange = useCallback(
    (fieldKey: string, dateFilters: FilterConfig[]) => {
      // Remove existing date filters for this field
      const otherFilters = filters.filter((f) => f.key !== fieldKey)
      // Add new date filters
      onFilterChange([...otherFilters, ...dateFilters])
    },
    [filters, onFilterChange]
  )

  // Handle label filter changes
  const handleLabelChange = useCallback(
    (fieldKey: string, labelParams: Record<string, string>) => {
      // Remove existing label filters for this field
      const otherFilters = filters.filter((f) => f.key !== fieldKey)
      // Convert label params to filter configs
      const labelFilters = Object.entries(labelParams).map(([paramKey, value]) => {
        // LabelFilter emits keys like "labels[team]" - extract the actual label key
        const match = paramKey.match(/^labels\[(.+)\]$/)
        const actualKey = match ? match[1] : paramKey
        return {
          key: fieldKey,
          operator: 'eq' as const,
          value: `${actualKey}:${value}`,
        }
      })
      onFilterChange([...otherFilters, ...labelFilters])
    },
    [filters, onFilterChange]
  )

  // Handle clear all
  const handleClearAll = useCallback(() => {
    onFilterChange([])
  }, [onFilterChange])

  return (
    <Toolbar id="filter-toolbar" clearAllFilters={handleClearAll}>
      <ToolbarContent>
        {/* Filter Controls Group */}
        <ToolbarGroup variant="filter-group">
          {/* Text Filter - Field Selector + Value Input (TEXT/SELECT only) */}
          {attributeSearchFields.length > 0 && (
            <TextFilter
              key="text-filter"
              fieldDefinitions={attributeSearchFields}
              filters={filters}
              onFilterChange={handleFilterUpdate}
            />
          )}

          {/* Other filter types (BOOLEAN, DATERANGE, LABELS) */}
          {otherFilterFields.map((field) => (
            <ToolbarFilter key={field.key} categoryName={field.label}>
              <FilterTypeRenderer
                field={field}
                filters={filters}
                onFilterUpdate={handleFilterUpdate}
                onDateRangeChange={handleDateRangeChange}
                onLabelChange={handleLabelChange}
              />
            </ToolbarFilter>
          ))}
        </ToolbarGroup>

        {/* Clear All Filters Button */}
        {showClearAll && filters.length > 0 && (
          <ToolbarItem>
            <Button variant="link" onClick={handleClearAll} isInline>
              Clear all filters
            </Button>
          </ToolbarItem>
        )}
      </ToolbarContent>

      {/* Active Filter Chips - Displayed on separate line below */}
      {filters.length > 0 && (
        <ToolbarContent>
          <ActiveFilterChips filters={filters} fieldDefinitions={fieldDefinitions} onChipRemove={handleFilterRemove} />
        </ToolbarContent>
      )}
    </Toolbar>
  )
}
