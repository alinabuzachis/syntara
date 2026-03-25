import { Button, Toolbar, ToolbarContent, ToolbarGroup, ToolbarItem, ToolbarFilter } from '@patternfly/react-core'
import { useCallback } from 'react'

import type { FilterConfig, FilterFieldDefinition } from '../../types/filters'
import { FilterTypeEnum } from '../../types/filters'

import { ActiveFilterChips } from './ActiveFilterChips'
import {
  convertLabelParamsToFilters,
  updateOrAddFilter,
  removeFiltersByKey,
  removeFilterByKeyAndOperator,
  replaceFiltersForField,
} from './filterBarUtils'
import { FilterTypeRenderer } from './FilterTypeRenderer'
import { TextFilter } from './TextFilter'

/**
 * Determines if a filter field should be rendered in the attribute search (TextFilter)
 * @param field - The filter field definition to check
 * @returns true if the field should appear in TextFilter (TEXT/SELECT/DATERANGE/MULTISELECT)
 */
function isAttributeSearchField(field: FilterFieldDefinition): boolean {
  return (
    field.type === FilterTypeEnum.TEXT ||
    field.type === FilterTypeEnum.SELECT ||
    field.type === FilterTypeEnum.DATERANGE ||
    field.type === FilterTypeEnum.MULTISELECT
  )
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

export function FilterBar({ fieldDefinitions, filters, onFilterChange, showClearAll = true }: FilterBarProps) {
  // Separate field definitions for TextFilter (TEXT/SELECT/DATERANGE/MULTISELECT) vs other filter types
  const attributeSearchFields = fieldDefinitions.filter(isAttributeSearchField)
  const otherFilterFields = fieldDefinitions.filter((f) => !isAttributeSearchField(f))
  const hasActiveFilters = filters.length > 0

  // Handle filter change from TextFilter
  const handleFilterUpdate = useCallback(
    (filter: FilterConfig | null, fieldKey?: string) => {
      if (filter) {
        onFilterChange(updateOrAddFilter(filters, filter))
      } else if (fieldKey) {
        onFilterChange(removeFiltersByKey(filters, fieldKey))
      }
    },
    [filters, onFilterChange]
  )

  // Handle filter removal
  const handleFilterRemove = useCallback(
    (fieldKey: string, operator?: FilterConfig['operator']) => {
      if (operator) {
        onFilterChange(removeFilterByKeyAndOperator(filters, fieldKey, operator))
      } else {
        onFilterChange(removeFiltersByKey(filters, fieldKey))
      }
    },
    [filters, onFilterChange]
  )

  // Handle category removal (all chips for a field)
  const handleCategoryRemove = useCallback(
    (fieldKey: string) => {
      onFilterChange(removeFiltersByKey(filters, fieldKey))
    },
    [filters, onFilterChange]
  )

  // Handle date range filter changes (gte/lte operators on same field)
  const handleDateRangeChange = useCallback(
    (fieldKey: string, dateFilters: FilterConfig[]) => {
      onFilterChange(replaceFiltersForField(filters, fieldKey, dateFilters))
    },
    [filters, onFilterChange]
  )

  // Handle label filter changes
  const handleLabelChange = useCallback(
    (fieldKey: string, labelParams: Record<string, string>) => {
      const labelFilters = convertLabelParamsToFilters(labelParams, fieldKey)
      onFilterChange(replaceFiltersForField(filters, fieldKey, labelFilters))
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
          {/* Text Filter - Field Selector + Value Input (TEXT/SELECT/DATERANGE) */}
          {attributeSearchFields.length > 0 && (
            <TextFilter
              key="text-filter"
              fieldDefinitions={attributeSearchFields}
              filters={filters}
              onFilterChange={handleFilterUpdate}
              onDateRangeChange={handleDateRangeChange}
            />
          )}

          {/* Other filter types (BOOLEAN, LABELS) - DATERANGE handled via TextFilter */}
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
        {showClearAll && hasActiveFilters && (
          <ToolbarItem>
            <Button variant="link" onClick={handleClearAll} isInline>
              Clear all filters
            </Button>
          </ToolbarItem>
        )}
      </ToolbarContent>

      {/* Active Filter Chips - Displayed on separate line below */}
      {hasActiveFilters && (
        <ToolbarContent>
          <ActiveFilterChips
            filters={filters}
            fieldDefinitions={fieldDefinitions}
            onChipRemove={handleFilterRemove}
            onCategoryRemove={handleCategoryRemove}
          />
        </ToolbarContent>
      )}
    </Toolbar>
  )
}
