import { TriggerTypeEnum, WEBHOOK_TRIGGER_TYPES } from '@ansible/nexus-contracts'
import { RhUiCalendarIcon, RhUiLanguageIcon, RhUiPlayIcon } from '@patternfly/react-icons'

import EdaIcon from '../../../../assets/eda.svg?react'
import { RegistryNodeId } from '../../../../constants'
import {
  createManualTrigger,
  createScheduledTrigger,
  createEdaTrigger,
  createWebhookTrigger,
  useWorkflowStore,
} from '../../../../stores/useWorkflowStore'
import { parseJsonSchema } from '../../../../utils/jsonSafeParse'
import { normalizeWebhookPath } from '../../../../utils/webhookPath'
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
        keywords: ['start', 'begin', 'manual', 'schedule', 'event', 'webhook', 'api', 'http', 'eda'],
        order: 100,
        selectionTitle: 'Select a trigger step',
        subtypes: [
          {
            id: RegistryNodeId.TRIGGER_MANUAL,
            label: 'Manual trigger',
            icon: RhUiPlayIcon,
            description: 'Workflow will start when run is clicked.',
            formTitle: 'Configure Manual Triggers',
            initialData: { triggerType: TriggerTypeEnum.MANUAL_TRIGGER },
          },
          {
            id: RegistryNodeId.TRIGGER_SCHEDULED,
            label: 'Schedule trigger',
            icon: RhUiCalendarIcon,
            description: 'Workflow will start based on a schedule.',
            formTitle: 'Configure Schedule Triggers',
            initialData: { triggerType: TriggerTypeEnum.SCHEDULED },
          },
          {
            id: RegistryNodeId.TRIGGER_WEBHOOK,
            label: 'Webhook trigger',
            icon: RhUiLanguageIcon,
            description: 'Workflow will start when called by an external webhook.',
            formTitle: 'Configure Webhook Trigger',
            initialData: { triggerType: TriggerTypeEnum.WEBHOOK_TRIGGER },
          },
          {
            id: RegistryNodeId.TRIGGER_EDA,
            label: 'Event-Driven Ansible trigger',
            icon: EdaIcon,
            description: 'Workflow will start when an EDA rulebook activation fires.',
            formTitle: 'Configure EDA Trigger',
            initialData: { triggerType: TriggerTypeEnum.EDA_TRIGGER },
          },
        ],
        formComponent: TriggerNodeForm,
      },
      (data, onSuccess, onError) => {
        try {
          const baseName = getDefaultNodeBaseName({ nodeTypeId: RegistryNodeId.TRIGGER, label: 'Trigger' })
          const { trigger } = buildNamedTrigger(baseName, data.name, (triggerId, name) => {
            if (data.triggerType === TriggerTypeEnum.MANUAL_TRIGGER) {
              const inputSchema = parseJsonSchema(data.inputSchema)
              return createManualTrigger(triggerId, undefined, name, inputSchema)
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
            if (WEBHOOK_TRIGGER_TYPES.has(data.triggerType) && data.webhookPath) {
              const inputSchema = parseJsonSchema(data.inputSchema)
              if (data.inputSchema?.trim() && !inputSchema) {
                throw new Error('Invalid JSON schema — check syntax')
              }
              const factory =
                data.triggerType === TriggerTypeEnum.WEBHOOK_TRIGGER ? createWebhookTrigger : createEdaTrigger
              return factory(triggerId, normalizeWebhookPath(data.webhookPath), inputSchema, name)
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
