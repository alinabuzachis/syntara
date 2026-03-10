import { ToolbarFilter, ToolbarGroup } from '@patternfly/react-core'

import type { FilterConfig, FilterFieldDefinition } from '../../types/filters'
import { FilterTypeEnum } from '../../types/filters'

import { BooleanFilter } from './BooleanFilter'
import { DateRangeFilter } from './DateRangeFilter'
import { getDateRangeValues, getFilterValue, getLabelFilters } from './filterBarHelpers'
import { LabelFilter } from './LabelFilter'
import { SelectFilter } from './SelectFilter'
import { TextFilter } from './TextFilter'

/**
 * Props for FilterFieldRenderer component
 */
interface FilterFieldRendererProps {
  /** Filter field definitions */
  fieldDefinitions: FilterFieldDefinition[]
  /** Current active filters */
  filters: FilterConfig[]
  /** Keyword field (excluded from rendering if keyword search enabled) */
  keywordFieldKey?: string
  /** Callback when filter changes */
  onFilterChange: (fieldKey: string, filter: FilterConfig | null) => void
  /** Callback when date range filter changes */
  onDateRangeChange: (fieldKey: string, dateFilters: FilterConfig[]) => void
  /** Callback when label filter changes */
  onLabelChange: (labelParams: Record<string, string>) => void
  /** Callback when field is removed via ToolbarFilter deleteLabel */
  onFieldRemove: (fieldKey: string) => void
}

/**
 * Renders individual filter components based on field type
 */
export function FilterFieldRenderer({
  fieldDefinitions,
  filters,
  keywordFieldKey,
  onFilterChange,
  onDateRangeChange,
  onLabelChange,
  onFieldRemove,
}: FilterFieldRendererProps) {
  return (
    <ToolbarGroup variant="filter-group">
      {fieldDefinitions
        .filter((field) => field.key !== keywordFieldKey)
        .map((field) => (
          <ToolbarFilter
            key={field.key}
            labels={filters.find((f) => f.key === field.key) ? [String(getFilterValue(filters, field.key))] : []}
            deleteLabel={() => onFieldRemove(field.key)}
            categoryName={field.label}
          >
            {field.type === FilterTypeEnum.TEXT && (
              <TextFilter
                fieldKey={field.key}
                label={field.label}
                operators={field.operators}
                value={String(getFilterValue(filters, field.key) ?? '')}
                onChange={(filter) => onFilterChange(field.key, filter)}
                defaultOperator={field.defaultOperator}
                placeholder={field.placeholder}
              />
            )}
            {field.type === FilterTypeEnum.SELECT && field.options && (
              <SelectFilter
                fieldKey={field.key}
                label={field.label}
                options={field.options}
                value={getFilterValue(filters, field.key) as string | string[] | undefined}
                onChange={(filter) => onFilterChange(field.key, filter)}
                isMulti={field.operators?.includes('in') ?? false}
                placeholder={field.placeholder}
              />
            )}
            {field.type === FilterTypeEnum.DATERANGE && (
              <DateRangeFilter
                fieldKey={field.key}
                label={field.label}
                startValue={getDateRangeValues(filters, field.key).startValue}
                endValue={getDateRangeValues(filters, field.key).endValue}
                onChange={(dateFilters) => onDateRangeChange(field.key, dateFilters)}
              />
            )}
            {field.type === FilterTypeEnum.BOOLEAN && (
              <BooleanFilter
                fieldKey={field.key}
                label={field.label}
                value={getFilterValue(filters, field.key) as boolean | undefined}
                onChange={(filter) => onFilterChange(field.key, filter)}
              />
            )}
            {field.type === FilterTypeEnum.LABELS && (
              <LabelFilter label={field.label} labels={getLabelFilters(filters)} onChange={onLabelChange} />
            )}
          </ToolbarFilter>
        ))}
    </ToolbarGroup>
  )
}
