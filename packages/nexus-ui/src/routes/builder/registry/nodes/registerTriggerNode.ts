import { PlayIcon } from '@patternfly/react-icons'

import {
  createEventTrigger,
  createManualTrigger,
  createScheduledTrigger,
  useWorkflowStore,
} from '../../../../stores/useWorkflowStore'
import type { TriggerFormData } from '../../hooks/useNodeCreation'
import { TriggerNodeForm } from '../../node-forms/TriggerNodeForm'
import { createCustomNode } from '../helpers/nodeTemplates'
import { NodeRegistry } from '../NodeRegistry'

/**
 * Register the Trigger node type
 */
export default function registerTriggerNode() {
  NodeRegistry.register(
    createCustomNode<TriggerFormData>(
      {
        id: 'trigger',
        label: 'Triggers',
        icon: PlayIcon,
        category: 'trigger',
        description: 'Start workflow execution with manual, scheduled, or event triggers',
        keywords: ['start', 'begin', 'manual', 'schedule', 'event', 'webhook'],
        order: 10,
        formComponent: TriggerNodeForm,
      },
      (data, onSuccess, onError) => {
        try {
          let trigger

          if (data.triggerType === 'manual') {
            trigger = createManualTrigger()
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
            useWorkflowStore.getState().addTrigger(trigger)
            onSuccess()
          } else {
            onError('Invalid trigger configuration. Please check your inputs.')
          }
        } catch (error) {
          onError(error instanceof Error ? error.message : 'Failed to add trigger')
        }
      }
    )
  )
}
