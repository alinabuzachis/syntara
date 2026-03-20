import { ProviderStatusEnum } from '@ansible/nexus-contracts'

import type { FilterFieldDefinition } from '../../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../../types/filters'

// Re-export shared filter change handler
export { createFilterChangeHandler } from '../../../hooks/useFilterChangeHandler'

/**
 * Provider type labels for integration type filter
 */
export const PROVIDER_TYPE_LABELS: Record<string, string> = {
  mcp: 'MCP Server',
}

/**
 * Shared filter field definitions for integration name filtering
 */
export const getIntegrationNameFilterDefinition = (): FilterFieldDefinition => ({
  key: 'name',
  label: 'Name',
  type: FilterTypeEnum.TEXT,
  operators: [FilterOperatorEnum.CONTAINS],
  defaultOperator: FilterOperatorEnum.CONTAINS,
  placeholder: 'Filter by name',
})

/**
 * Shared filter field definitions for integration status filtering
 */
export const getIntegrationStatusFilterDefinition = (): FilterFieldDefinition => ({
  key: 'status',
  label: 'Status',
  type: FilterTypeEnum.SELECT,
  options: [
    { value: ProviderStatusEnum.AVAILABLE, label: 'Available' },
    { value: ProviderStatusEnum.ERROR, label: 'Error' },
    { value: ProviderStatusEnum.VALIDATING, label: 'Validating' },
  ],
  placeholder: 'Filter by status',
})

/**
 * Shared filter field definitions for integration type (provider_type) filtering
 */
export const getIntegrationTypeFilterDefinition = (): FilterFieldDefinition => ({
  key: 'provider_type',
  label: 'Integration type',
  type: FilterTypeEnum.SELECT,
  options: Object.entries(PROVIDER_TYPE_LABELS).map(([value, label]) => ({ value, label })),
  placeholder: 'Filter by integration type',
})
