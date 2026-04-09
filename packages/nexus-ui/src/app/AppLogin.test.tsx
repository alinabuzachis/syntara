import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AlertProvider } from '../components/alerts'

import { AppLogin } from './AppLogin'
import type { AuthProvider } from './useAuthProviders'

// Mock the auth store
const mockLogin = vi.fn()
const mockRefresh = vi.fn()
let mockState = {
  isAuthenticated: false,
  isRefreshing: false,
  error: null as string | null,
  logoutCount: 0,
  login: mockLogin,
  refresh: mockRefresh,
}

vi.mock('../stores/useAuthStore', () => ({
  useAuthStore: Object.assign((selector: (state: typeof mockState) => unknown) => selector(mockState), {
    setState: vi.fn(),
    getState: () => mockState,
  }),
  selectIsAuthenticated: (state: typeof mockState) => state.isAuthenticated,
  selectIsRefreshing: (state: typeof mockState) => state.isRefreshing,
  selectAuthError: (state: typeof mockState) => state.error,
}))

// Mock useAuthProviders
let mockProviders: AuthProvider[] = []
let mockProvidersLoading = false

vi.mock('./useAuthProviders', () => ({
  useAuthProviders: () => ({
    providers: mockProviders,
    isLoading: mockProvidersLoading,
  }),
}))

function renderWithAlerts(ui: React.ReactNode) {
  return render(<AlertProvider>{ui}</AlertProvider>)
}

