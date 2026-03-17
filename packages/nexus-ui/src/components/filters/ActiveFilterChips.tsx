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
 * Displays active filter chips grouped by field name
 */
export function ActiveFilterChips({ filters, fieldDefinitions, onChipRemove }: ActiveFilterChipsProps) {
  if (filters.length === 0) return null

  // Group filters by field key
  const filtersByField = filters.reduce(
    (acc, filter) => {
      if (!acc[filter.key]) {
        acc[filter.key] = []
      }
      acc[filter.key].push(filter)
      return acc
    },
    {} as Record<string, FilterConfig[]>
  )

  return (
    <ToolbarItem>
      {Object.entries(filtersByField).map(([fieldKey, fieldFilters]) => {
        const field = fieldDefinitions.find((f) => f.key === fieldKey)
        const categoryName = field?.label ?? fieldKey

        return (
          <LabelGroup key={fieldKey} categoryName={categoryName}>
            {fieldFilters.map((filter) => {
              const operator = filter.operator ?? 'eq'
              // Use composite key to handle duplicate keys (e.g., date ranges with gte/lte)
              const uniqueKey = `${filter.key}-${operator}`

              // Map filter value to display label for SELECT filters with options
              const displayValue = (() => {
                // If field has options (SELECT type), look up the label
                if (field?.options) {
                  const option = field.options.find((opt) => String(opt.value) === String(filter.value))
                  if (option) return option.label
                }
                // Fall back to raw value for TEXT, BOOLEAN without options, etc.
                return String(filter.value)
              })()

              return (
                <Label key={uniqueKey} onClose={() => onChipRemove(filter.key, filter.operator)}>
                  {displayValue}
                </Label>
              )
            })}
          </LabelGroup>
        )
      })}
    </ToolbarItem>
  )
}
