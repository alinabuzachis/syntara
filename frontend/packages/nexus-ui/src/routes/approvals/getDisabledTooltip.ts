import { permissionTooltip } from '../../hooks/permissionUtils'

const RBAC_DECIDE_TOOLTIP = permissionTooltip('approve or reject this approval', 'approval:decide')
const APPROVER_LIST_TOOLTIP = 'You are not on the approver list for this approval'

const STATUS_TOOLTIPS: Record<string, string> = {
  approved: 'This approval has already been approved',
  rejected: 'This approval has already been rejected',
  expired: 'This approval has expired',
  cancelled: 'This approval has been cancelled',
}

export { APPROVER_LIST_TOOLTIP, RBAC_DECIDE_TOOLTIP }

export function getDisabledTooltip(status: string, canDecideOnThisApproval: boolean): string {
  if (status !== 'pending') return STATUS_TOOLTIPS[status] ?? 'This approval is no longer pending'
  if (!canDecideOnThisApproval) return RBAC_DECIDE_TOOLTIP
  return APPROVER_LIST_TOOLTIP
}
