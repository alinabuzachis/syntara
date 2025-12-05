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
    type: loopData.loop.type,
    items: loopData.loop.type === 'forEach' && 'items' in loopData.loop ? loopData.loop.items : undefined,
    condition: loopData.loop.type === 'while' && 'condition' in loopData.loop ? loopData.loop.condition : undefined,
    count: loopData.loop.type === 'count' && 'count' in loopData.loop ? loopData.loop.count : undefined,
    indexVariable:
      (loopData.loop.type === 'forEach' || loopData.loop.type === 'count') && 'indexVariable' in loopData.loop
        ? loopData.loop.indexVariable
        : undefined,
    itemVariable:
      loopData.loop.type === 'forEach' && 'itemVariable' in loopData.loop ? loopData.loop.itemVariable : undefined,
  }

  const handleSubmit = (data: {
    name: string
    type?: string
    items?: string
    condition?: string
    count?: number
    indexVariable?: string
    itemVariable?: string
  }) => {
    try {
      const updatedActivity: LoopActivity = {
        ...loopData,
        name: data.name,
        loop: {
          ...loopData.loop,
          type: data.type! as 'forEach' | 'while' | 'count',
          ...(data.items && { items: data.items }),
          ...(data.condition && { condition: data.condition }),
          ...(data.count !== undefined && { count: data.count }),
          ...(data.indexVariable && { indexVariable: data.indexVariable }),
          ...(data.itemVariable && { itemVariable: data.itemVariable }),
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
