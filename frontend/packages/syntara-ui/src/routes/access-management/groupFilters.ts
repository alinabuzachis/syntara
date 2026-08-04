import type { FilterFieldDefinition } from '../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'

// Re-export shared filter change handler
export { createFilterChangeHandler } from '../../hooks/useFilterChangeHandler'

/**
 * Filter field definition for group name filtering
 */
export const getGroupNameFilterDefinition = (): FilterFieldDefinition => ({
  key: 'name',
  label: 'Name',
  type: FilterTypeEnum.TEXT,
  operators: [FilterOperatorEnum.CONTAINS],
  defaultOperator: FilterOperatorEnum.CONTAINS,
  placeholder: 'Filter by name',
})

/**
 * Filter field definition for group description filtering
 */
export const getGroupDescriptionFilterDefinition = (): FilterFieldDefinition => ({
  key: 'description',
  label: 'Description',
  type: FilterTypeEnum.TEXT,
  operators: [FilterOperatorEnum.CONTAINS],
  defaultOperator: FilterOperatorEnum.CONTAINS,
  placeholder: 'Filter by description',
})
