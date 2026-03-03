import type { LoopActivity } from '@ansible/nexus-contracts'
import type { ReactNode } from 'react'

import { useAlerts } from '../../../components/alerts'
import { useWorkflowStoreActions } from '../../../stores/useWorkflowStore'
import { LoopNodeForm } from '../node-forms/LoopNodeForm'

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

  // Runtime guard: only allow valid loop types
  const loopType = loopData.loop.type === 'forEach' || loopData.loop.type === 'while' ? loopData.loop.type : 'forEach'

  const initialData = {
    name: loopData.name,
    type: loopType,
    items: loopType === 'forEach' && 'items' in loopData.loop ? loopData.loop.items : undefined,
    condition: loopType === 'while' && 'condition' in loopData.loop ? loopData.loop.condition : undefined,
    maxIterations: loopType === 'while' && 'maxIterations' in loopData.loop ? loopData.loop.maxIterations : undefined,
    indexVariable: loopType === 'forEach' && 'indexVariable' in loopData.loop ? loopData.loop.indexVariable : undefined,
    itemVariable: loopType === 'forEach' && 'itemVariable' in loopData.loop ? loopData.loop.itemVariable : undefined,
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
      // Validate type before casting
      if (!data.type || (data.type !== 'forEach' && data.type !== 'while')) {
        throw new Error('Invalid loop type')
      }

      // Build fresh loop object based on type to avoid stale fields
      const loopType = data.type
      const baseLoop = {
        type: loopType,
        do: loopData.loop.do,
      }

      const loop =
        loopType === 'forEach'
          ? {
              ...baseLoop,
              type: 'forEach' as const,
              items: data.items ?? '',
              indexVariable: data.indexVariable,
              itemVariable: data.itemVariable,
            }
          : {
              ...baseLoop,
              type: 'while' as const,
              condition: data.condition ?? '',
              maxIterations:
                data.maxIterations !== undefined && !Number.isNaN(data.maxIterations) ? data.maxIterations : undefined,
            }

      const updatedActivity: LoopActivity = {
        ...loopData,
        name: data.name,
        loop,
      }

      updateActivity(nodeId, updatedActivity)
      onClose()
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to update node', 'Update Failed')
    }
  }

  return (
    <LoopNodeForm
      initialData={initialData}
      submitButtonText="Update node"
      onSubmit={handleSubmit}
      onHeaderContentChange={onHeaderContentChange}
    />
  )
}
