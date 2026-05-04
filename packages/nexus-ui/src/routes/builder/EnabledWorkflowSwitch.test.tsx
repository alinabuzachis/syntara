import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { EnabledWorkflowSwitch } from './EnabledWorkflowSwitch'

describe('EnabledWorkflowSwitch', () => {
  const defaultProps = {
    isEnabled: false,
    isSaving: false,
    onToggle: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders with Disabled label when not enabled', () => {
    render(<EnabledWorkflowSwitch {...defaultProps} />)

    expect(screen.getByText(/Disabled/i)).toBeInTheDocument()
  })

  it('renders with Enabled label when enabled', () => {
    render(<EnabledWorkflowSwitch {...defaultProps} isEnabled={true} />)

    expect(screen.getByText(/Enabled/i)).toBeInTheDocument()
  })

  it('calls onToggle with true when toggled to enabled', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()

    render(<EnabledWorkflowSwitch {...defaultProps} onToggle={onToggle} />)

    const switchInput = screen.getByRole('switch')
    await user.click(switchInput)

    expect(onToggle).toHaveBeenCalledWith(true)
  })

  it('calls onToggle with false when toggled to disabled', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()

    render(<EnabledWorkflowSwitch {...defaultProps} isEnabled={true} onToggle={onToggle} />)

    const switchInput = screen.getByRole('switch')
    await user.click(switchInput)

    expect(onToggle).toHaveBeenCalledWith(false)
  })

  it('calls onToggle with correct value when switch state changes', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()

    const { rerender } = render(<EnabledWorkflowSwitch {...defaultProps} isEnabled={false} onToggle={onToggle} />)

    const switchInput = screen.getByRole('switch')

    // Simulate toggle to enabled
    await user.click(switchInput)
    expect(onToggle).toHaveBeenCalledWith(true)

    // Clear mock
    onToggle.mockClear()

    // Re-render with enabled state
    rerender(<EnabledWorkflowSwitch {...defaultProps} isEnabled={true} onToggle={onToggle} />)

    // Simulate toggle to disabled
    await user.click(screen.getByRole('switch'))
    expect(onToggle).toHaveBeenCalledWith(false)
  })

  it('is disabled when saving', () => {
    render(<EnabledWorkflowSwitch {...defaultProps} isSaving={true} />)

    const switchInput = screen.getByRole('switch')
    expect(switchInput).toBeDisabled()
  })

  it('has no accessibility violations when disabled', async () => {
    const { container } = render(<EnabledWorkflowSwitch {...defaultProps} />)

    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no accessibility violations when enabled', async () => {
    const { container } = render(<EnabledWorkflowSwitch {...defaultProps} isEnabled={true} />)

    expect(await axe(container)).toHaveNoViolations()
  })
})
