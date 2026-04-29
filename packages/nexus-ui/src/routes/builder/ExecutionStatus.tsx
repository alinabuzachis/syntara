import type { ExecutionsAPI } from '@ansible/nexus-contracts'
import { Label } from '@patternfly/react-core'
import {
  RhUiCheckCircleIcon,
  RhUiCloseCircleIcon,
  RhUiEllipsisHorizontalFillIcon,
  RhUiHourglassIcon,
  RhUiMinusCircleFillIcon,
  RhUiPauseCircleFillIcon,
  RhUiStopCircleFillIcon,
  RhUiSyncIcon,
} from '@patternfly/react-icons'
import type React from 'react'

type ExecutionStatus = ExecutionsAPI.components['schemas']['ExecutionStatus']
type ActivityStatus = ExecutionsAPI.components['schemas']['ActivityStatus']

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

export function StatusLabel({ status }: Readonly<{ status: ExecutionStatus }>) {
  const IconComponent = statusIcons[status]
  const capitalizedStatus = status.charAt(0).toUpperCase() + status.slice(1)

  return (
    <Label variant="outline" status={statusMap[status]} icon={<IconComponent />}>
      {capitalizedStatus}
    </Label>
  )
}

const activityStatusVariant: Record<ActivityStatus, 'success' | 'danger' | 'warning' | 'info' | 'custom'> = {
  pending: 'custom',
  running: 'custom',
  completed: 'success',
  failed: 'danger',
  retrying: 'warning',
  skipped: 'custom',
  cancelled: 'custom',
}

const activityStatusIcons: Record<ActivityStatus, React.ComponentType<{ className?: string }>> = {
  pending: RhUiEllipsisHorizontalFillIcon,
  running: RhUiSyncIcon,
  completed: RhUiCheckCircleIcon,
  failed: RhUiCloseCircleIcon,
  retrying: RhUiSyncIcon,
  skipped: RhUiMinusCircleFillIcon,
  cancelled: RhUiStopCircleFillIcon,
}

const activityStatusDisplayLabels: Record<ActivityStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  completed: 'Successful',
  failed: 'Failed',
  retrying: 'Retrying',
  skipped: 'Skipped',
  cancelled: 'Cancelled',
}

export function ActivityStatusLabel({ status }: Readonly<{ status: ActivityStatus }>) {
  const IconComponent = activityStatusIcons[status] ?? RhUiEllipsisHorizontalFillIcon
  const variant = activityStatusVariant[status] ?? 'custom'
  const displayLabel = activityStatusDisplayLabels[status] ?? status.charAt(0).toUpperCase() + status.slice(1)

  return (
    <Label variant="outline" status={variant} icon={<IconComponent />}>
      {displayLabel}
    </Label>
  )
}
