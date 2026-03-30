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
  /** Callback when chip is removed. Pass value to remove a single item from a multi-select array. */
  onChipRemove: (fieldKey: string, operator?: FilterOperator, value?: string) => void
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
              const target = event.target as HTMLElement
              const closeButton = target.closest('button[aria-label*="Remove all"]')
              if (closeButton) {
                handleCategoryClose()
              }
            }}
            aria-label={categoryName}
          >
            {fieldFilters.flatMap((filter) => {
              const operator = filter.operator ?? 'eq'

              if (Array.isArray(filter.value)) {
                return filter.value.map((val) => {
                  const displayLabel = field?.options?.find((opt) => opt.value === val)?.label ?? val
                  return (
                    <Label
                      key={`${filter.key}-${operator}-${val}`}
                      onClose={() => onChipRemove(filter.key, filter.operator, val)}
                    >
                      {displayLabel}
                    </Label>
                  )
                })
              }

              const uniqueKey = `${filter.key}-${operator}`

              if (filter.key === 'workflow_id' && typeof filter.value === 'string') {
                return (
                  <Label key={uniqueKey} onClose={() => onChipRemove(filter.key, filter.operator)}>
                    <WorkflowName workflowId={filter.value} />
                  </Label>
                )
              }

              const displayValue = (() => {
                if (field?.options) {
                  const option = field.options.find((opt) => String(opt.value) === String(filter.value))
                  if (option) return option.label
                }

                if (field?.getOptionLabel) {
                  const label = field.getOptionLabel(String(filter.value))
                  if (label) return label
                }

                if (operator === 'gte' || operator === 'gt') {
                  return `From: ${String(filter.value)}`
                }
                if (operator === 'lte' || operator === 'lt') {
                  return `To: ${String(filter.value)}`
                }

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
