import type { FilterFieldDefinition } from '../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'

/**
 * Shared filter field definition for approval name filtering
 */
export const getApprovalNameFilterDefinition = (): FilterFieldDefinition => ({
  key: 'name',
  label: 'Name',
  type: FilterTypeEnum.TEXT,
  operators: [FilterOperatorEnum.CONTAINS],
  defaultOperator: FilterOperatorEnum.CONTAINS,
  placeholder: 'Filter by name',
})

/**
 * Shared filter field definition for approval status filtering
 */
export const getApprovalStatusFilterDefinition = (): FilterFieldDefinition => ({
  key: 'status',
  label: 'Status',
  type: FilterTypeEnum.SELECT,
  options: [
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'expired', label: 'Expired' },
    { value: 'cancelled', label: 'Cancelled' },
  ],
  placeholder: 'Filter by status',
})
