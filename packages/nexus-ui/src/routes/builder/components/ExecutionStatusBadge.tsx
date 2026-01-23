import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { Icon, Spinner } from '@patternfly/react-core'
import { RhUiCheckIcon, RhUiErrorIcon, RhUiSyncIcon, RhUiEllipsisHorizontalFillIcon } from '@patternfly/react-icons'

type ActivityStatus = WorkflowAPI.components['schemas']['ActivityStatus']

interface ExecutionStatusBadgeProps {
  status: ActivityStatus
  retryCount?: number
}

/**
 * Visual indicator for activity execution status on workflow nodes.
 * Renders as a circular badge positioned in the bottom-right corner of the node.
 */
export function ExecutionStatusBadge({ status, retryCount }: ExecutionStatusBadgeProps) {
  const getStatusConfig = (status: ActivityStatus) => {
    switch (status) {
      case 'pending':
        return {
          icon: <RhUiEllipsisHorizontalFillIcon />,
          backgroundColor: 'var(--pf-t--global--color--nonstatus--gray--default)',
          label: 'Pending',
        }
      case 'running':
        return {
          icon: <Spinner size="sm" />,
          backgroundColor: 'var(--pf-t--global--color--brand--default)',
          label: 'Running',
        }
      case 'completed':
        return {
          icon: <RhUiCheckIcon />,
          backgroundColor: 'var(--pf-t--global--color--status--success--default)',
          label: 'Completed',
        }
      case 'failed':
        return {
          icon: <RhUiErrorIcon />,
          backgroundColor: 'var(--pf-t--global--color--status--danger--default)',
          label: 'Failed',
        }
      case 'retrying':
        return {
          icon: <RhUiSyncIcon />,
          backgroundColor: 'var(--pf-t--global--color--status--warning--default)',
          label: 'Retrying',
        }
      default:
        return {
          icon: <RhUiEllipsisHorizontalFillIcon />,
          backgroundColor: 'var(--pf-t--global--color--nonstatus--gray--default)',
          label: 'Unknown',
        }
    }
  }

  const config = getStatusConfig(status)
  const isRunning = status === 'running'

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '-20px',
        right: '-20px',
        width: '48px',
        height: '48px',
        borderRadius: '50%',
        backgroundColor: config.backgroundColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '2px solid var(--pf-t--global--background--color--primary--default)',
        zIndex: 10,
      }}
      title={`${config.label}${retryCount ? ` (${retryCount} retries)` : ''}`}
    >
      {isRunning ? (
        config.icon
      ) : (
        <Icon size="lg" style={{ color: 'white' }}>
          {config.icon}
        </Icon>
      )}
    </div>
  )
}
