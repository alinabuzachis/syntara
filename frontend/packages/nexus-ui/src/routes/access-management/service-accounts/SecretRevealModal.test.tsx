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
    identifier: 'client-id-abc123',
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

    expect(screen.getByText('Save these credentials now')).toBeInTheDocument()
  })

  it('renders the client ID and client secret values in inputs', () => {
    render(<SecretRevealModal {...defaultProps} />)

    const inputs = screen.getAllByRole('textbox', { name: 'Copyable input' })
    expect(inputs[0]).toHaveValue('client-id-abc123')
    expect(inputs[1]).toHaveValue('secret-xyz789')
  })

  it('renders the footer Close button disabled until checkbox is checked', () => {
    render(<SecretRevealModal {...defaultProps} />)

    expect(getFooterCloseButton()).toBeDisabled()
  })

  it('enables footer Close button after checking the acknowledgement checkbox', async () => {
    const user = userEvent.setup()
    render(<SecretRevealModal {...defaultProps} />)

    await user.click(screen.getByRole('checkbox', { name: 'I have saved the credentials' }))

    expect(getFooterCloseButton()).toBeEnabled()
  })

  it('calls onClose when footer Close button is clicked after acknowledgement', async () => {
    const user = userEvent.setup()
    render(<SecretRevealModal {...defaultProps} />)

    await user.click(screen.getByRole('checkbox', { name: 'I have saved the credentials' }))
    await user.click(getFooterCloseButton())

    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('resets acknowledgement checkbox on reopen', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<SecretRevealModal {...defaultProps} />)

    await user.click(screen.getByRole('checkbox', { name: 'I have saved the credentials' }))
    await user.click(getFooterCloseButton())

    rerender(<SecretRevealModal {...defaultProps} isOpen={false} />)
    rerender(<SecretRevealModal {...defaultProps} isOpen={true} />)

    expect(screen.getByRole('checkbox', { name: 'I have saved the credentials' })).not.toBeChecked()
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

      await user.click(screen.getByRole('checkbox', { name: 'I have saved the credentials' }))

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })
})
