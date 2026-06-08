import { EdgeHandleEnum } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import { APPROVAL_BRANCH_TOKENS, getApprovalBranchHandleStyles } from './approvalBranchTokens'

describe('approvalBranchTokens', () => {
  it('exposes tokens aligned with approval handle styling', () => {
    expect(APPROVAL_BRANCH_TOKENS.approved.backgroundColor).toBe('var(--pf-t--global--color--status--success--default)')
    expect(APPROVAL_BRANCH_TOKENS.rejected.backgroundColor).toBe('var(--pf-t--global--color--status--danger--default)')
  })

  describe('getApprovalBranchHandleStyles', () => {
    it('returns success styles for approved handle id', () => {
      expect(getApprovalBranchHandleStyles(EdgeHandleEnum.APPROVED)).toEqual({
        ...APPROVAL_BRANCH_TOKENS.approved,
      })
    })

    it('returns danger styles for rejected handle id', () => {
      expect(getApprovalBranchHandleStyles(EdgeHandleEnum.REJECTED)).toEqual({
        ...APPROVAL_BRANCH_TOKENS.rejected,
      })
    })

    it('returns null for non-approval branch ids', () => {
      expect(getApprovalBranchHandleStyles(EdgeHandleEnum.TRUE)).toBeNull()
    })
  })
})