describe('AppLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState = {
      isAuthenticated: false,
      isRefreshing: false,
      error: null,
      logoutCount: 0,
      login: mockLogin,
      refresh: mockRefresh,
    }
    // Default: refresh fails (no cookie), so login screen shows
    mockRefresh.mockRejectedValue(new Error('No cookie'))
    // Default: no providers
    mockProviders = []
    mockProvidersLoading = false
  })

  it('renders children when authenticated', () => {
    mockState.isAuthenticated = true

    renderWithAlerts(
      <AppLogin>
        <div data-testid="app-content">App Content</div>
      </AppLogin>
    )

    expect(screen.getByTestId('app-content')).toBeInTheDocument()
    expect(screen.getByText('App Content')).toBeInTheDocument()
  })

  it('shows loading state while refreshing', async () => {
    mockState.isRefreshing = true
    // refresh() never settles so the component stays in loading state
    mockRefresh.mockReturnValue(new Promise(() => {}))

    renderWithAlerts(
      <AppLogin>
        <div>Protected Content</div>
      </AppLogin>
    )

    expect(screen.getByLabelText('Loading')).toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()

    // Flush the async bootstrap effect
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
  })

  it('shows login button after bootstrap refresh fails', async () => {
    renderWithAlerts(
      <AppLogin>
        <div>Protected Content</div>
      </AppLogin>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument()
    })

    expect(screen.getByText('Enter your credentials to continue')).toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('calls login when login button is clicked', async () => {
    const user = userEvent.setup()
    // Login rejects so isLoggingIn resets and button reappears
    mockLogin.mockRejectedValueOnce(new Error('Login failed'))

    renderWithAlerts(
      <AppLogin>
        <div>Content</div>
      </AppLogin>
    )

    // Wait for bootstrap to complete and login form to appear
    await screen.findByRole('button', { name: 'Log in' })

    // Fill in credentials (required by the LoginForm)
    await user.type(screen.getByRole('textbox', { name: /username/i }), 'demo')
    await user.type(screen.getByLabelText(/^Password/, { selector: 'input' }), 'coffee')

    await user.click(screen.getByRole('button', { name: 'Log in' }))

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({ username: 'demo', password: 'coffee' })
    })
  })

  it('attempts silent refresh on mount', async () => {
    renderWithAlerts(
      <AppLogin>
        <div>Content</div>
      </AppLogin>
    )

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalledTimes(1)
    })
  })

  it('does not call login automatically — only on button click', async () => {
    renderWithAlerts(
      <AppLogin>
        <div>Content</div>
      </AppLogin>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument()
    })

    expect(mockLogin).not.toHaveBeenCalled()
  })

  it('does not attempt auth when already authenticated', () => {
    mockState.isAuthenticated = true

    renderWithAlerts(
      <AppLogin>
        <div>Content</div>
      </AppLogin>
    )

    expect(screen.getByText('Content')).toBeInTheDocument()
  })

  it('handles undefined children', () => {
    mockState.isAuthenticated = true

    const { container } = renderWithAlerts(<AppLogin />)

    expect(container).toBeInTheDocument()
  })

  it('handles null children', () => {
    mockState.isAuthenticated = true

    const { container } = renderWithAlerts(<AppLogin>{null}</AppLogin>)

    expect(container).toBeInTheDocument()
  })

  describe('with identity providers', () => {
    beforeEach(() => {
      mockProviders = [
        { id: 'okta-1', name: 'Okta', provider_type: 'oidc' },
        { id: 'azure-1', name: 'Azure AD', provider_type: 'oidc' },
      ]
    })

    it('shows loading state while providers are loading', async () => {
      // Arrange
      mockProvidersLoading = true
      // refresh() never settles so the component stays in loading state
      mockRefresh.mockReturnValue(new Promise(() => {}))

      // Act
      renderWithAlerts(
        <AppLogin>
          <div>Protected Content</div>
        </AppLogin>
      )

      // Assert
      expect(screen.getByLabelText('Loading')).toBeInTheDocument()
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()

      // Flush the async bootstrap effect
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0))
      })
    })

    it('renders IDP buttons when providers exist', async () => {
      // Act
      renderWithAlerts(
        <AppLogin>
          <div>Content</div>
        </AppLogin>
      )

      // Assert
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /log in with okta/i })).toBeInTheDocument()
      })
      expect(screen.getByRole('button', { name: /log in with azure ad/i })).toBeInTheDocument()
    })

    it('shows subtitle "Choose your identity provider" when providers exist', async () => {
      // Act
      renderWithAlerts(
        <AppLogin>
          <div>Content</div>
        </AppLogin>
      )

      // Assert
      await waitFor(() => {
        expect(screen.getByText('Choose your identity provider')).toBeInTheDocument()
      })
    })

    it('does not show local login form by default when providers exist', async () => {
      // Act
      renderWithAlerts(
        <AppLogin>
          <div>Content</div>
        </AppLogin>
      )

      // Assert
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /log in with okta/i })).toBeInTheDocument()
      })
      expect(screen.queryByRole('textbox', { name: /username/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /log in as administrator/i })).not.toBeInTheDocument()
    })

    it('shows "Sign in using local account" toggle button', async () => {
      // Act
      renderWithAlerts(
        <AppLogin>
          <div>Content</div>
        </AppLogin>
      )

      // Assert
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Sign in using local account' })).toBeInTheDocument()
      })
    })

    it('shows local login form when "Sign in using local account" is clicked', async () => {
      // Arrange
      const user = userEvent.setup()

      // Act
      renderWithAlerts(
        <AppLogin>
          <div>Content</div>
        </AppLogin>
      )

      // Wait for toggle button and click it
      const toggleButton = await screen.findByRole('button', { name: 'Sign in using local account' })
      await user.click(toggleButton)

      // Assert
      expect(screen.getByRole('textbox', { name: /username/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /log in as administrator/i })).toBeInTheDocument()
    })

    it('hides local login form when "Hide local account login" is clicked', async () => {
      // Arrange
      const user = userEvent.setup()

      // Act
      renderWithAlerts(
        <AppLogin>
          <div>Content</div>
        </AppLogin>
      )

      // Show local login
      const showButton = await screen.findByRole('button', { name: 'Sign in using local account' })
      await user.click(showButton)

      // Verify form is visible
      expect(screen.getByRole('textbox', { name: /username/i })).toBeInTheDocument()

      // Hide local login
      const hideButton = screen.getByRole('button', { name: 'Hide local account login' })
      await user.click(hideButton)

      // Assert - form is hidden
      await waitFor(() => {
        expect(screen.queryByRole('textbox', { name: /username/i })).not.toBeInTheDocument()
      })
      expect(screen.queryByRole('button', { name: /log in as administrator/i })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Sign in using local account' })).toBeInTheDocument()
    })

    it('calls login when local login form is submitted', async () => {
      // Arrange
      const user = userEvent.setup()
      mockLogin.mockRejectedValueOnce(new Error('Login failed'))

      // Act
      renderWithAlerts(
        <AppLogin>
          <div>Content</div>
        </AppLogin>
      )

      // Show local login form
      const toggleButton = await screen.findByRole('button', { name: 'Sign in using local account' })
      await user.click(toggleButton)

      // Fill in credentials
      await user.type(screen.getByRole('textbox', { name: /username/i }), 'admin')
      await user.type(screen.getByLabelText(/^Password/, { selector: 'input' }), 'password123')

      // Submit
      await user.click(screen.getByRole('button', { name: /log in as administrator/i }))

      // Assert
      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith({ username: 'admin', password: 'password123' })
      })
    })

    it('shows helper text for local account when form is visible', async () => {
      // Arrange
      const user = userEvent.setup()

      // Act
      renderWithAlerts(
        <AppLogin>
          <div>Content</div>
        </AppLogin>
      )

      // Show local login form
      const toggleButton = await screen.findByRole('button', { name: 'Sign in using local account' })
      await user.click(toggleButton)

      // Assert
      expect(
        screen.getByText('For local account access only. Other users should sign in using the identity provider above.')
      ).toBeInTheDocument()
    })

    it('keeps IDP buttons visible when local login is shown', async () => {
      // Arrange
      const user = userEvent.setup()

      // Act
      renderWithAlerts(
        <AppLogin>
          <div>Content</div>
        </AppLogin>
      )

      // Show local login form
      const toggleButton = await screen.findByRole('button', { name: 'Sign in using local account' })
      await user.click(toggleButton)

      // Assert - IDP buttons still visible
      expect(screen.getByRole('button', { name: /log in with okta/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /log in with azure ad/i })).toBeInTheDocument()
    })

    it('shows divider between IDP buttons and local login form', async () => {
      // Arrange
      const user = userEvent.setup()

      // Act
      renderWithAlerts(
        <AppLogin>
          <div>Content</div>
        </AppLogin>
      )

      // Show local login form
      const toggleButton = await screen.findByRole('button', { name: 'Sign in using local account' })
      await user.click(toggleButton)

      // Assert - divider is present
      expect(screen.getByRole('separator')).toBeInTheDocument()
    })
  })

  describe('without identity providers', () => {
    it('renders login form when no providers', async () => {
      // Arrange
      mockProviders = []

      // Act
      renderWithAlerts(
        <AppLogin>
          <div>Protected Content</div>
        </AppLogin>
      )

      // Assert
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument()
      })

      expect(screen.getByText('Enter your credentials to continue')).toBeInTheDocument()
      expect(screen.queryByText('Choose your identity provider')).not.toBeInTheDocument()
    })

    it('does not show IDP buttons when no providers', async () => {
      // Arrange
      mockProviders = []

      // Act
      renderWithAlerts(
        <AppLogin>
          <div>Content</div>
        </AppLogin>
      )

      // Assert
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument()
      })

      expect(screen.queryByRole('button', { name: /log in with/i })).not.toBeInTheDocument()
    })

    it('does not show local account toggle when no providers', async () => {
      // Arrange
      mockProviders = []

      // Act
      renderWithAlerts(
        <AppLogin>
          <div>Content</div>
        </AppLogin>
      )

      // Assert
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument()
      })

      expect(screen.queryByRole('button', { name: 'Sign in using local account' })).not.toBeInTheDocument()
    })

    it('shows username and password inputs immediately when no providers', async () => {
      // Arrange
      mockProviders = []

      // Act
      renderWithAlerts(
        <AppLogin>
          <div>Content</div>
        </AppLogin>
      )

      // Assert
      await waitFor(() => {
        expect(screen.getByRole('textbox', { name: /username/i })).toBeInTheDocument()
      })
    })
  })
})
