import type { Activity } from '@ansible/nexus-contracts'
import type { ReactNode } from 'react'

import { useAlerts } from '../../../providers/alerts'
import { useWorkflowStore } from '../../../stores/useWorkflowStore'
import type { ApprovalFormSubmitData } from '../node-forms/ApprovalNodeForm'
import { ApprovalNodeForm } from '../node-forms/ApprovalNodeForm'

type ApprovalNodeDetailsProps = {
  taskData: Activity
  nodeId: string
  onClose: () => void
  onHeaderContentChange?: (content: ReactNode | null) => void
}

export function ApprovalNodeDetails({ taskData, nodeId, onClose, onHeaderContentChange }: ApprovalNodeDetailsProps) {
  const { showError } = useAlerts()
  const updateActivity = useWorkflowStore((state) => state.updateActivity)

  const approvalConfig = (taskData.parameters ?? {}) as {
    approvers?: string[]
    prompt?: string
    fallback_decision?: 'approve' | 'reject'
    decision_window?: number
  }

  const initialData: Partial<ApprovalFormSubmitData> = {
    name: taskData.name,
    approvers: approvalConfig.approvers,
    prompt: approvalConfig.prompt,
    fallback_decision: approvalConfig.fallback_decision,
    decision_window: approvalConfig.decision_window,
    settings: taskData.settings,
  }

  const handleSubmit = (data: ApprovalFormSubmitData) => {
    try {
      updateActivity(nodeId, {
        name: data.name,
        parameters: {
          ...(data.approvers && { approvers: data.approvers }),
          ...(data.prompt && { prompt: data.prompt }),
          ...(data.fallback_decision && { fallback_decision: data.fallback_decision }),
          ...(data.decision_window !== undefined && { decision_window: data.decision_window }),
        },
        settings: data.settings,
      } as Partial<Activity>)
      onClose()
    } catch (error) {
      showError({
        title: 'Update failed',
        description: error instanceof Error ? error.message : 'Failed to update approval step',
      })
    }
  }

  return (
    <ApprovalNodeForm onSubmit={handleSubmit} initialData={initialData} onHeaderContentChange={onHeaderContentChange} />
  )
}
