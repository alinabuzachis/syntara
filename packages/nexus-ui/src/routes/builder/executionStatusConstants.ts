import type { WorkflowAPI } from '@ansible/nexus-contracts'

import type { ActivityStatus } from '../automations/execution/types'

type ExecutionStatus = WorkflowAPI.components['schemas']['ExecutionStatus']

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
