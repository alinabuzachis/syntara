import { describe, expect, it } from 'vitest'

import type { ApprovalWithDetails } from './Approvals'
import { canDecideOnApproval } from './canDecideOnApproval'

describe('canDecideOnApproval', () => {
  const mockApproval = (projectId?: string | null): ApprovalWithDetails =>
    ({
      id: '1',
      status: 'pending',
      project_id: projectId,
    }) as unknown as ApprovalWithDetails

  const projects = [
    { id: 'proj-1', name: 'Project A' },
    { id: 'proj-2', name: 'Project B' },
    { id: 'proj-3', name: 'Project C' },
  ]

  it('returns true when user has system-level approval:decide permission', () => {
    const approval = mockApproval('proj-1')
    expect(
      canDecideOnApproval(
        approval,
        true, // canDecideAllProjects
        new Set(),
        projects
      )
    ).toBe(true)
  })

  it('returns true when user has system-level permission regardless of project', () => {
    const approval = mockApproval(null)
    expect(canDecideOnApproval(approval, true, new Set(), projects)).toBe(true)
  })

  it('returns true when user has project-scoped permission for the approval project', () => {
    const approval = mockApproval('proj-1')
    expect(canDecideOnApproval(approval, false, new Set(['Project A']), projects)).toBe(true)
  })

  it('returns false when user does not have permission for the approval project', () => {
    const approval = mockApproval('proj-1')
    expect(canDecideOnApproval(approval, false, new Set(['Project B', 'Project C']), projects)).toBe(false)
  })

  it('returns false when approval has no project_id', () => {
    const approval = mockApproval(null)
    expect(canDecideOnApproval(approval, false, new Set(['Project A']), projects)).toBe(false)
  })

  it('returns false when approval has undefined project_id', () => {
    const approval = mockApproval(undefined)
    expect(canDecideOnApproval(approval, false, new Set(['Project A']), projects)).toBe(false)
  })

  it('returns false when project is not found in projects list', () => {
    const approval = mockApproval('proj-999')
    expect(canDecideOnApproval(approval, false, new Set(['Project A']), projects)).toBe(false)
  })

  it('returns false when user has no permissions at all', () => {
    const approval = mockApproval('proj-1')
    expect(canDecideOnApproval(approval, false, new Set(), projects)).toBe(false)
  })

  it('handles project with missing id field', () => {
    const approval = mockApproval('proj-1')
    const projectsWithoutId = [{ name: 'Project A' }, { name: 'Project B' }]
    expect(canDecideOnApproval(approval, false, new Set(['Project A']), projectsWithoutId)).toBe(false)
  })
})
