import type { FilterConfig } from '../../types/filters'

/**
 * Get filter value for a field
 */
export function getFilterValue(filters: FilterConfig[], fieldKey: string) {
  const filter = filters.find((f) => f.key === fieldKey)
  return filter?.value
}

/**
 * Get date range values for a field
 */
export function getDateRangeValues(filters: FilterConfig[], fieldKey: string) {
  const startFilter = filters.find((f) => f.key === fieldKey && (f.operator === 'gte' || f.operator === 'gt'))
  const endFilter = filters.find((f) => f.key === fieldKey && (f.operator === 'lte' || f.operator === 'lt'))

  // Helper to convert value to Date (handles both Date instances and ISO strings from URL)
  const toDate = (value: unknown): Date | undefined => {
    if (value instanceof Date) {
      return value
    }
    if (typeof value === 'string') {
      const date = new Date(value)
      return !Number.isNaN(date.getTime()) ? date : undefined
    }
    return undefined
  }

  return {
    startValue: toDate(startFilter?.value),
    endValue: toDate(endFilter?.value),
  }
}

/**
 * Get label filters from filter list
 */
export function getLabelFilters(filters: FilterConfig[]): Record<string, string> {
  const labelFilters = filters.filter((f) => f.key.startsWith('labels[') && f.key.endsWith(']'))
  const labels: Record<string, string> = {}

  labelFilters.forEach((filter) => {
    // Extract key from labels[key] format
    const match = filter.key.match(/^labels\[(.+)\]$/)
    if (match) {
      labels[match[1]] = String(filter.value)
    }
  })

  return labels
}
