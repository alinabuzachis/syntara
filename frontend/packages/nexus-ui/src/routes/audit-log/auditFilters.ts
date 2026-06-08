import type { FilterFieldDefinition } from '../../types/filters'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'

export const getAuditCategoryFilterDefinition = (): FilterFieldDefinition => ({
  key: 'event_category',
  label: 'Event type',
  type: FilterTypeEnum.SELECT,
  options: [
    { value: 'user_action', label: 'User Action' },
    { value: 'workflow_event', label: 'Workflow Event' },
    { value: 'agent_interaction', label: 'Agent Interaction' },
    { value: 'llm_interaction', label: 'LLM Interaction' },
    { value: 'llm_tool_call', label: 'LLM Tool Call' },
    { value: 'llm_reasoning', label: 'LLM Reasoning' },
    { value: 'api_execution', label: 'API Execution' },
    { value: 'system_operation', label: 'System Operation' },
    { value: 'security_event', label: 'Security Event' },
  ],
  placeholder: 'Filter by event type',
  searchable: false,
})

export const getAuditUsernameFilterDefinition = (): FilterFieldDefinition => ({
  key: 'actor_username',
  label: 'User',
  type: FilterTypeEnum.TEXT,
  placeholder: 'Filter by username',
})

export const getAuditActorTypeFilterDefinition = (): FilterFieldDefinition => ({
  key: 'actor_type',
  label: 'Actor type',
  type: FilterTypeEnum.SELECT,
  options: [
    { value: 'user', label: 'User' },
    { value: 'system', label: 'System' },
    { value: 'service', label: 'Service' },
  ],
  placeholder: 'Filter by actor type',
  searchable: false,
})

export const getAuditStatusFilterDefinition = (): FilterFieldDefinition => ({
  key: 'event_status',
  label: 'Status',
  type: FilterTypeEnum.SELECT,
  options: [
    { value: 'success', label: 'Success' },
    { value: 'error', label: 'Error' },
  ],
  placeholder: 'Filter by status',
  searchable: false,
})

export const getAuditSeverityFilterDefinition = (): FilterFieldDefinition => ({
  key: 'event_severity',
  label: 'Severity',
  type: FilterTypeEnum.SELECT,
  options: [
    { value: 'info', label: 'Info' },
    { value: 'warning', label: 'Warning' },
    { value: 'error', label: 'Error' },
    { value: 'critical', label: 'Critical' },
  ],
  placeholder: 'Filter by severity',
  searchable: false,
})

export const getAuditResourceFilterDefinition = (): FilterFieldDefinition => ({
  key: 'resource_name',
  label: 'Resource',
  type: FilterTypeEnum.TEXT,
  placeholder: 'Filter by resource name',
})

export const getAuditDateFilterDefinition = (): FilterFieldDefinition => ({
  key: 'created_at',
  label: 'Date',
  type: FilterTypeEnum.DATERANGE,
  operators: [FilterOperatorEnum.GTE, FilterOperatorEnum.LTE],
})
