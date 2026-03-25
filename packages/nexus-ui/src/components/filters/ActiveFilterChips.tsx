import { Label, LabelGroup, ToolbarItem } from '@patternfly/react-core'

import type { FilterConfig, FilterFieldDefinition, FilterOperator } from '../../types/filters'
import { WorkflowName } from '../WorkflowName'

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
  /** Callback when all chips for a category are removed */
  onCategoryRemove?: (fieldKey: string) => void
}

/**
 * Displays active filter chips grouped by field name
 */
export function ActiveFilterChips({
  filters,
  fieldDefinitions,
  onChipRemove,
  onCategoryRemove,
}: ActiveFilterChipsProps) {
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

        const handleCategoryClose = () => {
          onCategoryRemove?.(fieldKey)
        }

        return (
          <LabelGroup
            key={fieldKey}
            categoryName={categoryName}
            isClosable
            closeBtnAriaLabel={`Remove all ${categoryName} filters`}
            onClick={(event) => {
              // Check if the close button was clicked by inspecting the button element
              const target = event.target as HTMLElement
              const closeButton = target.closest('button[aria-label*="Remove all"]')
              if (closeButton) {
                handleCategoryClose()
              }
            }}
          >
            {fieldFilters.map((filter) => {
              const operator = filter.operator ?? 'eq'
              // Use composite key to handle duplicate keys (e.g., date ranges with gte/lte)
              const uniqueKey = `${filter.key}-${operator}`

              // Special handling for workflow_id filter - use WorkflowName component
              if (filter.key === 'workflow_id' && typeof filter.value === 'string') {
                return (
                  <Label key={uniqueKey} onClose={() => onChipRemove(filter.key, filter.operator)}>
                    <WorkflowName workflowId={filter.value} />
                  </Label>
                )
              }

              // Map filter value to display label
              const displayValue = (() => {
                // For IN operator with array values, map each value to its label
                if (operator === 'in' && Array.isArray(filter.value)) {
                  if (field?.options) {
                    const labels = filter.value
                      .map((val) => {
                        const option = field.options?.find((opt) => String(opt.value) === String(val))
                        return option?.label ?? String(val)
                      })
                      .filter(Boolean)
                    return labels.join(', ')
                  }
                  return filter.value.join(', ')
                }

                // If field has options (SELECT type), look up the label
                if (field?.options) {
                  const option = field.options.find((opt) => String(opt.value) === String(filter.value))
                  if (option) return option.label
                }

                // If field has getOptionLabel (async SELECT), use it to resolve the label
                if (field?.getOptionLabel) {
                  const label = field.getOptionLabel(String(filter.value))
                  if (label) return label
                }

                // For date range filters, add operator prefix to clarify start/end
                if (operator === 'gte' || operator === 'gt') {
                  return `From: ${String(filter.value)}`
                }
                if (operator === 'lte' || operator === 'lt') {
                  return `To: ${String(filter.value)}`
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
