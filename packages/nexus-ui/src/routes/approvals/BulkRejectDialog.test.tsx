import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { BulkRejectDialog } from './BulkRejectDialog'

describe('BulkRejectDialog', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    approvalCount: 2,
  }

  it('renders modal with correct title', () => {
    render(<BulkRejectDialog {...defaultProps} />)

    expect(screen.getByRole('dialog', { name: /reject 2 steps/i })).toBeInTheDocument()
  })

  it('renders singular title for single approval', () => {
    render(<BulkRejectDialog {...defaultProps} approvalCount={1} />)

    expect(screen.getByRole('dialog', { name: /reject 1 step$/i })).toBeInTheDocument()
  })

  it('displays approval count message', () => {
    render(<BulkRejectDialog {...defaultProps} />)

    expect(screen.getByText(/You are about to reject 2 steps/)).toBeInTheDocument()
  })

  it('renders required rejection reason field', () => {
    render(<BulkRejectDialog {...defaultProps} />)

    const field = screen.getByLabelText(/rejection reason/i)
    expect(field).toBeInTheDocument()
    expect(field).toBeRequired()
  })

  it('disables reject button when note is empty', () => {
    render(<BulkRejectDialog {...defaultProps} />)

    expect(screen.getByRole('button', { name: /reject/i })).toBeDisabled()
  })

  it('enables reject button when note has content', async () => {
    const user = userEvent.setup()
    render(<BulkRejectDialog {...defaultProps} />)

    const noteField = screen.getByLabelText(/rejection reason/i)
    await user.type(noteField, 'Test rejection reason')

    expect(screen.getByRole('button', { name: /reject/i })).toBeEnabled()
  })

  it('calls onConfirm with trimmed note when reject button clicked', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()

    render(<BulkRejectDialog {...defaultProps} onConfirm={onConfirm} />)

    const noteField = screen.getByLabelText(/rejection reason/i)
    await user.type(noteField, '  Test rejection reason  ')

    await user.click(screen.getByRole('button', { name: /reject/i }))

    expect(onConfirm).toHaveBeenCalledWith('Test rejection reason')
  })

  it('does not call onConfirm when note is empty', () => {
    const onConfirm = vi.fn()

    render(<BulkRejectDialog {...defaultProps} onConfirm={onConfirm} />)

    const rejectButton = screen.getByRole('button', { name: /reject/i })
    // Button is disabled when note is empty
    expect(rejectButton).toBeDisabled()

    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('calls onClose when cancel button clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(<BulkRejectDialog {...defaultProps} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('disables buttons when isLoading is true', async () => {
    const user = userEvent.setup()
    render(<BulkRejectDialog {...defaultProps} isLoading={true} />)

    const noteField = screen.getByLabelText(/rejection reason/i)
    await user.type(noteField, 'Test reason')

    expect(screen.getByRole('button', { name: /reject/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()
  })

  it('does not render when isOpen is false', () => {
    render(<BulkRejectDialog {...defaultProps} isOpen={false} />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('displays approval count in message', () => {
    render(<BulkRejectDialog {...defaultProps} />)

    expect(screen.getByText(/You are about to reject 2 steps/)).toBeInTheDocument()
  })

  it('displays singular form for single approval', () => {
    render(<BulkRejectDialog {...defaultProps} approvalCount={1} />)

    expect(screen.getByText(/You are about to reject 1 step\./)).toBeInTheDocument()
  })

  it('displays plural form for multiple approvals', () => {
    render(<BulkRejectDialog {...defaultProps} approvalCount={2} />)

    expect(screen.getByText(/You are about to reject 2 steps/)).toBeInTheDocument()
  })

  it('has warning icon in header', () => {
    render(<BulkRejectDialog {...defaultProps} />)

    // PatternFly Modal with titleIconVariant="warning" renders an ExclamationTriangleIcon
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()

    // The warning icon is rendered as part of the modal header with specific PatternFly classes
    const header = dialog.querySelector('.pf-v6-c-modal-box__header')
    expect(header).toBeInTheDocument()
    const icon = header?.querySelector('.pf-v6-c-modal-box__title-icon')
    expect(icon).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<BulkRejectDialog {...defaultProps} />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations with note entered', async () => {
    const user = userEvent.setup()
    const { container } = render(<BulkRejectDialog {...defaultProps} />)

    const noteField = screen.getByLabelText(/rejection reason/i)
    await user.type(noteField, 'Test rejection reason')

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
