import type { FilterConfig } from '../../types/filters'

/**
 * Parses a date value safely, returning undefined for invalid dates
 *
 * @param value - The value to parse as a date
 * @returns Parsed Date object or undefined if invalid
 *
 * @example
 * ```typescript
 * parseFilterDate('2024-01-01') // → Date object
 * parseFilterDate(null) // → undefined
 * parseFilterDate('invalid') // → undefined
 * parseFilterDate(NaN) // → undefined
 * ```
 */
/**
 * Parses a date string, extracting the YYYY-MM-DD portion as a local Date
 * to avoid timezone shifts when UTC midnight rolls back a day in western timezones.
 */
function parseDateString(value: string): Date | undefined {
  const datePart = value.split('T')[0]
  if (datePart) {
    const [year, month, day] = datePart.split('-').map(Number)
    if (year && month && day) {
      return new Date(year, month - 1, day)
    }
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

export function parseFilterDate(value: unknown): Date | undefined {
  if (value === null || value === undefined || value === '') return undefined
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value
  if (typeof value === 'string') return parseDateString(value)
  if (typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date
  }
  return undefined
}

/**
 * Converts label filter values to label parameter format
 *
 * @param filters - Array of label filter configs
 * @param fieldKey - The field key for label filters
 * @returns Object with label parameters in "labels[key]" format
 *
 * @example
 * ```typescript
 * parseLabelFilters([
 *   { key: 'labels', operator: 'eq', value: 'env:prod' },
 *   { key: 'labels', operator: 'eq', value: 'team:platform' }
 * ], 'labels')
 * // → { 'labels[env]': 'prod', 'labels[team]': 'platform' }
 * ```
 */
export function parseLabelFilters(filters: FilterConfig[], fieldKey: string): Record<string, string> {
  const labelFilters = filters.filter((f) => f.key === fieldKey)
  const labelParams: Record<string, string> = {}

  labelFilters.forEach((filter) => {
    const value = String(filter.value)
    // Split on first colon only to preserve colons in values
    const colonIndex = value.indexOf(':')
    if (colonIndex > 0) {
      const key = value.slice(0, colonIndex)
      const val = value.slice(colonIndex + 1)
      // LabelFilter expects keys in "labels[key]" format
      if (key && val) {
        labelParams[`labels[${key}]`] = val
      }
    }
  })

  return labelParams
}

/**
 * Converts label parameters to filter configs
 *
 * @param labelParams - Label parameters in "labels[key]" format
 * @param fieldKey - The field key for label filters
 * @returns Array of filter configs
 *
 * @example
 * ```typescript
 * convertLabelParamsToFilters({ 'labels[env]': 'prod' }, 'labels')
 * // → [{ key: 'labels', operator: 'eq', value: 'env:prod' }]
 * ```
 */
export function convertLabelParamsToFilters(labelParams: Record<string, string>, fieldKey: string): FilterConfig[] {
  return Object.entries(labelParams).map(([paramKey, value]) => {
    // LabelFilter emits keys like "labels[team]" - extract the actual label key
    const match = paramKey.match(/^labels\[(.+)\]$/)
    const actualKey = match ? match[1] : paramKey
    return {
      key: fieldKey,
      operator: 'eq' as const,
      value: `${actualKey}:${value}`,
    }
  })
}

/**
 * Updates or adds a filter in the filters array
 *
 * @param filters - Current filters array
 * @param filter - Filter to add or update
 * @returns New filters array
 *
 * @example
 * ```typescript
 * const filters = [{ key: 'name', operator: 'contains', value: 'old' }]
 * updateOrAddFilter(filters, { key: 'name', operator: 'contains', value: 'new' })
 * // → [{ key: 'name', operator: 'contains', value: 'new' }]
 * ```
 */
export function updateOrAddFilter(filters: FilterConfig[], filter: FilterConfig): FilterConfig[] {
  const existingIndex = filters.findIndex((f) => f.key === filter.key && f.operator === filter.operator)

  if (existingIndex >= 0) {
    // Update existing filter
    const newFilters = [...filters]
    newFilters[existingIndex] = filter
    return newFilters
  }

  // Add new filter
  return [...filters, filter]
}

/**
 * Removes filters by field key
 *
 * @param filters - Current filters array
 * @param fieldKey - Field key to remove
 * @returns New filters array without the specified field
 *
 * @example
 * ```typescript
 * const filters = [
 *   { key: 'name', operator: 'contains', value: 'test' },
 *   { key: 'status', operator: 'eq', value: 'active' }
 * ]
 * removeFiltersByKey(filters, 'name')
 * // → [{ key: 'status', operator: 'eq', value: 'active' }]
 * ```
 */
export function removeFiltersByKey(filters: FilterConfig[], fieldKey: string): FilterConfig[] {
  return filters.filter((f) => f.key !== fieldKey)
}

/**
 * Removes a specific filter by key and operator
 *
 * @param filters - Current filters array
 * @param fieldKey - Field key
 * @param operator - Filter operator
 * @returns New filters array without the specific filter
 *
 * @example
 * ```typescript
 * const filters = [
 *   { key: 'created_at', operator: 'gte', value: '2024-01-01' },
 *   { key: 'created_at', operator: 'lte', value: '2024-12-31' }
 * ]
 * removeFilterByKeyAndOperator(filters, 'created_at', 'gte')
 * // → [{ key: 'created_at', operator: 'lte', value: '2024-12-31' }]
 * ```
 */
export function removeFilterByKeyAndOperator(
  filters: FilterConfig[],
  fieldKey: string,
  operator: FilterConfig['operator']
): FilterConfig[] {
  return filters.filter((f) => !(f.key === fieldKey && f.operator === operator))
}

/**
 * Replaces all filters for a field with new filters
 *
 * @param filters - Current filters array
 * @param fieldKey - Field key to replace filters for
 * @param newFilters - New filters for the field
 * @returns New filters array
 *
 * @example
 * ```typescript
 * const filters = [
 *   { key: 'created_at', operator: 'gte', value: '2024-01-01' },
 *   { key: 'name', operator: 'contains', value: 'test' }
 * ]
 * replaceFiltersForField(filters, 'created_at', [
 *   { key: 'created_at', operator: 'gte', value: '2024-02-01' },
 *   { key: 'created_at', operator: 'lte', value: '2024-02-28' }
 * ])
 * // → [
 * //   { key: 'name', operator: 'contains', value: 'test' },
 * //   { key: 'created_at', operator: 'gte', value: '2024-02-01' },
 * //   { key: 'created_at', operator: 'lte', value: '2024-02-28' }
 * // ]
 * ```
 */
export function replaceFiltersForField(
  filters: FilterConfig[],
  fieldKey: string,
  newFilters: FilterConfig[]
): FilterConfig[] {
  const otherFilters = filters.filter((f) => f.key !== fieldKey)
  return [...otherFilters, ...newFilters]
}
