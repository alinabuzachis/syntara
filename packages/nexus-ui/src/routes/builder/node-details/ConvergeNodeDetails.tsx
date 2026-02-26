import type { ConvergeActivity } from '@ansible/nexus-contracts'
import type { ReactNode } from 'react'

import { useAlerts } from '../../../components/alerts'
import { useWorkflowStoreActions } from '../../../stores/useWorkflowStore'
import { LogicNodeForm } from '../node-forms/LogicNodeForm'
import { secondsToTimeUnits } from '../utils/timeUtils'

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

  const storedTimeout = convergeData.converge?.timeout
  const timeUnits = storedTimeout ? secondsToTimeUnits(storedTimeout) : null

  const initialData = {
    name: convergeData.name,
    logicType: 'converge' as const,
    strategy: (convergeData.converge?.strategy as 'all' | 'any') ?? 'all',
    timeoutEnabled: !!storedTimeout,
    timeoutSeconds: timeUnits?.seconds ?? undefined,
    timeoutMinutes: timeUnits?.minutes ?? undefined,
    timeoutHours: timeUnits?.hours ?? undefined,
    timeoutDays: timeUnits?.days ?? undefined,
    onTimeout: convergeData.converge?.onTimeout ?? 'fail',
    requiredPathCount: (convergeData.converge as { requiredPathCount?: number })?.requiredPathCount ?? 1,
    remainingBehavior: (convergeData.converge as { remainingBehavior?: 'continue' | 'cancel' })?.remainingBehavior,
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
      // Omit fields we manage explicitly so they don't persist from old state when cleared
      // (e.g. timeout toggled off should remove timeout, not keep the previous value)
      type ConvergeWithExtras = ConvergeActivity['converge'] & {
        requiredPathCount?: number
        remainingBehavior?: 'continue' | 'cancel'
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { timeout, onTimeout, requiredPathCount, remainingBehavior, ...restConverge } =
        (convergeData.converge as ConvergeWithExtras) ?? { branches: [], strategy: 'all' as const }

      const updatedActivity: ConvergeActivity = {
        ...convergeData,
        name: data.name,
        converge: {
          ...restConverge,
          // TODO: remove cast when backend schema supports 'any' strategy
          strategy: (data.strategy ?? 'all') as 'all',
          ...(data.timeout !== undefined && { timeout: data.timeout }),
          ...(data.onTimeout !== undefined && { onTimeout: data.onTimeout }),
          ...(data.strategy === 'any' &&
            data.requiredPathCount !== undefined && { requiredPathCount: data.requiredPathCount }),
          ...(data.strategy === 'any' && data.remainingBehavior && { remainingBehavior: data.remainingBehavior }),
        } as ConvergeActivity['converge'],
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
      onHeaderContentChange={onHeaderContentChange}
    />
  )
}
