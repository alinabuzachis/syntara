import type { ConditionActivity } from '@ansible/nexus-contracts'
import type { ReactNode } from 'react'

import { useAlerts } from '../../../components/alerts'
import { useWorkflowStoreActions } from '../../../stores/useWorkflowStore'
import { ConditionNodeForm } from '../node-forms/ConditionNodeForm'

interface ConditionNodeDetailsProps {
  conditionData: ConditionActivity
  nodeId: string
  onClose: () => void
  onHeaderContentChange?: (content: ReactNode | null) => void
}

export function ConditionNodeDetails({
  conditionData,
  nodeId,
  onClose,
  onHeaderContentChange,
}: ConditionNodeDetailsProps) {
  const { showError } = useAlerts()
  // Use action accessor - component won't re-render when store state changes
  const { updateActivity } = useWorkflowStoreActions()

  const initialData = {
    name: conditionData.name,
    condition: conditionData.condition,
  }

  const handleSubmit = (data: { name: string; condition?: string }) => {
    try {
      const updatedActivity: ConditionActivity = {
        ...conditionData,
        name: data.name,
        condition: data.condition!,
      }

      updateActivity(nodeId, updatedActivity)
      onClose()
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to update step', 'Update Failed')
    }
  }

  return (
    <ConditionNodeForm
      initialData={initialData}
      submitButtonText="Update step"
      onSubmit={handleSubmit}
      onHeaderContentChange={onHeaderContentChange}
    />
  )
}
