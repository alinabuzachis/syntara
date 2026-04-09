import type { FilterFieldDefinition } from '../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'

// Re-export shared filter change handler
export { createFilterChangeHandler } from '../../hooks/useFilterChangeHandler'

/**
 * Filter field definition for username filtering
 */
export const getUsernameFilterDefinition = (): FilterFieldDefinition => ({
  key: 'username',
  label: 'Username',
  type: FilterTypeEnum.TEXT,
  operators: [FilterOperatorEnum.CONTAINS],
  defaultOperator: FilterOperatorEnum.CONTAINS,
  placeholder: 'Filter by username',
})

/**
 * Filter field definition for user role filtering
 */
export const getUserRoleFilterDefinition = (): FilterFieldDefinition => ({
  key: 'role',
  label: 'Role',
  type: FilterTypeEnum.SELECT,
  operators: [FilterOperatorEnum.EQ],
  defaultOperator: FilterOperatorEnum.EQ,
  placeholder: 'Filter by role',
  options: [
    { value: 'administrator', label: 'Administrator' },
    { value: 'creator', label: 'Creator' },
    { value: 'approver', label: 'Approver' },
    { value: 'viewer', label: 'Viewer' },
  ],
})
