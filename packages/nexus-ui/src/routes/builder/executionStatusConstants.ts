import type { WorkflowAPI } from '@ansible/nexus-contracts'
import {
  RhUiCheckIcon,
  RhUiErrorIcon,
  RhUiHourglassIcon,
  RhUiPauseIcon,
  RhUiWarningIcon,
  RhUiSyncIcon,
} from '@patternfly/react-icons'

import type { ActivityStatus } from '../automations/execution/types'

type ExecutionStatus = WorkflowAPI.components['schemas']['ExecutionStatus']

const statusIcons: Record<ExecutionStatus, React.ComponentType<{ className?: string }>> = {
  pending: RhUiHourglassIcon,
  running: RhUiSyncIcon,
  paused: RhUiPauseIcon,
  completed: RhUiCheckIcon,
  failed: RhUiErrorIcon,
  cancelled: RhUiWarningIcon,
}

const statusColors: Record<ExecutionStatus, string> = {
  pending: 'var(--pf-t--global--color--nonstatus--gray--300)',
  running: 'var(--pf-t--global--color--brand--default)',
  paused: 'var(--pf-t--global--color--status--warning--default)',
  completed: 'var(--pf-t--global--color--status--success--default)',
  failed: 'var(--pf-t--global--color--status--danger--default)',
  cancelled: 'var(--pf-t--global--color--nonstatus--gray--300)',
}

export const activityStatusColors: Record<ActivityStatus, string> = {
  pending: statusColors.pending,
  running: statusColors.running,
  completed: statusColors.completed,
  failed: statusColors.failed,
  retrying: statusColors.running,
  skipped: 'var(--pf-t--global--color--nonstatus--gray--default)',
  cancelled: statusColors.cancelled,
}
