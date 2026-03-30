import type { FilterConfig, FilterFieldDefinition } from '../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'

import { BooleanFilter } from './BooleanFilter'
import { DateRangeFilter } from './DateRangeFilter'
import { parseFilterDate, parseLabelFilters } from './filterBarUtils'
import { LabelFilter } from './LabelFilter'
import { MultiSelectFilter } from './MultiSelectFilter'

/**
 * Props for FilterTypeRenderer component
 */
export interface FilterTypeRendererProps {
  field: FilterFieldDefinition
  filters: FilterConfig[]
  onFilterUpdate: (filter: FilterConfig | null, fieldKey?: string) => void
  onDateRangeChange: (fieldKey: string, dateFilters: FilterConfig[]) => void
  onLabelChange: (fieldKey: string, labelParams: Record<string, string>) => void
}

/**
 * Renders the appropriate filter component based on field type
 *
 * Handles rendering for:
 * - BOOLEAN: Toggle switch filter
 * - DATERANGE: Start/end date picker
 * - MULTISELECT: Checkbox dropdown filter
 * - LABELS: Key-value label filter
 *
 * Note: TEXT, SELECT, and DATERANGE types are handled by TextFilter
 * in the attributeSearchFields section of FilterBar, not by this renderer.
 *
 * @param props - FilterTypeRenderer props
 * @returns The appropriate filter component or null
 */
export function FilterTypeRenderer({
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
        startValue={parseFilterDate(gteFilter?.value)}
        endValue={parseFilterDate(lteFilter?.value)}
        onChange={(dateFilters) => onDateRangeChange(field.key, dateFilters)}
      />
    )
  }

  if (field.type === FilterTypeEnum.MULTISELECT) {
    const currentFilter = filters.find((f) => f.key === field.key)
    const selectedValues = currentFilter && Array.isArray(currentFilter.value) ? currentFilter.value : []
    return (
      <MultiSelectFilter
        fieldKey={field.key}
        label={field.label}
        options={field.options ?? []}
        selectedValues={selectedValues}
        onChange={onFilterUpdate}
        operator={field.operators?.[0] ?? FilterOperatorEnum.IN}
        placeholder={field.placeholder}
      />
    )
  }

  if (field.type === FilterTypeEnum.LABELS) {
    const labelParams = parseLabelFilters(filters, field.key)
    return (
      <LabelFilter
        label={field.label}
        labels={labelParams}
        onChange={(labelParams) => onLabelChange(field.key, labelParams)}
      />
    )
  }

  // TEXT, SELECT, DATERANGE handled by TextFilter
  return null
}
