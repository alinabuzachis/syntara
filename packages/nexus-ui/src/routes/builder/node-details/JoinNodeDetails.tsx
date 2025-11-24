import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { useAlerts } from '@ansible/nexus-ui-framework'

import { useWorkflowStore } from '../../../stores/useWorkflowStore'
import { LogicNodeForm } from '../node-forms/LogicNodeForm'

type JoinActivity = WorkflowAPI['components']['schemas']['activity'] & { type: 'join' }

interface JoinNodeDetailsProps {
  joinData: JoinActivity
  nodeId: string
  onClose: () => void
}

export function JoinNodeDetails({ joinData, nodeId, onClose }: JoinNodeDetailsProps) {
  const { showError } = useAlerts()
  const updateActivity = useWorkflowStore((state) => state.updateActivity)

  const initialData = {
    name: joinData.name,
    logicType: 'converge' as const,
    joinStrategy: joinData.join?.strategy ?? 'all',
    joinCount:
      joinData.join?.strategy === 'count' && joinData.join && 'count' in joinData.join
        ? joinData.join.count
        : undefined,
  }

  const handleSubmit = (data: { name: string; joinStrategy?: string; joinCount?: number }) => {
    try {
      const updatedActivity: JoinActivity = {
        ...joinData,
        name: data.name,
        join: {
          ...(joinData.join ?? {}),
          strategy: data.joinStrategy as 'all' | 'any' | 'majority' | 'count',
          ...(data.joinCount !== undefined && { count: data.joinCount }),
        },
      }

      updateActivity(nodeId, updatedActivity)
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
