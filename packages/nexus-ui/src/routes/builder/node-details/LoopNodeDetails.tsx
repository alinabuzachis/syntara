import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { useAlerts } from '@ansible/nexus-ui-framework'

import { useWorkflowStore } from '../../../stores/useWorkflowStore'
import { LogicNodeForm } from '../node-forms/LogicNodeForm'

type LoopActivity = WorkflowAPI['components']['schemas']['activity'] & { type: 'loop' }

interface LoopNodeDetailsProps {
  loopData: LoopActivity
  nodeId: string
  onClose: () => void
}

export function LoopNodeDetails({ loopData, nodeId, onClose }: LoopNodeDetailsProps) {
  const { showError } = useAlerts()
  const updateActivity = useWorkflowStore((state) => state.updateActivity)

  const initialData = {
    name: loopData.name,
    logicType: 'loop' as const,
    loopType: loopData.loop.loopType,
    items: loopData.loop.loopType === 'forEach' && 'items' in loopData.loop ? loopData.loop.items : undefined,
    condition: loopData.loop.loopType === 'while' && 'condition' in loopData.loop ? loopData.loop.condition : undefined,
    count: loopData.loop.loopType === 'count' && 'count' in loopData.loop ? loopData.loop.count : undefined,
    maxIterations:
      loopData.loop.loopType === 'while' && 'maxIterations' in loopData.loop ? loopData.loop.maxIterations : undefined,
  }

  const handleSubmit = (data: {
    name: string
    loopType?: string
    items?: string
    condition?: string
    count?: number
    maxIterations?: number
  }) => {
    try {
      const updatedActivity: LoopActivity = {
        ...loopData,
        name: data.name,
        loop: {
          ...loopData.loop,
          loopType: data.loopType!,
          ...(data.items && { items: data.items }),
          ...(data.condition && { condition: data.condition }),
          ...(data.count !== undefined && { count: data.count }),
          ...(data.maxIterations !== undefined && { maxIterations: data.maxIterations }),
        },
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
