import type { WorkflowAPI } from '@ansible/nexus-contracts'
import type { ReactNode } from 'react'

import { useAlerts } from '../../../components/alerts'
import { useWorkflowStoreActions } from '../../../stores/useWorkflowStore'
import { LogicNodeForm } from '../node-forms/LogicNodeForm'

type ConvergeActivity = WorkflowAPI['components']['schemas']['activity'] & { type: 'converge' }

interface ConvergeNodeDetailsProps {
  convergeData: ConvergeActivity
  nodeId: string
  onClose: () => void
  onHeaderContentChange?: (content: ReactNode | null) => void
}

export function ConvergeNodeDetails({
  convergeData,
  nodeId,
  onClose,
  onHeaderContentChange,
}: ConvergeNodeDetailsProps) {
  const { showError } = useAlerts()
  // Use action accessor - component won't re-render when store state changes
  const { updateActivity } = useWorkflowStoreActions()

  const initialData = {
    name: convergeData.name,
    logicType: 'converge' as const,
    timeout: convergeData.converge?.timeout,
    onTimeout: convergeData.converge?.onTimeout ?? 'fail',
    aggregateOutputs: convergeData.converge?.aggregateOutputs ?? true,
  }

  const handleSubmit = (data: {
    name: string
    timeout?: number
    onTimeout?: 'continue' | 'fail'
    aggregateOutputs?: boolean
  }) => {
    try {
      const updatedActivity: ConvergeActivity = {
        ...convergeData,
        name: data.name,
        converge: {
          ...(convergeData.converge ?? { branches: [], strategy: 'all' as const }),
          ...(data.timeout !== undefined && { timeout: data.timeout }),
          onTimeout: data.onTimeout ?? 'fail',
          aggregateOutputs: data.aggregateOutputs ?? true,
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
