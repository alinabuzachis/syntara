import type { FilterFieldDefinition } from '../../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../../types/filters'

export const getProviderNameFilterDefinition = (): FilterFieldDefinition => ({
  key: 'name',
  label: 'Name',
  type: FilterTypeEnum.TEXT,
  operators: [FilterOperatorEnum.CONTAINS],
  defaultOperator: FilterOperatorEnum.CONTAINS,
  placeholder: 'Filter by name',
})

export const getProviderStatusFilterDefinition = (): FilterFieldDefinition => ({
  key: 'enabled',
  label: 'Status',
  type: FilterTypeEnum.SELECT,
  options: [
    { value: 'true', label: 'Enabled' },
    { value: 'false', label: 'Disabled' },
  ],
  placeholder: 'Filter by status',
})
