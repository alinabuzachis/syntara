import type { ExecutionsAPI } from '@ansible/nexus-contracts'
import { Label } from '@patternfly/react-core'
import {
  RhUiCheckCircleIcon,
  RhUiCloseCircleIcon,
  RhUiHourglassIcon,
  RhUiPauseCircleFillIcon,
  RhUiStopCircleFillIcon,
  RhUiSyncIcon,
} from '@patternfly/react-icons'
import type React from 'react'

type ExecutionStatus = ExecutionsAPI.components['schemas']['ExecutionStatus']

const statusMap: Record<ExecutionStatus, 'success' | 'danger' | 'warning' | 'info' | 'custom'> = {
  pending: 'custom',
  running: 'custom',
  paused: 'warning',
  completed: 'success',
  failed: 'danger',
  cancelled: 'custom',
}

const statusIcons: Record<ExecutionStatus, React.ComponentType<{ className?: string }>> = {
  pending: RhUiHourglassIcon,
  running: RhUiSyncIcon,
  paused: RhUiPauseCircleFillIcon,
  completed: RhUiCheckCircleIcon,
  failed: RhUiCloseCircleIcon,
  cancelled: RhUiStopCircleFillIcon,
}

export function StatusLabel({ status }: { status: ExecutionStatus }) {
  const IconComponent = statusIcons[status]
  const capitalizedStatus = status.charAt(0).toUpperCase() + status.slice(1)

  return (
    <Label variant="outline" status={statusMap[status]} icon={<IconComponent />}>
      {capitalizedStatus}
    </Label>
  )
}
