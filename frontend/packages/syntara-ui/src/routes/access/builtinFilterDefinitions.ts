import type { FilterFieldDefinition } from '../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'

export const POLICY_NAME_FILTER_DEF: FilterFieldDefinition = {
  key: 'policy_name',
  label: 'Policy',
  type: FilterTypeEnum.TEXT,
  operators: [FilterOperatorEnum.CONTAINS],
  defaultOperator: FilterOperatorEnum.CONTAINS,
  placeholder: 'Filter by policy name',
}

export const builtinFilterDefinitions: FilterFieldDefinition[] = [
  {
    key: 'name',
    label: 'Name',
    type: FilterTypeEnum.TEXT,
    operators: [FilterOperatorEnum.CONTAINS],
    defaultOperator: FilterOperatorEnum.CONTAINS,
    placeholder: 'Filter by name',
  },
  {
    key: 'description',
    label: 'Description',
    type: FilterTypeEnum.TEXT,
    operators: [FilterOperatorEnum.CONTAINS],
    defaultOperator: FilterOperatorEnum.CONTAINS,
    placeholder: 'Filter by description',
  },
  POLICY_NAME_FILTER_DEF,
  {
    key: 'type',
    label: 'Type',
    type: FilterTypeEnum.SELECT,
    options: [
      { value: 'builtin', label: 'Built-in' },
      { value: 'custom', label: 'Custom' },
    ],
    placeholder: 'Filter by type',
  },
]
