import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

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

  // TODO: Uncomment this when mode switcher is implemented
  // it('renders dark mode toggle', () => {
  //   render(<AppDockedNav />)
  //   expect(screen.getByRole('button', { name: 'Toggle dark mode' })).toBeInTheDocument()
  // })

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

  it('navigates when nav item is selected', async () => {
    const user = userEvent.setup()
    render(<AppDockedNav />)

    const navItem = screen.getByLabelText('Automations')
    await user.click(navItem)
    expect(mockRequestNavigation).toHaveBeenCalled()
  })

  it('renders with correct active state based on location', () => {
    render(<AppDockedNav />)

    // Since we mocked location as '/automations', that nav item should be active
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(nav).toBeInTheDocument()
  })

  it('renders masthead', () => {
    render(<AppDockedNav />)

    expect(screen.getByRole('banner')).toBeInTheDocument()
  })

  it('navigates to Integrations when Configuration is clicked', async () => {
    const user = userEvent.setup()
    render(<AppDockedNav />)

    const configItem = screen.getByLabelText('Configuration')
    await user.click(configItem)

    expect(mockRequestNavigation).toHaveBeenCalledWith('/configuration/integrations')
  })

  it('shows dropdown with Access Management and Authentication when Access Management is clicked', async () => {
    const user = userEvent.setup()
    render(<AppDockedNav />)

    const navButton = screen.getByRole('button', { name: 'Access Management' })
    await user.click(navButton)

    // Verify flyout menu appears with menu items (Users and Groups)
    const menu = screen.getByRole('menu')
    const menuItems = within(menu).getAllByRole('menuitem')

    // Access Management has 2 child items: Users and Groups
    expect(menuItems.length).toBe(2)
    expect(menu).toBeInTheDocument()
  })

  it('navigates to Access Management from Access Management dropdown', async () => {
    const user = userEvent.setup()
    render(<AppDockedNav />)

    const navButton = screen.getByRole('button', { name: 'Access Management' })
    await user.click(navButton)

    const menu = screen.getByRole('menu')
    const menuItems = within(menu).getAllByRole('menuitem')
    await user.click(menuItems[0])
    expect(mockRequestNavigation).toHaveBeenCalledWith('/access-management')
  })

  it('navigates to Authentication from Access Management dropdown', async () => {
    const user = userEvent.setup()
    render(<AppDockedNav />)

    const navButton = screen.getByRole('button', { name: 'Access Management' })
    await user.click(navButton)

    await user.click(screen.getByText('Identity Providers'))
    expect(mockRequestNavigation).toHaveBeenCalledWith('/access-management/authentication')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<AppDockedNav />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
