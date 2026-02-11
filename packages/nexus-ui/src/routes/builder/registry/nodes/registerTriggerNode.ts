import { RhUiCalendarIcon, RhUiPlayIcon } from '@patternfly/react-icons'

import { createManualTrigger, createScheduledTrigger, useWorkflowStore } from '../../../../stores/useWorkflowStore'
import type { TriggerFormData } from '../../hooks/useNodeCreation'
import { TriggerNodeForm } from '../../node-forms/TriggerNodeForm'
import { buildNamedTrigger } from '../../utils/nodeCreationHelpers'
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
        icon: RhUiPlayIcon,
        category: 'trigger',
        description: 'Start workflow execution with manual, scheduled, or event triggers',
        keywords: ['start', 'begin', 'manual', 'schedule', 'event', 'webhook'],
        order: 100,
        selectionTitle: 'Select a trigger node',
        subtypes: [
          {
            id: 'trigger-manual',
            label: 'Manual trigger',
            icon: RhUiPlayIcon,
            description: 'Automation will start when run is clicked.',
            formTitle: 'Configure Manual Triggers',
            initialData: { triggerType: 'manual' },
          },
          {
            id: 'trigger-scheduled',
            label: 'Schedule trigger',
            icon: RhUiCalendarIcon,
            description: 'Automation will start based on a schedule.',
            formTitle: 'Configure Schedule Triggers',
            initialData: { triggerType: 'scheduled' },
          },
        ],
        formComponent: TriggerNodeForm,
      },
      (data, onSuccess, onError) => {
        try {
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
            return null
          })

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
