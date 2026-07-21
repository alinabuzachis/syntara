import type { FilterConfig, FilterFieldDefinition } from '../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'

/**
 * Transform single is_enabled string values to boolean for eq filters.
 * MULTISELECT IN values stay as string[] (`true`/`false`) for `is_enabled[in]=…`.
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
    type: FilterTypeEnum.MULTISELECT,
    operators: [FilterOperatorEnum.IN],
    defaultOperator: FilterOperatorEnum.IN,
    options: [
      { value: 'true', label: 'Enabled' },
      { value: 'false', label: 'Disabled' },
    ],
    placeholder: 'Filter by state',
  },
]
