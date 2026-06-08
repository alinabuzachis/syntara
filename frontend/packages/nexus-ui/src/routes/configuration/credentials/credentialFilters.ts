import type { FilterFieldDefinition } from '../../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../../types/filters'

export function getCredentialNameFilterDefinition(): FilterFieldDefinition {
  return {
    key: 'name',
    label: 'Keyword',
    type: FilterTypeEnum.TEXT,
    operators: [FilterOperatorEnum.CONTAINS],
    defaultOperator: FilterOperatorEnum.CONTAINS,
    placeholder: 'Filter by keyword',
  }
}
