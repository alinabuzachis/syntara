import { describe, expect, it } from 'vitest'

import type { ApprovalWithDetails } from './Approvals'
import { computeCanDecideOnApproval } from './computeCanDecideOnApproval'

describe('computeCanDecideOnApproval', () => {
  const mockApproval = (overrides: Partial<ApprovalWithDetails> = {}): ApprovalWithDetails =>
    ({
      id: '1',
      status: 'pending',
      approver_users: [],
      approver_groups: [],
      ...overrides,
    }) as ApprovalWithDetails

  it('returns true when no approvers are configured', () => {
    const approval = mockApproval({
      approver_users: [],
      approver_groups: [],
    })

    expect(computeCanDecideOnApproval(approval, 'alice', [])).toBe(true)
  })

  it('returns true when no approvers are configured (undefined)', () => {
    const approval = mockApproval({
      approver_users: undefined,
      approver_groups: undefined,
    })

    expect(computeCanDecideOnApproval(approval, 'alice', [])).toBe(true)
  })

  it('returns true when current user is in approver_users', () => {
    const approval = mockApproval({
      approver_users: [
        { id: '1', username: 'alice' },
        { id: '2', username: 'bob' },
      ] as never,
    })

    expect(computeCanDecideOnApproval(approval, 'alice', [])).toBe(true)
  })

  it('returns false when current user is not in approver_users', () => {
    const approval = mockApproval({
      approver_users: [{ id: '1', username: 'alice' }] as never,
    })

    expect(computeCanDecideOnApproval(approval, 'charlie', [])).toBe(false)
  })

  it('returns false when currentUsername is null', () => {
    const approval = mockApproval({
      approver_users: [{ id: '1', username: 'alice' }] as never,
    })

    expect(computeCanDecideOnApproval(approval, null, [])).toBe(false)
  })

  it('returns true when current user is in approver_groups', () => {
    const approval = mockApproval({
      approver_groups: [
        { id: 'group-1', name: 'Admins' },
        { id: 'group-2', name: 'Operators' },
      ],
    })

    const userGroups = [
      { id: 'group-1', name: 'Admins' },
      { id: 'group-3', name: 'Other' },
    ]

    expect(computeCanDecideOnApproval(approval, 'alice', userGroups)).toBe(true)
  })

  it('returns false when current user is not in any approver_groups', () => {
    const approval = mockApproval({
      approver_groups: [
        { id: 'group-1', name: 'Admins' },
        { id: 'group-2', name: 'Operators' },
      ],
    })

    const userGroups = [{ id: 'group-3', name: 'Other' }]

    expect(computeCanDecideOnApproval(approval, 'alice', userGroups)).toBe(false)
  })

  it('returns false when user has no groups and approval has approver_groups', () => {
    const approval = mockApproval({
      approver_groups: [{ id: 'group-1', name: 'Admins' }],
    })

    expect(computeCanDecideOnApproval(approval, 'alice', [])).toBe(false)
  })

  it('returns true when user is in approver_users even if not in approver_groups', () => {
    const approval = mockApproval({
      approver_users: [{ id: '1', username: 'alice' }] as never,
      approver_groups: [{ id: 'group-1', name: 'Admins' }],
    })

    const userGroups = [{ id: 'group-2', name: 'Other' }]

    expect(computeCanDecideOnApproval(approval, 'alice', userGroups)).toBe(true)
  })

  it('returns true when user is in approver_groups even if not in approver_users', () => {
    const approval = mockApproval({
      approver_users: [{ id: '1', username: 'bob' }] as never,
      approver_groups: [{ id: 'group-1', name: 'Admins' }],
    })

    const userGroups = [{ id: 'group-1', name: 'Admins' }]

    expect(computeCanDecideOnApproval(approval, 'alice', userGroups)).toBe(true)
  })

  it('returns false when user is neither in approver_users nor approver_groups', () => {
    const approval = mockApproval({
      approver_users: [{ id: '1', username: 'bob' }] as never,
      approver_groups: [{ id: 'group-1', name: 'Admins' }],
    })

    const userGroups = [{ id: 'group-2', name: 'Other' }]

    expect(computeCanDecideOnApproval(approval, 'charlie', userGroups)).toBe(false)
  })

  it('uses group ID for matching, not name (handles renames)', () => {
    const approval = mockApproval({
      approver_groups: [{ id: 'group-1', name: 'Old Name' }],
    })

    const userGroups = [{ id: 'group-1', name: 'New Name (Renamed)' }]

    expect(computeCanDecideOnApproval(approval, 'alice', userGroups)).toBe(true)
  })
})
