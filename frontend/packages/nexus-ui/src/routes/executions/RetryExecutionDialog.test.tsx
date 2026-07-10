import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'

import { RetryExecutionDialog } from './RetryExecutionDialog'

function renderDialog(props: Partial<React.ComponentProps<typeof RetryExecutionDialog>> = {}) {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    isCurrentVersion: true,
    ...props,
  }
  return { ...render(<RetryExecutionDialog {...defaultProps} />), props: defaultProps }
}

describe('RetryExecutionDialog', () => {
  it('renders current version copy', () => {
    renderDialog({ isCurrentVersion: true })

    expect(screen.getByText('Retry run?')).toBeInTheDocument()
    expect(screen.getByText(/re-execute and you can track its progress/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry run' })).toBeInTheDocument()
  })

  it('renders older version copy with version label', () => {
    renderDialog({ isCurrentVersion: false, versionLabel: 'Jan 15, 2024' })

    expect(screen.getByText('Retry run?')).toBeInTheDocument()
    expect(screen.getByText(/older version of the workflow/)).toBeInTheDocument()
    expect(screen.getByText(/Jan 15, 2024/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry original version' })).toBeInTheDocument()
  })

  it('calls onConfirm when confirm button is clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Retry run' }))

    expect(props.onConfirm).toHaveBeenCalledOnce()
  })

  it('calls onClose when cancel button is clicked', async () => {
    const user = userEvent.setup()
    const { props } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(props.onClose).toHaveBeenCalledOnce()
  })

  it('does not render when isOpen is false', () => {
    renderDialog({ isOpen: false })

    expect(screen.queryByText('Retry run?')).not.toBeInTheDocument()
  })

  it('has no accessibility violations (current version)', async () => {
    const { container } = renderDialog({ isCurrentVersion: true })
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations (older version)', async () => {
    const { container } = renderDialog({ isCurrentVersion: false, versionLabel: 'v2' })
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
