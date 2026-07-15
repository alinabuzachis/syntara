import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { SecretRevealModal } from './SecretRevealModal'

function getFooterCloseButton() {
  const allCloseButtons = screen.getAllByRole('button', { name: 'Close' })
  return allCloseButtons[allCloseButtons.length - 1]
}

describe('SecretRevealModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    title: 'Credential created',
    clientSecret: 'secret-xyz789',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the modal title', () => {
    render(<SecretRevealModal {...defaultProps} />)

    expect(screen.getByRole('heading', { name: 'Credential created' })).toBeInTheDocument()
  })

  it('renders the warning alert', () => {
    render(<SecretRevealModal {...defaultProps} />)

    expect(screen.getByText('Save this secret now')).toBeInTheDocument()
  })

  it('renders Client ID when identifier is provided', () => {
    render(<SecretRevealModal {...defaultProps} identifier="client-id-abc" />)

    expect(screen.getByText('Client ID')).toBeInTheDocument()
    const inputs = screen.getAllByRole('textbox', { name: 'Copyable input' })
    expect(inputs[0]).toHaveValue('client-id-abc')
  })

  it('does not render Client ID when identifier is not provided', () => {
    render(<SecretRevealModal {...defaultProps} />)

    expect(screen.queryByText('Client ID')).not.toBeInTheDocument()
  })

  it('renders the client secret value in a copyable input', () => {
    render(<SecretRevealModal {...defaultProps} />)

    expect(screen.getByRole('textbox', { name: 'Copyable input' })).toHaveValue('secret-xyz789')
  })

  it('renders the footer Close button disabled until checkbox is checked', () => {
    render(<SecretRevealModal {...defaultProps} />)

    expect(getFooterCloseButton()).toBeDisabled()
  })

  it('enables footer Close button after checking the acknowledgement checkbox', async () => {
    const user = userEvent.setup()
    render(<SecretRevealModal {...defaultProps} />)

    await user.click(screen.getByRole('checkbox', { name: 'I have saved the new secret' }))

    expect(getFooterCloseButton()).toBeEnabled()
  })

  it('calls onClose when footer Close button is clicked after acknowledgement', async () => {
    const user = userEvent.setup()
    render(<SecretRevealModal {...defaultProps} />)

    await user.click(screen.getByRole('checkbox', { name: 'I have saved the new secret' }))
    await user.click(getFooterCloseButton())

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('resets acknowledgement checkbox on reopen', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<SecretRevealModal {...defaultProps} />)

    await user.click(screen.getByRole('checkbox', { name: 'I have saved the new secret' }))
    await user.click(getFooterCloseButton())

    rerender(<SecretRevealModal {...defaultProps} isOpen={false} />)
    rerender(<SecretRevealModal {...defaultProps} isOpen={true} />)

    expect(screen.getByRole('checkbox', { name: 'I have saved the new secret' })).not.toBeChecked()
    expect(getFooterCloseButton()).toBeDisabled()
  })

  it('does not render content when closed', () => {
    render(<SecretRevealModal {...defaultProps} isOpen={false} />)

    expect(screen.queryByText('Credential created')).not.toBeInTheDocument()
  })

  describe('Accessibility', () => {
    it('has no accessibility violations', async () => {
      const { container } = render(<SecretRevealModal {...defaultProps} />)

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no accessibility violations with checkbox checked', async () => {
      const user = userEvent.setup()
      const { container } = render(<SecretRevealModal {...defaultProps} />)

      await user.click(screen.getByRole('checkbox', { name: 'I have saved the new secret' }))

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no accessibility violations with grace period info', async () => {
      const { container } = render(<SecretRevealModal {...defaultProps} gracePeriodSeconds={3600} />)

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no accessibility violations with immediate invalidation warning', async () => {
      const { container } = render(<SecretRevealModal {...defaultProps} gracePeriodSeconds={0} />)

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })

  describe('Grace period info', () => {
    it('shows grace period alert when gracePeriodSeconds is provided', () => {
      render(<SecretRevealModal {...defaultProps} gracePeriodSeconds={3600} />)

      expect(screen.getByText('Grace period active')).toBeInTheDocument()
      expect(screen.getByText(/1 hour/)).toBeInTheDocument()
    })

    it('shows correct duration for different grace periods', () => {
      const { rerender } = render(<SecretRevealModal {...defaultProps} gracePeriodSeconds={86400} />)

      expect(screen.getByText(/24 hours/)).toBeInTheDocument()

      rerender(<SecretRevealModal {...defaultProps} gracePeriodSeconds={14400} />)

      expect(screen.getByText(/4 hours/)).toBeInTheDocument()
    })

    it('shows immediate invalidation warning when gracePeriodSeconds is 0', () => {
      render(<SecretRevealModal {...defaultProps} gracePeriodSeconds={0} />)

      expect(screen.getByText('Previous secret invalidated')).toBeInTheDocument()
      expect(screen.getByText(/immediately invalidated/)).toBeInTheDocument()
      expect(screen.queryByText('Grace period active')).not.toBeInTheDocument()
    })

    it('does not show grace period or invalidation alert when gracePeriodSeconds is not provided', () => {
      render(<SecretRevealModal {...defaultProps} />)

      expect(screen.queryByText('Grace period active')).not.toBeInTheDocument()
      expect(screen.queryByText('Previous secret invalidated')).not.toBeInTheDocument()
    })
  })
})
