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
        isLoadingWorkflows={false}
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
        isLoadingWorkflows={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('Disable credential?')).toBeInTheDocument()
    expect(screen.getByText('Test Credential')).toBeInTheDocument()
  })

  it('shows affected workflows list and re-enable message together', () => {
    render(
      <DisableCredentialDialog
        credential={mockCredential}
        affectedWorkflows={mockAffectedWorkflows}
        workflowsFetchError={false}
        isLoadingWorkflows={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText(/2 workflows/)).toBeInTheDocument()
    expect(screen.getByText('Workflow One')).toBeInTheDocument()
    expect(screen.getByText('Workflow Two')).toBeInTheDocument()
    expect(screen.getByText(/You can re-enable/)).toBeInTheDocument()
  })

  it('shows singular workflow text when only one workflow affected', () => {
    render(
      <DisableCredentialDialog
        credential={mockCredential}
        affectedWorkflows={[mockAffectedWorkflows[0]]}
        workflowsFetchError={false}
        isLoadingWorkflows={false}
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
        isLoadingWorkflows={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText(/Unable to check/)).toBeInTheDocument()
  })

  it('hides re-enable message when workflowsFetchError is true', () => {
    render(
      <DisableCredentialDialog
        credential={mockCredential}
        affectedWorkflows={[]}
        workflowsFetchError={true}
        isLoadingWorkflows={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.queryByText(/You can re-enable/)).not.toBeInTheDocument()
  })

  it('shows both error and workflows when workflowsFetchError and workflows are present', () => {
    render(
      <DisableCredentialDialog
        credential={mockCredential}
        affectedWorkflows={mockAffectedWorkflows}
        workflowsFetchError={true}
        isLoadingWorkflows={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText(/Unable to check/)).toBeInTheDocument()
    expect(screen.getByText('Workflow One')).toBeInTheDocument()
    expect(screen.queryByText(/You can re-enable/)).not.toBeInTheDocument()
  })

  it('disables buttons while isLoading is true', () => {
    render(
      <DisableCredentialDialog
        credential={mockCredential}
        affectedWorkflows={[]}
        workflowsFetchError={false}
        isLoadingWorkflows={false}
        isLoading={true}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /Disable/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('enables buttons when isLoading is false', () => {
    render(
      <DisableCredentialDialog
        credential={mockCredential}
        affectedWorkflows={[]}
        workflowsFetchError={false}
        isLoadingWorkflows={false}
        isLoading={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: 'Disable' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
  })

  it('does not show affected workflows list when no workflows affected', () => {
    render(
      <DisableCredentialDialog
        credential={mockCredential}
        affectedWorkflows={[]}
        workflowsFetchError={false}
        isLoadingWorkflows={false}
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
        isLoadingWorkflows={false}
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
        isLoadingWorkflows={false}
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
        isLoadingWorkflows={false}
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
        isLoadingWorkflows={false}
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
        isLoadingWorkflows={false}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    )

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('shows loading spinner when checking workflows', () => {
    render(
      <DisableCredentialDialog
        credential={mockCredential}
        affectedWorkflows={[]}
        workflowsFetchError={false}
        isLoadingWorkflows={true}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText(/Checking for workflows/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Disable' })).toBeDisabled()
  })
})

describe('DeleteCredentialDialog', () => {
  const defaultDeleteProps = {
    affectedWorkflows: [] as { id: string; name: string }[],
    workflowsFetchError: false,
    isLoadingWorkflows: false,
    onConfirm: vi.fn(),
    onClose: vi.fn(),
  }

  it('returns null when credential is null', () => {
    const { container } = render(<DeleteCredentialDialog credential={null} {...defaultDeleteProps} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders dialog with credential name when no workflows reference it', () => {
    render(<DeleteCredentialDialog credential={mockCredential} {...defaultDeleteProps} />)

    expect(screen.getByText('Delete credential?')).toBeInTheDocument()
    expect(screen.getByText(/Test Credential/)).toBeInTheDocument()
    expect(screen.getByText(/This action cannot be undone/)).toBeInTheDocument()
  })

  it('warns but allows deletion when workflows reference the credential', () => {
    const workflows = [
      { id: 'wf-1', name: 'Deploy Pipeline' },
      { id: 'wf-2', name: 'Health Check' },
    ]
    render(<DeleteCredentialDialog credential={mockCredential} {...defaultDeleteProps} affectedWorkflows={workflows} />)

    expect(screen.getByText(/will cause these workflows to fail/)).toBeInTheDocument()
    expect(screen.getByText('Deploy Pipeline')).toBeInTheDocument()
    expect(screen.getByText('Health Check')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()
  })

  it('calls onConfirm when Delete button clicked', async () => {
    const user = userEvent.setup()
    const mockOnConfirm = vi.fn()

    render(<DeleteCredentialDialog credential={mockCredential} {...defaultDeleteProps} onConfirm={mockOnConfirm} />)

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(mockOnConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Cancel button clicked', async () => {
    const user = userEvent.setup()
    const mockOnClose = vi.fn()

    render(<DeleteCredentialDialog credential={mockCredential} {...defaultDeleteProps} onClose={mockOnClose} />)

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('shows loading spinner when checking workflows', () => {
    render(<DeleteCredentialDialog credential={mockCredential} {...defaultDeleteProps} isLoadingWorkflows={true} />)

    expect(screen.getByText(/Checking for workflows/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
  })

  it('shows warning when workflowsFetchError is true', () => {
    render(<DeleteCredentialDialog credential={mockCredential} {...defaultDeleteProps} workflowsFetchError={true} />)

    expect(screen.getByText(/Unable to check which workflows/)).toBeInTheDocument()
  })

  it('shows singular workflow text when only one workflow affected', () => {
    render(
      <DeleteCredentialDialog
        credential={mockCredential}
        {...defaultDeleteProps}
        affectedWorkflows={[{ id: 'wf-1', name: 'Solo Workflow' }]}
      />
    )

    expect(screen.getByText(/1 workflow/)).toBeInTheDocument()
    expect(screen.queryByText(/1 workflows/)).not.toBeInTheDocument()
  })

  it('enables buttons when neither loading workflows nor deleting', () => {
    render(<DeleteCredentialDialog credential={mockCredential} {...defaultDeleteProps} />)

    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
  })

  it('shows both error and workflow list when workflowsFetchError and workflows are present', () => {
    render(
      <DeleteCredentialDialog
        credential={mockCredential}
        {...defaultDeleteProps}
        workflowsFetchError={true}
        affectedWorkflows={[{ id: 'wf-1', name: 'Stale Workflow' }]}
      />
    )

    expect(screen.getByText(/Unable to check/)).toBeInTheDocument()
    expect(screen.getByText('Stale Workflow')).toBeInTheDocument()
  })

  it('disables buttons while isLoading is true', () => {
    render(<DeleteCredentialDialog credential={mockCredential} {...defaultDeleteProps} isLoading={true} />)

    // PF6 loading button prepends spinner to accessible name
    expect(screen.getByRole('button', { name: /Delete/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<DeleteCredentialDialog credential={mockCredential} {...defaultDeleteProps} />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations with affected workflows', async () => {
    const workflows = [
      { id: 'wf-1', name: 'Deploy Pipeline' },
      { id: 'wf-2', name: 'Health Check' },
    ]
    const { container } = render(
      <DeleteCredentialDialog credential={mockCredential} {...defaultDeleteProps} affectedWorkflows={workflows} />
    )

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations with workflow fetch error', async () => {
    const { container } = render(
      <DeleteCredentialDialog credential={mockCredential} {...defaultDeleteProps} workflowsFetchError={true} />
    )

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
