export interface TriggerFormData {
  name?: string
  triggerType: string
  scheduleType?: string
  cron?: string
  timezone?: string
  interval?: string
  eventSource?: string
  eventType?: string
}

export interface ActionFormData {
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
}
