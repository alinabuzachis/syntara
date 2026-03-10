import { Label, LabelGroup, ToolbarItem } from '@patternfly/react-core'

import type { FilterConfig, FilterFieldDefinition, FilterOperator } from '../../types/filters'

/**
 * Props for ActiveFilterChips component
 */
interface ActiveFilterChipsProps {
  /** Current active filters */
  filters: FilterConfig[]
  /** Filter field definitions */
  fieldDefinitions: FilterFieldDefinition[]
  /** Callback when chip is removed */
  onChipRemove: (fieldKey: string, operator?: FilterOperator) => void
}

/**
 * Displays active filter chips with remove buttons
 */
export function ActiveFilterChips({ filters, fieldDefinitions, onChipRemove }: ActiveFilterChipsProps) {
  if (filters.length === 0) return null

  return (
    <ToolbarItem>
      <LabelGroup categoryName="Active filters">
        {filters.map((filter) => {
          const field = fieldDefinitions.find((f) => f.key === filter.key)
          const operator = filter.operator ?? 'eq'
          // Use composite key to handle duplicate keys (e.g., date ranges with gte/lte)
          const uniqueKey = `${filter.key}-${operator}`
          return (
            <Label key={uniqueKey} onClose={() => onChipRemove(filter.key, filter.operator)}>
              {field?.label ?? filter.key}: {String(filter.value)}
            </Label>
          )
        })}
      </LabelGroup>
    </ToolbarItem>
  )
}
