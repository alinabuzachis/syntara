import { EdgeHandleEnum } from '@ansible/nexus-contracts'
import type { CSSProperties } from 'react'

/**
 * PatternFly tokens for approval branch handles (Approved / Rejected).
 * Shared with the canvas legend so swatches match the live handle styling.
 */
export const APPROVAL_BRANCH_TOKENS = {
  approved: {
    backgroundColor: 'var(--pf-t--global--color--status--success--default)',
    color: 'var(--pf-t--global--text--color--status--on-success--default)',
    borderColor: 'var(--pf-t--global--color--status--success--default)',
  },
  rejected: {
    backgroundColor: 'var(--pf-t--global--color--status--danger--default)',
    color: 'var(--pf-t--global--text--color--status--on-danger--default)',
    borderColor: 'var(--pf-t--global--color--status--danger--default)',
  },
} as const

export function getApprovalBranchHandleStyles(id: string): CSSProperties | null {
  if (id === EdgeHandleEnum.APPROVED) {
    return { ...APPROVAL_BRANCH_TOKENS.approved }
  }
  if (id === EdgeHandleEnum.REJECTED) {
    return { ...APPROVAL_BRANCH_TOKENS.rejected }
  }
  return null
}
