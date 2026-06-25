import type { WaitActivity } from '@ansible/nexus-contracts'
import type { ReactNode } from 'react'

import { useAlerts } from '../../../providers/alerts'
import { useWorkflowStoreActions } from '../../../stores/useWorkflowStore'
import { useMaxWaitDuration } from '../node-forms/useMaxWaitDuration'
import { WaitNodeForm, type WaitFormData } from '../node-forms/WaitNodeForm'

type WaitNodeDetailsProps = {
  waitData: WaitActivity
  nodeId: string
  onClose: () => void
  onHeaderContentChange?: (content: ReactNode | null) => void
}

export function WaitNodeDetails({ waitData, nodeId, onClose, onHeaderContentChange }: Readonly<WaitNodeDetailsProps>) {
  const { showError } = useAlerts()
  const { updateActivity } = useWorkflowStoreActions()
  const { maxSeconds } = useMaxWaitDuration()

  const totalStoredSeconds = (waitData.parameters as { duration?: number } | undefined)?.duration ?? 0

  const initialData: Partial<WaitFormData> = {
    name: waitData.name,
    duration: totalStoredSeconds > 0 ? totalStoredSeconds : undefined,
    settings: waitData.settings,
  }

  const handleSubmit = (data: WaitFormData) => {
    try {
      const totalSeconds = data.duration ?? 0
      if (totalSeconds > maxSeconds) {
        showError({
          title: 'Cannot save wait node',
          description: `Wait duration (${totalSeconds}s) exceeds maximum allowed (${maxSeconds}s)`,
        })
        return
      }

      const updatedActivity: WaitActivity = {
        ...waitData,
        name: data.name,
        parameters: {
          duration: totalSeconds,
        },
        settings: data.settings,
      }

      updateActivity(nodeId, updatedActivity)
      onClose()
    } catch (error) {
      showError({
        title: 'Update failed',
        description: error instanceof Error ? error.message : 'Failed to update step',
      })
    }
  }

  return (
    <WaitNodeForm
      key={maxSeconds}
      initialData={initialData}
      onSubmit={handleSubmit}
      onHeaderContentChange={onHeaderContentChange}
    />
  )
}
