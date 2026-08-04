import { DatePicker, Flex, FlexItem } from '@patternfly/react-core'
import { useCallback } from 'react'

import type { FilterConfig, FilterOperator } from '../../types/filters'
import { formatDateForApi } from '../../utils/dateUtils'

/**
 * Props for DateRangeFilter component
 */
export type DateRangeFilterProps = {
  /** Filter field key (e.g., 'created_at', 'updated_at') */
  fieldKey: string
  /** Display label for the filter */
  label: string
  /** Current start date value */
  startValue?: Date
  /** Current end date value */
  endValue?: Date
  /** Callback when filter changes */
  onChange: (filters: FilterConfig[]) => void
  /** Start date operator (default: 'gte') */
  startOperator?: FilterOperator
  /** End date operator (default: 'lte') */
  endOperator?: FilterOperator
}

/**
 * Date range filter component with start and end date pickers
 *
 * Fully controlled component - parent manages start/end values via props.
 * Uses PatternFly DatePicker for date selection.
 * Supports operators: 'gt', 'gte', 'lt', 'lte' (defaults to 'gte'/'lte' for ranges).
 * Emits FilterConfig[] with ISO 8601 formatted dates.
 *
 * @example
 * ```tsx
 * <DateRangeFilter
 *   fieldKey="created_at"
 *   label="Created Date"
 *   startValue={startDate}
 *   endValue={endDate}
 *   onChange={(filters) => handleDateRangeChange('created_at', filters)}
 * />
 * ```
 */
export function DateRangeFilter({
  fieldKey,
  label,
  startValue,
  endValue,
  onChange,
  startOperator = 'gte',
  endOperator = 'lte',
}: DateRangeFilterProps) {
  // Emit filter configs for both dates
  const emitFilters = useCallback(
    (start: Date | undefined, end: Date | undefined) => {
      const filters: FilterConfig[] = []

      if (start) {
        // Normalize to UTC start of day
        const startOfDay = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0))

        filters.push({
          key: fieldKey,
          operator: startOperator,
          value: formatDateForApi(startOfDay),
        })
      }

      if (end) {
        // Normalize to UTC end of day
        const endOfDay = new Date(Date.UTC(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999))

        filters.push({
          key: fieldKey,
          operator: endOperator,
          value: formatDateForApi(endOfDay),
        })
      }

      onChange(filters)
    },
    [fieldKey, startOperator, endOperator, onChange]
  )

  // Handle start date change - use current prop values
  const handleStartDateChange = useCallback(
    (_event: React.FormEvent<HTMLInputElement>, _value: string, date?: Date) => {
      emitFilters(date, endValue)
    },
    [endValue, emitFilters]
  )

  // Handle end date change - use current prop values
  const handleEndDateChange = useCallback(
    (_event: React.FormEvent<HTMLInputElement>, _value: string, date?: Date) => {
      emitFilters(startValue, date)
    },
    [startValue, emitFilters]
  )

  return (
    <Flex gap={{ default: 'gapSm' }}>
      <FlexItem>
        <DatePicker
          value={startValue ? startValue.toISOString().split('T')[0] : ''}
          onChange={handleStartDateChange}
          aria-label={`${label} start date`}
          placeholder="Start date"
        />
      </FlexItem>
      <FlexItem>to</FlexItem>
      <FlexItem>
        <DatePicker
          value={endValue ? endValue.toISOString().split('T')[0] : ''}
          onChange={handleEndDateChange}
          aria-label={`${label} end date`}
          placeholder="End date"
          rangeStart={startValue}
        />
      </FlexItem>
    </Flex>
  )
}
