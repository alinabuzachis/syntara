import type { WorkflowAPI } from '@ansible/nexus-contracts'
import type { ReactNode } from 'react'

import { useAlerts } from '../../../components/alerts'
import { useWorkflowStoreActions } from '../../../stores/useWorkflowStore'
import { LogicNodeForm } from '../node-forms/LogicNodeForm'

type LoopActivity = WorkflowAPI['components']['schemas']['activity'] & { type: 'loop' }

interface LoopNodeDetailsProps {
  loopData: LoopActivity
  nodeId: string
  onClose: () => void
  onHeaderContentChange?: (content: ReactNode | null) => void
}

export function LoopNodeDetails({ loopData, nodeId, onClose, onHeaderContentChange }: LoopNodeDetailsProps) {
  const { showError } = useAlerts()
  // Use action accessor - component won't re-render when store state changes
  const { updateActivity } = useWorkflowStoreActions()

  // Handle potentially malformed loop data
  if (!loopData.loop) {
    showError('Invalid loop node data', 'Error')
    onClose()
    return null
  }

  const initialData = {
    name: loopData.name,
    logicType: 'loop' as const,
    type: loopData.loop.type,
    items: loopData.loop.type === 'forEach' && 'items' in loopData.loop ? loopData.loop.items : undefined,
    condition: loopData.loop.type === 'while' && 'condition' in loopData.loop ? loopData.loop.condition : undefined,
    maxIterations:
      loopData.loop.type === 'while' && 'maxIterations' in loopData.loop ? loopData.loop.maxIterations : undefined,
    indexVariable:
      loopData.loop.type === 'forEach' && 'indexVariable' in loopData.loop ? loopData.loop.indexVariable : undefined,
    itemVariable:
      loopData.loop.type === 'forEach' && 'itemVariable' in loopData.loop ? loopData.loop.itemVariable : undefined,
  }

  const handleSubmit = (data: {
    name: string
    type?: string
    items?: string
    condition?: string
    maxIterations?: number
    indexVariable?: string
    itemVariable?: string
  }) => {
    try {
      const updatedActivity: LoopActivity = {
        ...loopData,
        name: data.name,
        loop: {
          ...loopData.loop,
          type: data.type! as 'forEach' | 'while',
          ...(data.items && { items: data.items }),
          ...(data.condition && { condition: data.condition }),
          ...(data.maxIterations !== undefined &&
            !Number.isNaN(data.maxIterations) && { maxIterations: data.maxIterations }),
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
      onHeaderContentChange={onHeaderContentChange}
    />
  )
}
