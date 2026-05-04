import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { EnableWorkflowConfirmDialog } from './EnableWorkflowConfirmDialog'

describe('EnableWorkflowConfirmDialog', () => {
  it('renders enable dialog with correct text', () => {
    render(
      <EnableWorkflowConfirmDialog
        isOpen={true}
        pendingEnableState={true}
        isSaving={false}
        workflowName="My Workflow"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText(/Save changes to "My Workflow" before enabling?/i)).toBeInTheDocument()
    expect(screen.getByText(/You have unsaved changes. Do you want to save them before enabling?/i)).toBeInTheDocument()
  })

  it('renders disable dialog with correct text', () => {
    render(
      <EnableWorkflowConfirmDialog
        isOpen={true}
        pendingEnableState={false}
        isSaving={false}
        workflowName="My Workflow"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText(/Save changes to "My Workflow" before disabling?/i)).toBeInTheDocument()
    expect(
      screen.getByText(/You have unsaved changes. Do you want to save them before disabling?/i)
    ).toBeInTheDocument()
  })

  it('calls onConfirm when Save and continue is clicked', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()

    render(
      <EnableWorkflowConfirmDialog
        isOpen={true}
        pendingEnableState={true}
        isSaving={false}
        workflowName="Test Workflow"
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />
    )

    await user.click(screen.getByRole('button', { name: /Save and continue/i }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <EnableWorkflowConfirmDialog
        isOpen={true}
        pendingEnableState={true}
        isSaving={false}
        workflowName="Test Workflow"
        onClose={onClose}
        onConfirm={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: /Cancel/i }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows loading state on confirm button when saving', () => {
    render(
      <EnableWorkflowConfirmDialog
        isOpen={true}
        pendingEnableState={true}
        isSaving={true}
        workflowName="Test Workflow"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    const confirmButton = screen.getByRole('button', { name: /Save and continue/i })
    expect(confirmButton).toBeDisabled()
  })

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <EnableWorkflowConfirmDialog
        isOpen={false}
        pendingEnableState={true}
        isSaving={false}
        workflowName="Test Workflow"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('returns null when pendingEnableState is null', () => {
    const { container } = render(
      <EnableWorkflowConfirmDialog
        isOpen={true}
        pendingEnableState={null}
        isSaving={false}
        workflowName="Test Workflow"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <EnableWorkflowConfirmDialog
        isOpen={true}
        pendingEnableState={true}
        isSaving={false}
        workflowName="Test Workflow"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(await axe(container)).toHaveNoViolations()
  })
})
