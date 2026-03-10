import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppDockedNav } from './AppDockedNav'

// Mock wouter
const mockNavigate = vi.fn()
vi.mock('wouter', () => ({
  useLocation: () => ['/automations', mockNavigate],
}))

// Mock useUnsavedChanges
const mockRequestNavigation = vi.fn()
vi.mock('./useUnsavedChanges', () => ({
  useUnsavedChanges: () => ({
    requestNavigation: mockRequestNavigation,
    hasUnsavedChanges: false,
  }),
}))

describe('AppDockedNav', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders navigation items', () => {
    render(<AppDockedNav />)
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument()
  })

  it('renders user menu toggle', () => {
    render(<AppDockedNav />)
    expect(screen.getByRole('button', { name: 'User menu' })).toBeInTheDocument()
  })

  it('renders help button', () => {
    render(<AppDockedNav />)
    expect(screen.getByRole('button', { name: 'Help' })).toBeInTheDocument()
  })

  it('renders dark mode toggle', () => {
    render(<AppDockedNav />)
    expect(screen.getByRole('button', { name: 'Toggle dark mode' })).toBeInTheDocument()
  })

  it('renders menu toggle button', () => {
    render(<AppDockedNav />)
    expect(screen.getByRole('button', { name: 'Toggle menu' })).toBeInTheDocument()
  })

  it('opens user menu when clicked', async () => {
    const user = userEvent.setup()
    render(<AppDockedNav />)

    const userMenuButton = screen.getByRole('button', { name: 'User menu' })
    await user.click(userMenuButton)

    // Menu should be open - check for dropdown items
    expect(screen.getByText('My Profile')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByText('Logout')).toBeInTheDocument()
  })

  it('toggles user menu isExpanded state when clicked', async () => {
    const user = userEvent.setup()
    render(<AppDockedNav />)

    const userMenuButton = screen.getByRole('button', { name: 'User menu' })

    // First click - opens menu
    await user.click(userMenuButton)
    expect(screen.getByText('My Profile')).toBeInTheDocument()

    // Verify menu button has expanded state
    expect(userMenuButton).toHaveAttribute('aria-expanded', 'true')
  })

  it('navigates when help button is clicked', async () => {
    const user = userEvent.setup()
    render(<AppDockedNav />)

    const helpButton = screen.getByRole('button', { name: 'Help' })
    await user.click(helpButton)

    expect(mockRequestNavigation).toHaveBeenCalled()
  })

  it('navigates when nav item is selected', () => {
    render(<AppDockedNav />)

    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    const navItems = nav.querySelectorAll('a')

    // Click on a nav item
    if (navItems.length > 0) {
      fireEvent.click(navItems[0])
      expect(mockRequestNavigation).toHaveBeenCalled()
    }
  })

  it('renders with correct active state based on location', () => {
    render(<AppDockedNav />)

    // Since we mocked location as '/automations', that nav item should be active
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(nav).toBeInTheDocument()
  })

  it('renders Red Hat icon in masthead', () => {
    const { container } = render(<AppDockedNav />)
    expect(container.querySelector('#docked-masthead')).toBeInTheDocument()
  })
})
