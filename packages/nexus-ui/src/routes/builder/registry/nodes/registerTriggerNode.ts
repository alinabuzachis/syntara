import { TriggerTypeEnum } from '@ansible/nexus-contracts'
import { RhUiCalendarIcon, RhUiPlayIcon } from '@patternfly/react-icons'

import { RegistryNodeId } from '../../../../constants'
import { createManualTrigger, createScheduledTrigger, useWorkflowStore } from '../../../../stores/useWorkflowStore'
import type { Trigger } from '../../../../stores/workflowStoreTypes'
import type { TriggerFormData } from '../../hooks/useNodeCreation'
import { TriggerNodeForm } from '../../node-forms/TriggerNodeForm'
import { buildNamedTrigger } from '../../utils/nodeCreationHelpers'
import { getDefaultNodeBaseName } from '../../utils/nodeNaming'
import { createCustomNode } from '../helpers/nodeTemplates'
import { NodeRegistry } from '../NodeRegistry'

/**
 * Register the Trigger step type
 */
export default function registerTriggerNode() {
  NodeRegistry.register(
    createCustomNode<TriggerFormData>(
      {
        id: RegistryNodeId.TRIGGER,
        label: 'Triggers',
        icon: RhUiPlayIcon,
        category: 'trigger',
        description: 'Start workflow execution with manual, scheduled, or event triggers',
        keywords: ['start', 'begin', 'manual', 'schedule', 'event', 'webhook'],
        order: 100,
        selectionTitle: 'Select a trigger step',
        subtypes: [
          {
            id: RegistryNodeId.TRIGGER_MANUAL,
            label: 'Manual trigger',
            icon: RhUiPlayIcon,
            description: 'Automation will start when run is clicked.',
            formTitle: 'Configure Manual Triggers',
            initialData: { triggerType: TriggerTypeEnum.MANUAL_TRIGGER },
          },
          {
            id: RegistryNodeId.TRIGGER_SCHEDULED,
            label: 'Schedule trigger',
            icon: RhUiCalendarIcon,
            description: 'Automation will start based on a schedule.',
            formTitle: 'Configure Schedule Triggers',
            initialData: { triggerType: TriggerTypeEnum.SCHEDULED },
          },
        ],
        formComponent: TriggerNodeForm,
      },
      (data, onSuccess, onError) => {
        try {
          const baseName = getDefaultNodeBaseName({ nodeTypeId: RegistryNodeId.TRIGGER, label: 'Trigger' })
          const { trigger } = buildNamedTrigger(baseName, data.name, (triggerId, name) => {
            if (data.triggerType === TriggerTypeEnum.MANUAL_TRIGGER) {
              return createManualTrigger(triggerId, undefined, name)
            }
            if (data.triggerType === TriggerTypeEnum.SCHEDULED && data.scheduleType) {
              return createScheduledTrigger(
                triggerId,
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
            useWorkflowStore.getState().addTrigger(trigger as unknown as Trigger)
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
