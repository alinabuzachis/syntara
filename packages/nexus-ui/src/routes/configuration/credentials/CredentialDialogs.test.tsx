import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { Credential } from './credentialConstants'
import { DeleteCredentialDialog } from './DeleteCredentialDialog'
import { DisableCredentialDialog } from './DisableCredentialDialog'

const mockCredential: Credential = {
  id: '1',
  name: 'Test Credential',
  description: 'Test description',
  credential_type_id: 'type-1',
  inputs: {},
  enabled: true,
  labels: {},
  created_by: 'user-1',
  project_id: 'proj-1',
  created_at: '2026-03-01T00:00:00Z',
  updated_at: '2026-03-01T00:00:00Z',
}

const mockAffectedWorkflows = [
  { id: 'wf-1', name: 'Workflow One' },
  { id: 'wf-2', name: 'Workflow Two' },
]

describe('DisableCredentialDialog', () => {
  it('returns null when credential is null', () => {
    const { container } = render(
      <DisableCredentialDialog
        credential={null}
        affectedWorkflows={[]}
        workflowsFetchError={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders dialog with credential name', () => {
    render(
      <DisableCredentialDialog
        credential={mockCredential}
        affectedWorkflows={[]}
        workflowsFetchError={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('Disable credential?')).toBeInTheDocument()
    expect(screen.getByText('Test Credential')).toBeInTheDocument()
  })

  it('shows affected workflows list', () => {
    render(
      <DisableCredentialDialog
        credential={mockCredential}
        affectedWorkflows={mockAffectedWorkflows}
        workflowsFetchError={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText(/2 workflows/)).toBeInTheDocument()
    expect(screen.getByText('Workflow One')).toBeInTheDocument()
    expect(screen.getByText('Workflow Two')).toBeInTheDocument()
  })

  it('shows singular workflow text when only one workflow affected', () => {
    render(
      <DisableCredentialDialog
        credential={mockCredential}
        affectedWorkflows={[mockAffectedWorkflows[0]]}
        workflowsFetchError={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText(/1 workflow/)).toBeInTheDocument()
    expect(screen.queryByText(/1 workflows/)).not.toBeInTheDocument()
  })

  it('shows warning when workflowsFetchError is true', () => {
    render(
      <DisableCredentialDialog
        credential={mockCredential}
        affectedWorkflows={[]}
        workflowsFetchError={true}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText(/Unable to check/)).toBeInTheDocument()
  })

  it('does not show affected workflows list when no workflows affected', () => {
    render(
      <DisableCredentialDialog
        credential={mockCredential}
        affectedWorkflows={[]}
        workflowsFetchError={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.queryByText(/currently used by/)).not.toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('shows re-enable message', () => {
    render(
      <DisableCredentialDialog
        credential={mockCredential}
        affectedWorkflows={[]}
        workflowsFetchError={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText(/You can re-enable the credential at any time/)).toBeInTheDocument()
  })

  it('calls onConfirm when Disable button clicked', async () => {
    const user = userEvent.setup()
    const mockOnConfirm = vi.fn()

    render(
      <DisableCredentialDialog
        credential={mockCredential}
        affectedWorkflows={[]}
        workflowsFetchError={false}
        onConfirm={mockOnConfirm}
        onClose={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Disable' }))
    expect(mockOnConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Cancel button clicked', async () => {
    const user = userEvent.setup()
    const mockOnClose = vi.fn()

    render(
      <DisableCredentialDialog
        credential={mockCredential}
        affectedWorkflows={[]}
        workflowsFetchError={false}
        onConfirm={vi.fn()}
        onClose={mockOnClose}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <DisableCredentialDialog
        credential={mockCredential}
        affectedWorkflows={mockAffectedWorkflows}
        workflowsFetchError={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    )

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations with workflow fetch error', async () => {
    const { container } = render(
      <DisableCredentialDialog
        credential={mockCredential}
        affectedWorkflows={[]}
        workflowsFetchError={true}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    )

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

describe('DeleteCredentialDialog', () => {
  it('returns null when credential is null', () => {
    const { container } = render(<DeleteCredentialDialog credential={null} onConfirm={vi.fn()} onClose={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders dialog with credential name', () => {
    render(<DeleteCredentialDialog credential={mockCredential} onConfirm={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByText('Delete credential')).toBeInTheDocument()
    expect(screen.getByText(/Test Credential/)).toBeInTheDocument()
  })

  it('shows warning about action being irreversible', () => {
    render(<DeleteCredentialDialog credential={mockCredential} onConfirm={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByText(/This action cannot be undone/)).toBeInTheDocument()
  })

  it('calls onConfirm when Delete button clicked', async () => {
    const user = userEvent.setup()
    const mockOnConfirm = vi.fn()

    render(<DeleteCredentialDialog credential={mockCredential} onConfirm={mockOnConfirm} onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(mockOnConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Cancel button clicked', async () => {
    const user = userEvent.setup()
    const mockOnClose = vi.fn()

    render(<DeleteCredentialDialog credential={mockCredential} onConfirm={vi.fn()} onClose={mockOnClose} />)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <DeleteCredentialDialog credential={mockCredential} onConfirm={vi.fn()} onClose={vi.fn()} />
    )

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
