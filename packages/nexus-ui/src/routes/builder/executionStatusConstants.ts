import type { WorkflowAPI } from '@ansible/nexus-contracts'
import {
  RhUiCheckIcon,
  RhUiErrorIcon,
  RhUiHourglassIcon,
  RhUiPauseIcon,
  RhUiWarningIcon,
  RhUiSyncIcon,
} from '@patternfly/react-icons'

type ExecutionStatus = WorkflowAPI.components['schemas']['ExecutionStatus']

export const statusIcons: Record<ExecutionStatus, React.ComponentType<{ className?: string }>> = {
  pending: RhUiHourglassIcon,
  running: RhUiSyncIcon,
  paused: RhUiPauseIcon,
  completed: RhUiCheckIcon,
  failed: RhUiErrorIcon,
  cancelled: RhUiWarningIcon,
}

export const statusColors: Record<ExecutionStatus, string> = {
  pending: 'var(--pf-t--global--color--nonstatus--gray--300)',
  running: 'var(--pf-t--global--color--brand--default)',
  paused: 'var(--pf-t--global--color--status--warning--default)',
  completed: 'var(--pf-t--global--color--status--success--default)',
  failed: 'var(--pf-t--global--color--status--danger--default)',
  cancelled: 'var(--pf-t--global--color--status--warning--default)',
}
