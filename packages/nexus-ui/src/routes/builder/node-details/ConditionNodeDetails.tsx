import type { WorkflowAPI } from '@ansible/nexus-contracts'

import { useAlerts } from '../../../components/alerts'
import { useWorkflowStoreActions } from '../../../stores/useWorkflowStore'
import { LogicNodeForm } from '../node-forms/LogicNodeForm'

type ConditionActivity = WorkflowAPI['components']['schemas']['activity'] & { type: 'condition' }

interface ConditionNodeDetailsProps {
  conditionData: ConditionActivity
  nodeId: string
  onClose: () => void
}

export function ConditionNodeDetails({ conditionData, nodeId, onClose }: ConditionNodeDetailsProps) {
  const { showError } = useAlerts()
  // Use action accessor - component won't re-render when store state changes
  const { updateActivity } = useWorkflowStoreActions()

  const initialData = {
    name: conditionData.name,
    logicType: 'condition' as const,
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
      showError(error instanceof Error ? error.message : 'Failed to update node', 'Update Failed')
    }
  }

  return (
    <LogicNodeForm
      initialData={initialData}
      submitButtonText="Update node"
      onSubmit={handleSubmit}
      onCancel={onClose}
    />
  )
}
