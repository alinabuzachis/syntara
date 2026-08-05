import { Button, Toolbar, ToolbarContent, ToolbarGroup, ToolbarItem, ToolbarFilter } from '@patternfly/react-core'
import type { ReactNode } from 'react'
import { useCallback } from 'react'

import type { FilterConfig, FilterFieldDefinition } from '../../types/filters'
import { FilterTypeEnum } from '../../types/filters'

import { ActiveFilterChips } from './ActiveFilterChips'
import styles from './FilterBar.module.css'
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
 * @returns true if the field should appear in TextFilter (TEXT/SELECT/MULTISELECT/DATERANGE)
 */
function isAttributeSearchField(field: FilterFieldDefinition): boolean {
  return (
    field.type === FilterTypeEnum.TEXT ||
    field.type === FilterTypeEnum.SELECT ||
    field.type === FilterTypeEnum.MULTISELECT ||
    field.type === FilterTypeEnum.DATERANGE
  )
}

/**
 * Props for FilterBar component
 */
export type FilterBarProps = {
  /** Filter field definitions */
  fieldDefinitions: FilterFieldDefinition[]
  /** Current active filters */
  filters: FilterConfig[]
  /** Callback when filters change */
  onFilterChange: (filters: FilterConfig[]) => void
  /** Show "Clear all filters" button */
  showClearAll?: boolean
  /** Callback to clear all filters */
  clearAllFilters?: () => void
  /** Compact mode for narrow panels (reduces padding, hides clear-all) */
  isCompact?: boolean
  /** Additional class name applied to the root `Toolbar` element. */
  className?: string
  /** Page controls placed after filter inputs (e.g. refresh, timestamps). Not for keyword search until backend/strategy is defined. */
  toolbarItemsAfterFilters?: ReactNode
  /** Page controls aligned to the toolbar end (e.g. primary actions) */
  toolbarEnd?: ReactNode
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

export function FilterBar({
  fieldDefinitions,
  filters,
  onFilterChange,
  showClearAll = true,
  clearAllFilters,
  isCompact = false,
  toolbarItemsAfterFilters,
  toolbarEnd,
  className,
}: FilterBarProps) {
  // Attribute search: TEXT/SELECT/MULTISELECT/DATERANGE. Standalone: BOOLEAN/LABELS (via FilterTypeRenderer).
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

  // Handle filter removal (supports removing individual values from multi-select arrays)
  const handleFilterRemove = useCallback(
    (fieldKey: string, operator?: FilterConfig['operator'], value?: string) => {
      if (value) {
        const filter = filters.find((f) => f.key === fieldKey && f.operator === operator)
        if (filter && Array.isArray(filter.value)) {
          const remaining = filter.value.filter((v) => v !== value)
          if (remaining.length === 0) {
            onFilterChange(filters.filter((f) => !(f.key === fieldKey && f.operator === operator)))
          } else {
            onFilterChange(filters.map((f) => (f === filter ? { ...f, value: remaining } : f)))
          }
          return
        }
      }
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
    if (clearAllFilters) {
      clearAllFilters()
    } else {
      onFilterChange([])
    }
  }, [clearAllFilters, onFilterChange])

  const effectiveShowClearAll = isCompact ? false : showClearAll

  return (
    <Toolbar
      role="search"
      aria-label="Filters"
      clearAllFilters={handleClearAll}
      className={[isCompact ? styles.compact : undefined, className].filter(Boolean).join(' ') || undefined}
    >
      <ToolbarContent>
        {/* Filter Controls Group */}
        <ToolbarGroup variant="filter-group" className={isCompact ? styles.compactFilterGroup : undefined}>
          {/* Text Filter - Field Selector + Value Input (TEXT/SELECT/DATERANGE) */}
          {attributeSearchFields.length > 0 && (
            <TextFilter
              key="text-filter"
              fieldDefinitions={attributeSearchFields}
              filters={filters}
              onFilterChange={handleFilterUpdate}
              onDateRangeChange={handleDateRangeChange}
              isCompact={isCompact}
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

        {toolbarItemsAfterFilters && (
          <ToolbarGroup variant="action-group">
            <ToolbarItem>{toolbarItemsAfterFilters}</ToolbarItem>
          </ToolbarGroup>
        )}

        {/* Clear All Filters Button */}
        {effectiveShowClearAll && hasActiveFilters && (
          <ToolbarItem alignSelf="center">
            <Button variant="link" onClick={handleClearAll} isInline>
              Clear all filters
            </Button>
          </ToolbarItem>
        )}

        {toolbarEnd && (
          <ToolbarGroup variant="action-group" align={{ default: 'alignEnd' }}>
            <ToolbarItem>{toolbarEnd}</ToolbarItem>
          </ToolbarGroup>
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
