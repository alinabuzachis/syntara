import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { RoleAssignmentRead } from '../../access/types'

import { UnassignProjectRoleDialog } from './UnassignProjectRoleDialog'

const mockAssignment: RoleAssignmentRead = {
  id: 'a1',
  principal_type: 'user',
  principal_id: 'u1',
  principal_name: 'alice',
  project_id: 'p1',
  role_name: 'project-admin',
  created_at: '2024-01-01T00:00:00Z',
}

describe('UnassignProjectRoleDialog', () => {
  it('has no accessibility violations when open', async () => {
    const { container } = render(
      <UnassignProjectRoleDialog assignment={mockAssignment} isOpen={true} onClose={vi.fn()} onConfirm={vi.fn()} />
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('renders the role name and username in the confirmation message', () => {
    render(
      <UnassignProjectRoleDialog assignment={mockAssignment} isOpen={true} onClose={vi.fn()} onConfirm={vi.fn()} />
    )
    expect(screen.getByText(/project-admin/)).toBeInTheDocument()
    expect(screen.getByText(/alice/)).toBeInTheDocument()
  })

  it('calls onConfirm when the Unassign button is clicked', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()

    render(
      <UnassignProjectRoleDialog assignment={mockAssignment} isOpen={true} onClose={vi.fn()} onConfirm={onConfirm} />
    )

    await user.click(screen.getByRole('button', { name: 'Unassign' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('calls onClose when the Cancel button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <UnassignProjectRoleDialog assignment={mockAssignment} isOpen={true} onClose={onClose} onConfirm={vi.fn()} />
    )

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
