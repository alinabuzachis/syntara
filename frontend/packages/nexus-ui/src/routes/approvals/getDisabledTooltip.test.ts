import { describe, expect, it } from 'vitest'

import { APPROVER_LIST_TOOLTIP, RBAC_DECIDE_TOOLTIP, getDisabledTooltip } from './getDisabledTooltip'

describe('getDisabledTooltip', () => {
  it('returns status-specific tooltip for approved approvals', () => {
    expect(getDisabledTooltip('approved', true)).toBe('This approval has already been approved')
  })

  it('returns status-specific tooltip for rejected approvals', () => {
    expect(getDisabledTooltip('rejected', true)).toBe('This approval has already been rejected')
  })

  it('returns status-specific tooltip for expired approvals', () => {
    expect(getDisabledTooltip('expired', true)).toBe('This approval has expired')
  })

  it('returns status-specific tooltip for cancelled approvals', () => {
    expect(getDisabledTooltip('cancelled', true)).toBe('This approval has been cancelled')
  })

  it('returns generic tooltip for unknown non-pending status', () => {
    expect(getDisabledTooltip('unknown_status', true)).toBe('This approval is no longer pending')
  })

  it('returns RBAC tooltip when pending but user lacks decide permission', () => {
    expect(getDisabledTooltip('pending', false)).toBe(RBAC_DECIDE_TOOLTIP)
  })

  it('returns approver list tooltip when pending and user has decide permission', () => {
    expect(getDisabledTooltip('pending', true)).toBe(APPROVER_LIST_TOOLTIP)
  })

  it('ignores canDecideOnThisApproval for non-pending statuses', () => {
    expect(getDisabledTooltip('approved', false)).toBe('This approval has already been approved')
  })
})
