import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { useAlerts } from '@ansible/nexus-ui-framework'

import { createManualTrigger, createScheduledTrigger, useWorkflowStore } from '../../../stores/useWorkflowStore'
import type { TriggerFormData } from '../node-forms/TriggerNodeForm'
import { TriggerNodeForm } from '../node-forms/TriggerNodeForm'

type Trigger =
  | WorkflowAPI['components']['schemas']['manualTrigger']
  | WorkflowAPI['components']['schemas']['scheduledTrigger']
  | WorkflowAPI['components']['schemas']['eventTrigger']

interface TriggerNodeDetailsProps {
  trigger: Trigger
  triggerIndex: number
  onClose: () => void
}

export function TriggerNodeDetails({ trigger, triggerIndex, onClose }: TriggerNodeDetailsProps) {
  const { showError } = useAlerts()
  const updateTrigger = useWorkflowStore((state) => state.updateTrigger)

  // Extract initial data from trigger
  const getInitialData = (): TriggerFormData => {
    if (trigger.type === 'manual') {
      return {
        triggerType: 'manual',
      }
    }

    if (trigger.type === 'scheduled') {
      if (trigger.schedule.scheduleType === 'interval') {
        return {
          triggerType: 'scheduled',
          scheduleType: 'interval',
          interval: trigger.schedule.interval,
        }
      }

      if (trigger.schedule.scheduleType === 'continuous') {
        return {
          triggerType: 'scheduled',
          scheduleType: 'continuous',
        }
      }
    }

    // Default fallback
    return {
      triggerType: 'manual',
    }
  }

  const handleSubmit = (data: TriggerFormData) => {
    try {
      let updatedTrigger: Trigger

      if (data.triggerType === 'manual') {
        updatedTrigger = createManualTrigger()
      } else if (data.triggerType === 'scheduled') {
        updatedTrigger = createScheduledTrigger(data.scheduleType as 'interval' | 'continuous', {
          interval: data.interval,
        })
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
