import type { MissedSchedulePolicy, NodeSettings } from '@ansible/nexus-contracts'

export type TriggerFormData = {
  name?: string
  triggerType: string
  scheduleType?: string
  cron?: string
  timezone?: string
  interval?: string
  missedSchedulePolicy?: MissedSchedulePolicy
  eventSource?: string
  eventType?: string
  webhookPath?: string
  inputSchema?: string
}

export type ActionFormData = {
  name: string
  executor: 'script' | 'http_request'
  // Allow legacy or custom values to round-trip existing data.
  language?: string
  code?: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  url?: string
  authentication?: string
  headers?: string
  body?: string
  parameters?: string
  requiresApproval?: boolean
  credential_id?: string
  settings?: NodeSettings
}
