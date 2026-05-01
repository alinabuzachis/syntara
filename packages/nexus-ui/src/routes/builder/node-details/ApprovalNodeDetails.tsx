import type { Activity } from '@ansible/nexus-contracts'
import type { ReactNode } from 'react'

import { useAlerts } from '../../../components/alerts'
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

  // In v2, approval config is at activity.config (not activity.approval)
  const approvalConfig = (taskData.config ?? {}) as {
    approver_timeout?: number
    approvers?: string[]
    prompt?: string
    on_timeout?: string
    onTimeout?: string
  }

  const initialData: Partial<ApprovalFormSubmitData> | undefined = {
    name: taskData.name,
    approvers: approvalConfig.approvers,
    prompt: approvalConfig.prompt,
    timeout: approvalConfig.approver_timeout,
    onTimeout: (approvalConfig.on_timeout ?? approvalConfig.onTimeout) as ApprovalFormSubmitData['onTimeout'],
  }

  const handleSubmit = (data: ApprovalFormSubmitData) => {
    try {
      // In v2, update the activity with config at top level
      updateActivity(nodeId, {
        name: data.name,
        config: {
          ...(data.approvers && { approvers: data.approvers }),
          ...(data.prompt && { prompt: data.prompt }),
          ...(data.timeout && { approver_timeout: data.timeout }),
          ...(data.onTimeout && { on_timeout: data.onTimeout }),
        },
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
    <ApprovalNodeForm
      onSubmit={handleSubmit}
      submitButtonText="Update step"
      initialData={initialData}
      onHeaderContentChange={onHeaderContentChange}
    />
  )
}
