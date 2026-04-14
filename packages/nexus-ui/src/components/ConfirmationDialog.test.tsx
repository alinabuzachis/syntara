import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { ConfirmationDialog } from './ConfirmationDialog'

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  title: 'Confirm action',
  children: 'Are you sure you want to proceed?',
} as const

function renderDialog(overrides: Partial<Parameters<typeof ConfirmationDialog>[0]> = {}) {
  const props = { ...defaultProps, onClose: vi.fn(), onConfirm: vi.fn(), ...overrides }
  return { ...render(<ConfirmationDialog {...props} />), props }
}

describe('ConfirmationDialog', () => {
  it('has no accessibility violations', async () => {
    const { baseElement } = renderDialog({
      'aria-labelledby': 'dialog-title',
      'aria-describedby': 'dialog-body',
    })

    const results = await axe(baseElement)
    expect(results).toHaveNoViolations()
  })

  it('does not render modal content when isOpen is false', () => {
    renderDialog({ isOpen: false })

    expect(screen.queryByText('Confirm action')).not.toBeInTheDocument()
    expect(screen.queryByText('Are you sure you want to proceed?')).not.toBeInTheDocument()
  })

  it('renders title, body, and buttons when isOpen is true', () => {
    renderDialog()

    expect(screen.getByText('Confirm action')).toBeInTheDocument()
    expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('calls onConfirm when confirm button is clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(props.onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when cancel button is clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('renders custom confirmLabel and cancelLabel', () => {
    renderDialog({ confirmLabel: 'Delete', cancelLabel: 'Keep' })

    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('applies danger variant to the confirm button', () => {
    renderDialog({ confirmVariant: 'danger', confirmLabel: 'Delete' })

    const deleteButton = screen.getByRole('button', { name: 'Delete' })
    expect(deleteButton).toHaveClass('pf-m-danger')
  })

  it('applies primary variant to the confirm button by default', () => {
    renderDialog()

    const confirmButton = screen.getByRole('button', { name: 'Confirm' })
    expect(confirmButton).toHaveClass('pf-m-primary')
  })

  it('renders children as body content', () => {
    renderDialog({
      children: (
        <p>
          This will permanently delete <strong>my-workflow</strong>.
        </p>
      ),
    })

    expect(screen.getByText(/this will permanently delete/i)).toBeInTheDocument()
    expect(screen.getByText('my-workflow')).toBeInTheDocument()
  })

  it('renders with a custom title', () => {
    renderDialog({ title: 'Delete workflow' })

    expect(screen.getByText('Delete workflow')).toBeInTheDocument()
  })

  it('does not call onConfirm when cancel is clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(props.onConfirm).not.toHaveBeenCalled()
  })

  it('does not call onClose when confirm is clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(props.onClose).not.toHaveBeenCalled()
  })

  it('has no accessibility violations with danger variant', async () => {
    const { baseElement } = renderDialog({
      confirmVariant: 'danger',
      confirmLabel: 'Delete',
      title: 'Delete item',
      children: 'This action cannot be undone.',
      'aria-labelledby': 'danger-dialog-title',
      'aria-describedby': 'danger-dialog-body',
    })

    const results = await axe(baseElement)
    expect(results).toHaveNoViolations()
  })

  it('accepts a medium modal variant', () => {
    renderDialog({ variant: 'medium' })

    expect(screen.getByText('Confirm action')).toBeInTheDocument()
  })

  it('accepts a large modal variant', () => {
    renderDialog({ variant: 'large' })

    expect(screen.getByText('Confirm action')).toBeInTheDocument()
  })

  it('renders with warning titleIconVariant', () => {
    renderDialog({ titleIconVariant: 'warning' })

    expect(screen.getByText('Confirm action')).toBeInTheDocument()
  })

  it('renders with danger titleIconVariant', () => {
    renderDialog({ titleIconVariant: 'danger' })

    expect(screen.getByText('Confirm action')).toBeInTheDocument()
  })

  it('has no accessibility violations when closed', async () => {
    const { baseElement } = renderDialog({ isOpen: false })

    const results = await axe(baseElement)
    expect(results).toHaveNoViolations()
  })
})
