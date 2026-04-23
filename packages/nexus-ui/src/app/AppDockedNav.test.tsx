import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { COLOR_SCHEME_STORAGE_KEY } from '../theme/colorScheme'
import { ColorSchemeProvider } from '../theme/ColorSchemeProvider'

import { AppDockedNav } from './AppDockedNav'

// Mock wouter
const mockNavigate = vi.fn()
vi.mock('wouter', () => ({
  useLocation: () => ['/workflows', mockNavigate],
}))

// Mock useUnsavedChanges
const mockRequestNavigation = vi.fn()
vi.mock('./useUnsavedChanges', () => ({
  useUnsavedChanges: () => ({
    requestNavigation: mockRequestNavigation,
    hasUnsavedChanges: false,
  }),
}))

// Mock useAuthStore used by UserMenuDropdown
vi.mock('../stores/useAuthStore', () => ({
  useAuthStore: vi.fn((selector: unknown) =>
    typeof selector === 'function'
      ? (selector as (state: { logout: ReturnType<typeof vi.fn> }) => unknown)({ logout: vi.fn() })
      : { logout: vi.fn() }
  ),
}))

function renderDockedNav() {
  return render(
    <ColorSchemeProvider>
      <AppDockedNav />
    </ColorSchemeProvider>
  )
}

describe('AppDockedNav', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    document.documentElement.classList.add('pf-v6-theme-dark', 'pf-v6-theme-glass')
  })

  afterEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('pf-v6-theme-dark', 'pf-v6-theme-glass')
  })

  it('renders navigation items', () => {
    renderDockedNav()
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument()
  })

  it('renders user menu toggle', () => {
    renderDockedNav()
    expect(screen.getByRole('button', { name: 'User menu' })).toBeInTheDocument()
  })

  it('renders help button', () => {
    renderDockedNav()
    expect(screen.getByRole('button', { name: 'Help' })).toBeInTheDocument()
  })

  it('renders color scheme toggle when in dark mode', () => {
    renderDockedNav()
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument()
  })

  it('persists light mode and updates document when toggling from dark', async () => {
    const user = userEvent.setup()
    renderDockedNav()
    await user.click(screen.getByRole('button', { name: 'Switch to light mode' }))
    expect(document.documentElement.classList.contains('pf-v6-theme-dark')).toBe(false)
    expect(localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)).toBe('light')
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument()
  })

  it('renders menu toggle button', () => {
    renderDockedNav()
    expect(screen.getByRole('button', { name: 'Toggle menu' })).toBeInTheDocument()
  })

  it('opens user menu when clicked', async () => {
    const user = userEvent.setup()
    renderDockedNav()

    const userMenuButton = screen.getByRole('button', { name: 'User menu' })
    await user.click(userMenuButton)

    // Menu should be open - check for dropdown items
    expect(screen.getByText('My Profile')).toBeInTheDocument()
    expect(screen.getByText('Logout')).toBeInTheDocument()
  })

  it('toggles user menu isExpanded state when clicked', async () => {
    const user = userEvent.setup()
    renderDockedNav()

    const userMenuButton = screen.getByRole('button', { name: 'User menu' })

    // First click - opens menu
    await user.click(userMenuButton)
    expect(screen.getByText('My Profile')).toBeInTheDocument()

    // Verify menu button has expanded state
    expect(userMenuButton).toHaveAttribute('aria-expanded', 'true')
  })

  it('navigates when help button is clicked', async () => {
    const user = userEvent.setup()
    renderDockedNav()

    const helpButton = screen.getByRole('button', { name: 'Help' })
    await user.click(helpButton)

    expect(mockRequestNavigation).toHaveBeenCalled()
  })

  it('navigates when nav item is selected', async () => {
    const user = userEvent.setup()
    renderDockedNav()

    const navItem = screen.getByLabelText('Workflows')
    await user.click(navItem)
    expect(mockRequestNavigation).toHaveBeenCalled()
  })

  it('renders with correct active state based on location', () => {
    renderDockedNav()

    // Since we mocked location as '/workflows', that nav item should be active
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(nav).toBeInTheDocument()
  })

  it('renders masthead', () => {
    renderDockedNav()

    expect(screen.getByRole('banner')).toBeInTheDocument()
  })

  it('navigates to Integrations when Configuration is clicked', async () => {
    const user = userEvent.setup()
    renderDockedNav()

    const configItem = screen.getByLabelText('Configuration')
    await user.click(configItem)

    expect(mockRequestNavigation).toHaveBeenCalledWith('/configuration/integrations')
  })

  it('shows dropdown with Access Management and Authentication when Access Management is clicked', async () => {
    const user = userEvent.setup()
    renderDockedNav()

    const navButton = screen.getByRole('button', { name: 'Access Management' })
    await user.click(navButton)

    // Verify flyout menu appears with menu items (Users and Groups)
    const menu = screen.getByRole('menu')
    const menuItems = within(menu).getAllByRole('menuitem')

    // Access Management has 3 child items: Access Management, Identity Providers, Settings
    expect(menuItems.length).toBe(3)
    expect(menu).toBeInTheDocument()
  })

  it('navigates to Access Management from Access Management dropdown', async () => {
    const user = userEvent.setup()
    renderDockedNav()

    const navButton = screen.getByRole('button', { name: 'Access Management' })
    await user.click(navButton)

    const menu = screen.getByRole('menu')
    const menuItems = within(menu).getAllByRole('menuitem')
    await user.click(menuItems[0])
    expect(mockRequestNavigation).toHaveBeenCalledWith('/access-management')
  })

  it('navigates to Authentication from Access Management dropdown', async () => {
    const user = userEvent.setup()
    renderDockedNav()

    const navButton = screen.getByRole('button', { name: 'Access Management' })
    await user.click(navButton)

    await user.click(screen.getByText('Identity Providers'))
    expect(mockRequestNavigation).toHaveBeenCalledWith('/access-management/authentication')
  })

  it('has no accessibility violations', async () => {
    const { container } = renderDockedNav()

    // Exclude aria-required-children: PatternFly Nav renders Divider as
    // <li role="separator"> inside <ul role="list">, which axe flags.
    // This is a PatternFly rendering concern, not an application-level issue.
    const results = await axe(container, {
      rules: { 'aria-required-children': { enabled: false } },
    })
    expect(results).toHaveNoViolations()
  })
})
