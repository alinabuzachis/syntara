import type { WorkflowAPI } from '@ansible/nexus-contracts'

import { useAlerts } from '../../../components/alerts'
import { useWorkflowStore } from '../../../stores/useWorkflowStore'
import type { ApprovalFormSubmitData } from '../node-forms/ApprovalNodeForm'
import { ApprovalNodeForm } from '../node-forms/ApprovalNodeForm'

type TaskActivity = WorkflowAPI.components['schemas']['activity'] & { type: 'task' }

interface ApprovalNodeDetailsProps {
  taskData: TaskActivity
  nodeId: string
  onClose: () => void
}

export function ApprovalNodeDetails({ taskData, nodeId, onClose }: ApprovalNodeDetailsProps) {
  const { showError } = useAlerts()
  const updateActivity = useWorkflowStore((state) => state.updateActivity)

  // Extract approval data for form
  // Cast timeout as number since we're using numeric timeout values
  const initialData: Partial<ApprovalFormSubmitData> | undefined = taskData.approval
    ? {
        name: taskData.name,
        approvers: taskData.approval.approvers,
        prompt: taskData.approval.prompt,
        timeout: taskData.approval.timeout as number | undefined,
        onTimeout: taskData.approval.onTimeout,
      }
    : undefined

  const handleSubmit = (data: ApprovalFormSubmitData) => {
    try {
      // Update the activity with new approval data
      updateActivity(nodeId, {
        name: data.name,
        requiresApproval: true,
        approval: {
          approvers: data.approvers,
          prompt: data.prompt,
          ...(data.timeout && { timeout: data.timeout }),
          ...(data.onTimeout && { onTimeout: data.onTimeout }),
        },
      } as Partial<TaskActivity>)
      onClose()
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to update approval node')
    }
  }

  return (
    <ApprovalNodeForm
      onSubmit={handleSubmit}
      onCancel={onClose}
      submitButtonText="Update node"
      initialData={initialData}
    />
  )
}
