import { useCallback } from 'react'

import {
  createApiActivity,
  createEventTrigger,
  createManualTrigger,
  createScheduledTrigger,
  createScriptActivity,
  useWorkflowStoreActions,
} from '../../../stores/useWorkflowStore'
import { buildNamedActivity, buildNamedTrigger } from '../utils/nodeCreationHelpers'

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
  // Use action accessor - component won't re-render when store state changes
  const { addTrigger, addActivity } = useWorkflowStoreActions()

  const handleTriggerSubmit = useCallback(
    (data: TriggerFormData) => {
      const { trigger } = buildNamedTrigger('Trigger', data.name, (name) => {
        if (data.triggerType === 'manual') {
          return createManualTrigger(undefined, name)
        }
        if (data.triggerType === 'scheduled' && data.scheduleType) {
          return createScheduledTrigger(
            data.scheduleType as 'cron' | 'interval' | 'continuous',
            {
              cron: data.cron,
              timezone: data.timezone,
              interval: data.interval,
            },
            name
          )
        }
        if (data.triggerType === 'event' && data.eventSource && data.eventType) {
          return createEventTrigger(data.eventSource, data.eventType, undefined, name)
        }
        return null
      })

      if (trigger) {
        addTrigger(trigger)
        onSuccess()
      }
    },
    [addTrigger, onSuccess]
  )

  const handleActionSubmit = useCallback(
    (data: ActionFormData) => {
      const baseName = data.executor === 'api' ? 'REST Api' : 'Script'
      const { activity } = buildNamedActivity(baseName, data.name, (id, name) => {
        if (data.executor === 'script' && data.language && data.code) {
          return createScriptActivity(id, name, data.language as 'python' | 'javascript', data.code)
        }
        if (data.executor === 'api' && data.method && data.url) {
          return createApiActivity(
            id,
            name,
            data.method as 'GET' | 'POST' | 'PUT' | 'DELETE',
            data.url,
            data.headers,
            data.body
          )
        }
        return null
      })

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
