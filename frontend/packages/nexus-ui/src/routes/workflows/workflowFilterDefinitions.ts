import type { FilterConfig, FilterFieldDefinition } from '../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'

/**
 * Transform is_enabled string values to boolean for API query params.
 * SELECT eq values arrive as `'true'`/`'false'` strings and must become booleans.
 */
export const transformIsEnabledFilter = (filters: FilterConfig[]): FilterConfig[] =>
  filters.map((filter) => {
    if (filter.key === 'is_enabled' && typeof filter.value === 'string') {
      return { ...filter, value: filter.value === 'true' }
    }
    return filter
  })

export const workflowFilterDefinitions: FilterFieldDefinition[] = [
  {
    key: 'name',
    label: 'Name',
    type: FilterTypeEnum.TEXT,
    operators: [FilterOperatorEnum.CONTAINS],
    defaultOperator: FilterOperatorEnum.CONTAINS,
    placeholder: 'Filter by name',
  },
  {
    key: 'is_enabled',
    label: 'State',
    type: FilterTypeEnum.SELECT,
    options: [
      { value: 'false', label: 'Draft' },
      {
        value: 'true',
        label: 'Published',
        description: 'Includes workflows showing as Published or Unpublished changes',
      },
    ],
    placeholder: 'Filter by state',
  },
]
