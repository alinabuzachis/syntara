import { describe, expect, it } from 'vitest'

import type { ApprovalWithDetails } from './Approvals'
import { isApprovalSelectable } from './isApprovalSelectable'

describe('isApprovalSelectable', () => {
  const mockApproval = (status: string): ApprovalWithDetails =>
    ({
      id: '1',
      status,
    }) as ApprovalWithDetails

  it('returns true when all conditions are met', () => {
    const approval = mockApproval('pending')
    expect(
      isApprovalSelectable(
        approval,
        true, // canDecideOnThisApproval
        true, // canDecideBasedOnApproverList
        false, // isLoadingPermissions
        false // isCheckingApproverList
      )
    ).toBe(true)
  })

  it('returns false when status is not pending', () => {
    const approval = mockApproval('approved')
    expect(isApprovalSelectable(approval, true, true, false, false)).toBe(false)
  })

  it('returns false when isLoadingPermissions is true', () => {
    const approval = mockApproval('pending')
    expect(
      isApprovalSelectable(
        approval,
        true,
        true,
        true, // isLoadingPermissions
        false
      )
    ).toBe(false)
  })

  it('returns false when isCheckingApproverList is true', () => {
    const approval = mockApproval('pending')
    expect(
      isApprovalSelectable(
        approval,
        true,
        true,
        false,
        true // isCheckingApproverList
      )
    ).toBe(false)
  })

  it('returns false when canDecideOnThisApproval is false', () => {
    const approval = mockApproval('pending')
    expect(
      isApprovalSelectable(
        approval,
        false, // canDecideOnThisApproval
        true,
        false,
        false
      )
    ).toBe(false)
  })

  it('returns false when canDecideBasedOnApproverList is false', () => {
    const approval = mockApproval('pending')
    expect(
      isApprovalSelectable(
        approval,
        true,
        false, // canDecideBasedOnApproverList
        false,
        false
      )
    ).toBe(false)
  })

  it('returns false when both permissions are false', () => {
    const approval = mockApproval('pending')
    expect(
      isApprovalSelectable(
        approval,
        false, // canDecideOnThisApproval
        false, // canDecideBasedOnApproverList
        false,
        false
      )
    ).toBe(false)
  })

  it('returns false when both loading states are true', () => {
    const approval = mockApproval('pending')
    expect(
      isApprovalSelectable(
        approval,
        true,
        true,
        true, // isLoadingPermissions
        true // isCheckingApproverList
      )
    ).toBe(false)
  })

  it('returns false for rejected status', () => {
    const approval = mockApproval('rejected')
    expect(isApprovalSelectable(approval, true, true, false, false)).toBe(false)
  })

  it('returns false for timed_out status', () => {
    const approval = mockApproval('timed_out')
    expect(isApprovalSelectable(approval, true, true, false, false)).toBe(false)
  })
})
