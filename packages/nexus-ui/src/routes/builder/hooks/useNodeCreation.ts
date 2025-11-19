import { useCallback } from 'react'

import {
  createApiActivity,
  createEventTrigger,
  createManualTrigger,
  createScheduledTrigger,
  createScriptActivity,
  useWorkflowStore,
} from '../../../stores/useWorkflowStore'

export interface TriggerFormData {
  name: string
  triggerType: string
  requiresApproval?: boolean
  scheduleType?: string
  cron?: string
  timezone?: string
  interval?: string
  eventSource?: string
  eventType?: string
}

export interface ActionFormData {
  name: string
  executor: string
  language?: string
  code?: string
  method?: string
  url?: string
  headers?: string
  body?: string
  parameters?: string
  requiresApproval?: boolean
}

export function useNodeCreation(onSuccess: () => void) {
  const addTrigger = useWorkflowStore((state) => state.addTrigger)
  const addActivity = useWorkflowStore((state) => state.addActivity)

  const handleTriggerSubmit = useCallback(
    (data: TriggerFormData) => {
      let trigger

      if (data.triggerType === 'manual') {
        trigger = createManualTrigger(data.requiresApproval)
      } else if (data.triggerType === 'scheduled' && data.scheduleType) {
        trigger = createScheduledTrigger(data.scheduleType as 'cron' | 'interval' | 'continuous', {
          cron: data.cron,
          timezone: data.timezone,
          interval: data.interval,
        })
      } else if (data.triggerType === 'event' && data.eventSource && data.eventType) {
        trigger = createEventTrigger(data.eventSource, data.eventType)
      }

      if (trigger) {
        addTrigger(trigger)
        onSuccess()
      }
    },
    [addTrigger, onSuccess]
  )

  const handleActionSubmit = useCallback(
    (data: ActionFormData) => {
      // Generate a unique ID for the activity that matches pattern ^[a-zA-Z_][a-zA-Z0-9_]*$
      // Convert UUID to valid identifier by removing dashes and prefixing with 'activity_'
      const activityId = `activity_${crypto.randomUUID().replace(/-/g, '_')}`

      let activity

      if (data.executor === 'script' && data.language && data.code) {
        activity = createScriptActivity(activityId, data.name, data.language as 'python' | 'javascript', data.code)
      } else if (data.executor === 'api' && data.method && data.url) {
        activity = createApiActivity(
          activityId,
          data.name,
          data.method as 'GET' | 'POST' | 'PUT' | 'DELETE',
          data.url,
          data.headers,
          data.body
        )
      }

      if (activity) {
        addActivity(activity)
        onSuccess()
      }
    },
    [addActivity, onSuccess]
  )

  return {
    handleTriggerSubmit,
    handleActionSubmit,
  }
}
