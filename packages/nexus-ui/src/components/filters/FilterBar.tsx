import { Badge, Button, SearchInput, Toolbar, ToolbarContent, ToolbarItem } from '@patternfly/react-core'
import { FilterIcon } from '@patternfly/react-icons'
import { useMemo } from 'react'

import type { FilterConfig, FilterFieldDefinition } from '../../types/filters'
import { FilterTypeEnum } from '../../types/filters'

import { ActiveFilterChips } from './ActiveFilterChips'
import { FilterFieldRenderer } from './FilterFieldRenderer'
import { useFilterBarHandlers } from './useFilterBarHandlers'

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
  /** Placeholder for keyword search */
  searchPlaceholder?: string
  /** Show "Clear all filters" button */
  showClearAll?: boolean
  /** Enable keyword search (uses first text field with 'contains' operator) */
  keywordSearchEnabled?: boolean
}

/**
 * Filter toolbar component integrating all filter types
 *
 * Uses PatternFly Toolbar with:
 * - SearchInput for quick keyword search (optional)
 * - Filter dropdown selectors for each field
 * - Active filter chips (removable)
 * - "Clear all filters" button
 * - Filter count badge
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
 *   keywordSearchEnabled={true}
 * />
 * ```
 */
export function FilterBar({
  fieldDefinitions,
  filters,
  onFilterChange,
  searchPlaceholder = 'Filter by keyword',
  showClearAll = true,
  keywordSearchEnabled = true,
}: FilterBarProps) {
  // Find first text field for keyword search
  const keywordField = useMemo(
    () => fieldDefinitions.find((field) => field.type === FilterTypeEnum.TEXT),
    [fieldDefinitions]
  )

  // Derive keyword value from filters - fully controlled
  const keywordValue = useMemo(() => {
    if (!keywordField) return ''
    const keywordFilter = filters.find((f) => f.key === keywordField.key)
    return keywordFilter?.value ? String(keywordFilter.value) : ''
  }, [filters, keywordField])

  // Extract all event handlers to custom hook
  const {
    handleKeywordChange,
    handleKeywordClear,
    handleFilterChange,
    handleDateRangeChange,
    handleLabelChange,
    handleChipRemove,
    handleFieldRemove,
    handleClearAll,
  } = useFilterBarHandlers(filters, onFilterChange, keywordField)

  return (
    <Toolbar id="filter-toolbar" clearAllFilters={handleClearAll}>
      <ToolbarContent>
        {/* Keyword Search */}
        {keywordSearchEnabled && keywordField && (
          <ToolbarItem>
            <SearchInput
              placeholder={searchPlaceholder}
              value={keywordValue}
              onChange={handleKeywordChange}
              onClear={handleKeywordClear}
              aria-label="Filter by keyword"
            />
          </ToolbarItem>
        )}

        {/* Individual Filters */}
        <FilterFieldRenderer
          fieldDefinitions={fieldDefinitions}
          filters={filters}
          keywordFieldKey={keywordSearchEnabled ? keywordField?.key : undefined}
          onFilterChange={handleFilterChange}
          onDateRangeChange={handleDateRangeChange}
          onLabelChange={handleLabelChange}
          onFieldRemove={handleFieldRemove}
        />

        {/* Filter Count Badge */}
        {filters.length > 0 && (
          <ToolbarItem>
            <Badge isRead>
              <FilterIcon /> {filters.length} {filters.length === 1 ? 'filter' : 'filters'}
            </Badge>
          </ToolbarItem>
        )}

        {/* Clear All Filters Button */}
        {showClearAll && filters.length > 0 && (
          <ToolbarItem>
            <Button variant="link" onClick={handleClearAll}>
              Clear all filters
            </Button>
          </ToolbarItem>
        )}

        {/* Active Filter Chips */}
        <ActiveFilterChips filters={filters} fieldDefinitions={fieldDefinitions} onChipRemove={handleChipRemove} />
      </ToolbarContent>
    </Toolbar>
  )
}
