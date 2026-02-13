import { TriggerTypeEnum, type WorkflowAPI } from '@ansible/nexus-contracts'

import { useAlerts } from '../../../components/alerts'
import { createManualTrigger, createScheduledTrigger, useWorkflowStoreActions } from '../../../stores/useWorkflowStore'
import type { TriggerFormData } from '../node-forms/TriggerNodeForm'
import { TriggerNodeForm } from '../node-forms/TriggerNodeForm'
import { getNodeDisplayNameForEdit } from '../utils/nodeNaming'

type ManualTrigger = WorkflowAPI.components['schemas']['manualTrigger'] & { name?: string }

type ScheduledTrigger = {
  type: 'scheduled'
  schedule:
    | {
        scheduleType: 'cron'
        cron: string
        timezone?: string
      }
    | {
        scheduleType: 'interval'
        interval: string
      }
    | {
        scheduleType: 'continuous'
        continuous: true
      }
  name?: string
}

type EventTrigger = {
  type: 'event'
  event: {
    source: string
    eventType: string
    filter?: Record<string, unknown>
  }
  name?: string
}

type Trigger = ManualTrigger | ScheduledTrigger | EventTrigger

interface TriggerNodeDetailsProps {
  trigger: Trigger
  triggerIndex: number
  onClose: () => void
}

export function TriggerNodeDetails({ trigger, triggerIndex, onClose }: TriggerNodeDetailsProps) {
  const { showError } = useAlerts()
  // Use action accessor - component won't re-render when store state changes
  const { updateTrigger } = useWorkflowStoreActions()

  // Extract initial data from trigger
  const getInitialData = (): TriggerFormData => {
    if (trigger.type === 'manual') {
      return {
        name: trigger.name,
        triggerType: TriggerTypeEnum.MANUAL,
      }
    }

    if (trigger.type === 'scheduled') {
      if (trigger.schedule.scheduleType === 'interval') {
        return {
          name: trigger.name,
          triggerType: TriggerTypeEnum.SCHEDULED,
          scheduleType: 'interval',
          interval: trigger.schedule.interval,
        }
      }

      if (trigger.schedule.scheduleType === 'continuous') {
        return {
          name: trigger.name,
          triggerType: TriggerTypeEnum.SCHEDULED,
          scheduleType: 'continuous',
        }
      }
    }

    // Default fallback
    return {
      name: trigger.name,
      triggerType: TriggerTypeEnum.MANUAL,
    }
  }

  const handleSubmit = (data: TriggerFormData) => {
    try {
      let updatedTrigger: Trigger

      const name = getNodeDisplayNameForEdit('Trigger', data.name, trigger.name)

      if (data.triggerType === TriggerTypeEnum.MANUAL) {
        updatedTrigger = createManualTrigger(undefined, name)
      } else if (data.triggerType === TriggerTypeEnum.SCHEDULED) {
        updatedTrigger = createScheduledTrigger(
          data.scheduleType as 'interval' | 'continuous',
          {
            interval: data.interval,
          },
          name
        )
      } else {
        throw new Error('Invalid trigger type')
      }

      updateTrigger(triggerIndex, updatedTrigger)
      onClose()
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to update trigger', 'Update Failed')
    }
  }

  return (
    <TriggerNodeForm
      initialData={getInitialData()}
      submitButtonText="Update trigger"
      onSubmit={handleSubmit}
      onCancel={onClose}
    />
  )
}
