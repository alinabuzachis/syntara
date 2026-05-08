import type { ConvergeActivity } from '@ansible/nexus-contracts'
import type { ReactNode } from 'react'

import { useAlerts } from '../../../providers/alerts'
import { useWorkflowStoreActions } from '../../../stores/useWorkflowStore'
import { ConvergeNodeForm } from '../node-forms/ConvergeNodeForm'
import { secondsToTimeUnits } from '../utils/timeUtils'

type ConvergeNodeDetailsProps = {
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

  // In v2, converge config is at activity.config (not activity.converge)
  const convergeConfig = (convergeData.config ?? {}) as {
    strategy?: string
    timeout?: number
    on_timeout?: string
    onTimeout?: string
    required_path_count?: number
    requiredPathCount?: number
    remaining_behavior?: 'continue' | 'cancel'
    remainingBehavior?: 'continue' | 'cancel'
  }

  const storedTimeout = convergeConfig.timeout
  const timeUnits = storedTimeout ? secondsToTimeUnits(storedTimeout) : null

  const initialData = {
    name: convergeData.name,
    strategy: (convergeConfig.strategy as 'all' | 'any') ?? 'all',
    timeoutEnabled: !!storedTimeout,
    timeoutSeconds: timeUnits?.seconds ?? undefined,
    timeoutMinutes: timeUnits?.minutes ?? undefined,
    timeoutHours: timeUnits?.hours ?? undefined,
    timeoutDays: timeUnits?.days ?? undefined,
    onTimeout: (convergeConfig.on_timeout ?? convergeConfig.onTimeout ?? 'fail') as 'continue' | 'fail',
    requiredPathCount: convergeConfig.required_path_count ?? convergeConfig.requiredPathCount ?? 1,
    remainingBehavior: convergeConfig.remaining_behavior ?? convergeConfig.remainingBehavior,
  }

  const handleSubmit = (data: {
    name: string
    strategy?: 'all' | 'any'
    timeout?: number
    onTimeout?: 'continue' | 'fail'
    requiredPathCount?: number
    remainingBehavior?: 'continue' | 'cancel'
  }) => {
    try {
      const updatedActivity: ConvergeActivity = {
        ...convergeData,
        name: data.name,
        config: {
          // TODO: remove cast when backend schema supports 'any' strategy
          strategy: (data.strategy ?? 'all') as 'all',
          ...(data.timeout !== undefined && { timeout: data.timeout }),
          ...(data.onTimeout !== undefined && { on_timeout: data.onTimeout }),
          ...(data.strategy === 'any' &&
            data.requiredPathCount !== undefined && { required_path_count: data.requiredPathCount }),
          ...(data.strategy === 'any' && data.remainingBehavior && { remaining_behavior: data.remainingBehavior }),
        },
      } as ConvergeActivity

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
    <ConvergeNodeForm initialData={initialData} onSubmit={handleSubmit} onHeaderContentChange={onHeaderContentChange} />
  )
}
