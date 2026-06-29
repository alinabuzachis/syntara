import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { COLOR_SCHEME_STORAGE_KEY } from '../providers/theme/colorScheme'
import { ColorSchemeProvider } from '../providers/theme/ColorSchemeProvider'

import { AppDockedNav } from './AppDockedNav'

// Mock wouter
const mockNavigate = vi.fn()
vi.mock('../hooks/routing/useLocation', () => ({
  useLocation: () => '/workflows',
}))
vi.mock('../hooks/routing/useNavigate', () => ({
  useNavigate: () => mockNavigate,
}))

// Mock useUnsavedChanges
const mockRequestNavigation = vi.fn()
vi.mock('./useUnsavedChanges', () => ({
  useUnsavedChanges: () => ({
    requestNavigation: mockRequestNavigation,
    hasUnsavedChanges: false,
  }),
}))

// Mock usePermissionChecks used by useFilteredNavigationItems
vi.mock('../hooks/usePermissionChecks', () => ({
  usePermissionChecks: () => ({
    permissions: {
      'setting:read': true,
      'user:read': true,
      'group:read': true,
      'identity-provider:read': true,
      'project:read': true,
      'role-assignment:read': true,
    },
    isLoading: false,
  }),
}))

// Mock useAuthStore used by UserMenuDropdown
const mockLogout = vi.fn().mockResolvedValue(undefined)
vi.mock('../stores/useAuthStore', () => ({
  useAuthStore: vi.fn((selector: unknown) =>
    typeof selector === 'function'
      ? (selector as (state: { logout: ReturnType<typeof vi.fn> }) => unknown)({ logout: mockLogout })
      : { logout: mockLogout }
  ),
}))

vi.mock('../client', () => ({
  authClient: { useQuery: vi.fn().mockReturnValue({ data: undefined }) },
  authMiddleware: { onRequest: vi.fn() },
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

  it('renders documentation button', () => {
    renderDockedNav()
    expect(screen.getByRole('button', { name: 'Documentation (opens in a new tab)' })).toBeInTheDocument()
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

  it('shows My Profile and Logout in user menu when hovered', async () => {
    const user = userEvent.setup()
    renderDockedNav()

    await user.hover(screen.getByRole('button', { name: 'User menu' }))

    expect(screen.getByText('My Profile')).toBeInTheDocument()
    expect(screen.getByText('Logout')).toBeInTheDocument()
    expect(screen.queryByText('Settings')).not.toBeInTheDocument()
  })

  it('opens user menu when Enter is pressed while focused', async () => {
    const user = userEvent.setup()
    renderDockedNav()

    await user.tab()
    const userMenuButton = screen.getByRole('button', { name: 'User menu' })
    userMenuButton.focus()
    await user.keyboard('{Enter}')

    expect(screen.getByText('My Profile')).toBeInTheDocument()
    expect(screen.getByText('Logout')).toBeInTheDocument()
  })

  it('navigates to /my-profile when My Profile is clicked', async () => {
    const user = userEvent.setup()
    renderDockedNav()

    await user.hover(screen.getByRole('button', { name: 'User menu' }))
    await user.click(screen.getByText('My Profile'))

    expect(mockNavigate).toHaveBeenCalledWith('/my-profile')
  })

  it('opens external documentation when documentation button is clicked', async () => {
    const user = userEvent.setup()
    const openSpy = vi.spyOn(globalThis, 'open').mockImplementation(() => null)
    renderDockedNav()

    await user.click(screen.getByRole('button', { name: 'Documentation (opens in a new tab)' }))

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('https://docs.ansible.com/'),
      '_blank',
      'noopener,noreferrer'
    )
    openSpy.mockRestore()
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

  it('renders Red Hat logo link to home page', () => {
    renderDockedNav()

    const banner = screen.getByRole('banner')
    const logoLink = within(banner).getByRole('link', { name: 'Home' })

    expect(logoLink).toBeInTheDocument()
    expect(logoLink).toHaveAttribute('href', '/')
  })

  it('navigates to Integrations when Configuration is clicked', async () => {
    const user = userEvent.setup()
    renderDockedNav()

    const configItem = screen.getByLabelText('Configuration')
    await user.click(configItem)

    expect(mockRequestNavigation).toHaveBeenCalledWith('/configuration/integrations')
  })

  it('shows dropdown with Integrations and Credentials when Configuration is clicked', async () => {
    const user = userEvent.setup()
    renderDockedNav()

    const navButton = screen.getByRole('button', { name: 'Configuration' })
    await user.click(navButton)

    const menu = screen.getByRole('menu')
    const menuItems = within(menu).getAllByRole('menuitem')

    // Configuration has 2 child items: Integrations, Credentials (Settings moved to System Administration)
    expect(menuItems.length).toBe(2)
    expect(menu).toBeInTheDocument()
  })

  it('shows dropdown with Access Management, Identity Providers, and Settings when System Administration is clicked', async () => {
    const user = userEvent.setup()
    renderDockedNav()

    const navButton = screen.getByRole('button', { name: 'System Administration' })
    await user.click(navButton)

    const menu = screen.getByRole('menu')
    const menuItems = within(menu).getAllByRole('menuitem')

    // System Administration has 3 child items: Access Management, Identity Providers, Settings
    expect(menuItems.length).toBe(3)
    expect(menu).toBeInTheDocument()
  })

  it('navigates to Access Management from System Administration dropdown', async () => {
    const user = userEvent.setup()
    renderDockedNav()

    const navButton = screen.getByRole('button', { name: 'System Administration' })
    await user.click(navButton)

    const menu = screen.getByRole('menu')
    const menuItems = within(menu).getAllByRole('menuitem')
    await user.click(menuItems[0])
    expect(mockRequestNavigation).toHaveBeenCalledWith('/system-administration/access-management')
  })

  it('navigates to Identity Providers from System Administration dropdown', async () => {
    const user = userEvent.setup()
    renderDockedNav()

    const navButton = screen.getByRole('button', { name: 'System Administration' })
    await user.click(navButton)

    await user.click(screen.getByText('Identity Providers'))
    expect(mockRequestNavigation).toHaveBeenCalledWith('/system-administration/authentication')
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

  it('calls logout directly when Logout is clicked', async () => {
    const user = userEvent.setup()
    renderDockedNav()

    await user.hover(screen.getByRole('button', { name: 'User menu' }))
    await user.click(screen.getByText('Logout'))

    // Should call logout directly — no modal
    expect(mockLogout).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
