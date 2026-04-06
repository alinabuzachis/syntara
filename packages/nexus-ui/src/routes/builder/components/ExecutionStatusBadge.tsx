import { Icon, Spinner } from '@patternfly/react-core'
import {
  RhUiCheckCircleFillIcon,
  RhUiEllipsisHorizontalFillIcon,
  RhUiMinusCircleFillIcon,
  RhUiStopCircleFillIcon,
  RhUiErrorFillIcon,
} from '@patternfly/react-icons'

import type { ActivityStatus } from '../../../routes/automations/execution/types'
import { activityStatusColors } from '../executionStatusConstants'

interface ExecutionStatusBadgeProps {
  status: ActivityStatus
  retryCount?: number
}

type VisualStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped' | 'cancelled'

const visualStatusConfig: Record<
  VisualStatus,
  {
    color: string
    node: React.ReactNode
    borderStyle?: React.CSSProperties['borderStyle']
  }
> = {
  pending: {
    color: activityStatusColors.pending,
    node: <RhUiEllipsisHorizontalFillIcon style={{ color: activityStatusColors.pending }} />,
  },
  running: {
    color: activityStatusColors.running,
    node: (
      <Spinner size="lg" style={{ '--pf-v6-c-spinner--Color': activityStatusColors.running } as React.CSSProperties} />
    ),
  },
  success: {
    color: activityStatusColors.completed,
    node: <RhUiCheckCircleFillIcon style={{ color: activityStatusColors.completed }} />,
  },
  error: {
    color: activityStatusColors.failed,
    node: <RhUiErrorFillIcon style={{ color: activityStatusColors.failed }} />,
  },
  skipped: {
    color: activityStatusColors.skipped,
    node: <RhUiMinusCircleFillIcon style={{ color: activityStatusColors.skipped }} />,
    borderStyle: 'dashed',
  },
  cancelled: {
    color: activityStatusColors.cancelled,
    node: <RhUiStopCircleFillIcon style={{ color: activityStatusColors.cancelled }} />,
  },
}

function normalizeStatus(status: ActivityStatus): { visualStatus: VisualStatus; label: string } {
  switch (status) {
    case 'completed':
      return { visualStatus: 'success', label: 'Success' }
    case 'failed':
      return { visualStatus: 'error', label: 'Error' }
    case 'retrying':
      return { visualStatus: 'running', label: 'Retrying' }
    case 'pending':
      return { visualStatus: 'pending', label: 'Pending' }
    case 'running':
      return { visualStatus: 'running', label: 'Running' }
    case 'skipped':
      return { visualStatus: 'skipped', label: 'Skipped' }
    case 'cancelled':
      return { visualStatus: 'cancelled', label: 'Cancelled' }
    default:
      return { visualStatus: 'pending', label: 'Pending' }
  }
}

/**
 * Visual indicator for activity execution status on workflow steps (canvas).
 * Renders as a circular badge positioned in the bottom-right corner of the step.
 */
export function ExecutionStatusBadge({ status, retryCount }: ExecutionStatusBadgeProps) {
  const normalized = normalizeStatus(status)
  const config = visualStatusConfig[normalized.visualStatus]
  const title = retryCount ? `${normalized.label} (${retryCount} retries)` : normalized.label

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '-20px',
        right: '-20px',
        width: '48px',
        height: '48px',
        borderRadius: '50%',
        backgroundColor: 'var(--pf-t--global--background--color--primary--default)',
        borderColor: config.color,
        borderStyle: config.borderStyle ?? 'solid',
        borderWidth: '2px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
      }}
      title={title}
      aria-label={title}
    >
      {normalized.visualStatus === 'running' ? config.node : <Icon size="xl">{config.node}</Icon>}
    </div>
  )
}
