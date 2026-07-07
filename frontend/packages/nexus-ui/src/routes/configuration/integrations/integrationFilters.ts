import { IntegrationStatusEnum, IntegrationTypeEnum } from '@ansible/nexus-contracts'

import type { FilterFieldDefinition } from '../../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../../types/filters'

/** Credential type names allowed per integration type. Maps to the backend's ALLOWED_CREDENTIAL_TYPES. */
export const CREDENTIAL_TYPES_BY_INTEGRATION: Record<string, string[]> = {
  [IntegrationTypeEnum.MCP_SERVER]: ['HTTP Bearer Token'],
  [IntegrationTypeEnum.LLM_PROVIDER]: ['LLM Provider'],
  [IntegrationTypeEnum.ANSIBLE_AUTOMATION_PLATFORM]: ['Ansible Automation Platform'],
}

export const INTEGRATION_TYPE_LABELS: Record<string, string> = {
  [IntegrationTypeEnum.MCP_SERVER]: 'MCP Server',
  [IntegrationTypeEnum.LLM_PROVIDER]: 'LLM Provider',
  [IntegrationTypeEnum.ANSIBLE_AUTOMATION_PLATFORM]: 'Ansible Automation Platform',
}

export const getIntegrationNameFilterDefinition = (): FilterFieldDefinition => ({
  key: 'name',
  label: 'Name',
  type: FilterTypeEnum.TEXT,
  operators: [FilterOperatorEnum.CONTAINS],
  defaultOperator: FilterOperatorEnum.CONTAINS,
  placeholder: 'Filter by name',
})

export const getIntegrationStatusFilterDefinition = (): FilterFieldDefinition => ({
  key: 'validation_status',
  label: 'Status',
  type: FilterTypeEnum.SELECT,
  options: [
    { value: IntegrationStatusEnum.AVAILABLE, label: 'Available' },
    { value: IntegrationStatusEnum.ERROR, label: 'Error' },
    { value: IntegrationStatusEnum.VALIDATING, label: 'Validating' },
  ],
  placeholder: 'Filter by status',
})

export const getIntegrationTypeFilterDefinition = (): FilterFieldDefinition => ({
  key: 'integration_type',
  label: 'Integration type',
  type: FilterTypeEnum.SELECT,
  options: Object.entries(INTEGRATION_TYPE_LABELS).map(([value, label]) => ({ value, label })),
  placeholder: 'Filter by integration type',
})
