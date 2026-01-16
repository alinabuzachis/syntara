import type { ApprovalStatus } from '@ansible/nexus-contracts'
import { Label } from '@patternfly/react-core'
import { RhUiDislikeFillIcon, RhUiLikeFillIcon, RhUiWarningFillIcon } from '@patternfly/react-icons'

export type ExtendedApprovalStatus = ApprovalStatus | 'cancelled'

const statusMap: Record<ExtendedApprovalStatus, 'info' | 'success' | 'danger' | 'warning'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  expired: 'warning',
  cancelled: 'info',
}

const statusIcons: Record<ExtendedApprovalStatus, React.ComponentType<{ className?: string }>> = {
  pending: RhUiWarningFillIcon,
  approved: RhUiLikeFillIcon,
  rejected: RhUiDislikeFillIcon,
  expired: RhUiWarningFillIcon,
  cancelled: RhUiWarningFillIcon,
}

export function ApprovalStatusBadges(props: { status?: ExtendedApprovalStatus | null }) {
  if (!props.status) {
    return null
  }

  const IconComponent = statusIcons[props.status]
  const capitalizedStatus = props.status.charAt(0).toUpperCase() + props.status.slice(1)

  return (
    <Label variant="outline" status={statusMap[props.status]} icon={<IconComponent />}>
      {capitalizedStatus}
    </Label>
  )
}
