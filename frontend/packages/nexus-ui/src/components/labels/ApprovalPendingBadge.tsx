import { RhUiWarningFillIcon } from '@patternfly/react-icons'

import { NxLabel } from '../../components/labels/NxLabel'

type ApprovalPendingBadgeProps = {
  approvalPending?: boolean
}

/**
 * Badge component that displays "Pending approval" when approvalPending is true.
 * Used to indicate that an execution has one or more approval activities in WAITING status.
 */
export function ApprovalPendingBadge({ approvalPending }: Readonly<ApprovalPendingBadgeProps>) {
  if (!approvalPending) return null

  return (
    <NxLabel variant="outline" status="warning" icon={<RhUiWarningFillIcon />}>
      Pending approval
    </NxLabel>
  )
}
