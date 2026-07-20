import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { BUILTIN_ADMIN_TOGGLE_DISABLED_REASON } from './adminConstants'
import { BuiltInAdminCard } from './BuiltInAdminCard'

describe('BuiltInAdminCard', () => {
  const defaultProps = {
    userId: 'user-123',
    isEnabled: true,
    canToggle: true,
    onToggle: vi.fn(),
  }

  it('renders "Enabled" label and status when isEnabled=true', () => {
    render(<BuiltInAdminCard {...defaultProps} isEnabled />)

    expect(screen.getAllByText('Enabled')).toHaveLength(2) // Label + Switch
    expect(screen.getByRole('switch', { name: 'Built-in administrator account enabled' })).toBeChecked()
  })

  it('renders "Disabled" label and status when isEnabled=false', () => {
    render(<BuiltInAdminCard {...defaultProps} isEnabled={false} />)

    expect(screen.getAllByText('Disabled')).toHaveLength(2) // Label + Switch
    expect(screen.getByRole('switch', { name: 'Built-in administrator account disabled' })).not.toBeChecked()
  })

  it('switch is disabled when canToggle=false', () => {
    render(<BuiltInAdminCard {...defaultProps} canToggle={false} />)

    expect(screen.getByRole('switch')).toBeDisabled()
  })

  it('switch is enabled when canToggle=true', () => {
    render(<BuiltInAdminCard {...defaultProps} canToggle />)

    expect(screen.getByRole('switch')).toBeEnabled()
  })

  it('calls onToggle when switch is clicked', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(<BuiltInAdminCard {...defaultProps} onToggle={onToggle} />)

    await user.click(screen.getByRole('switch'))

    expect(onToggle).toHaveBeenCalledWith(false)
  })

  it('renders admin account name as a navigational link to the user detail page', () => {
    render(<BuiltInAdminCard {...defaultProps} />)

    const link = screen.getByRole('link', { name: 'Built-in Administrator Account' })
    expect(link).toHaveAttribute('href', '/system-administration/access-management/users/user-123')
  })

  it('shows tooltip when canToggle=false', async () => {
    const user = userEvent.setup()
    render(<BuiltInAdminCard {...defaultProps} canToggle={false} />)

    await user.hover(screen.getByRole('switch'))

    expect(await screen.findByText(BUILTIN_ADMIN_TOGGLE_DISABLED_REASON)).toBeInTheDocument()
  })

  it('has no accessibility violations (enabled state)', async () => {
    const { container } = render(<BuiltInAdminCard {...defaultProps} isEnabled />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations (disabled state)', async () => {
    const { container } = render(<BuiltInAdminCard {...defaultProps} isEnabled={false} canToggle={false} />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
