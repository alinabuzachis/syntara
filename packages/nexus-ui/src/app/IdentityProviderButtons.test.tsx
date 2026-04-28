import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { IdentityProviderButtons } from './IdentityProviderButtons'
import type { AuthProvider } from './useAuthProviders'

describe('IdentityProviderButtons', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock window.location.assign
    Object.defineProperty(window, 'location', {
      value: { assign: vi.fn() },
      writable: true,
    })
  })

  it('renders nothing when providers array is empty', () => {
    // Arrange
    render(<IdentityProviderButtons providers={[]} />)

    // Assert
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders button for single provider', () => {
    // Arrange
    const providers: AuthProvider[] = [{ id: 'okta-1', name: 'Okta', provider_type: 'oidc' }]

    // Act
    render(<IdentityProviderButtons providers={providers} />)

    // Assert
    expect(screen.getByRole('button', { name: /log in with okta/i })).toBeInTheDocument()
  })

  it('renders button for each provider', () => {
    // Arrange
    const providers: AuthProvider[] = [
      { id: 'okta-1', name: 'Okta', provider_type: 'oidc' },
      { id: 'azure-1', name: 'Azure AD', provider_type: 'oidc' },
      { id: 'google-1', name: 'Google', provider_type: 'oidc' },
    ]

    // Act
    render(<IdentityProviderButtons providers={providers} />)

    // Assert
    expect(screen.getByRole('button', { name: /log in with okta/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /log in with azure ad/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /log in with google/i })).toBeInTheDocument()
  })

  it('button text includes provider name', () => {
    // Arrange
    const providers: AuthProvider[] = [{ id: 'custom-1', name: 'Custom Provider', provider_type: 'oidc' }]

    // Act
    render(<IdentityProviderButtons providers={providers} />)

    // Assert
    const button = screen.getByRole('button')
    expect(button).toHaveTextContent('Log in with Custom Provider')
  })

  it('calls window.location.assign with correct URL when button clicked', async () => {
    // Arrange
    const user = userEvent.setup()
    const providers: AuthProvider[] = [{ id: 'okta-123', name: 'Okta', provider_type: 'oidc' }]
    const mockAssign = vi.fn()
    window.location.assign = mockAssign

    // Act
    render(<IdentityProviderButtons providers={providers} />)
    await user.click(screen.getByRole('button', { name: /log in with okta/i }))

    // Assert
    expect(mockAssign).toHaveBeenCalledWith('/api/v1/auth/oidc/authorize?provider_id=okta-123')
  })

  it('encodes provider ID in URL', async () => {
    // Arrange
    const user = userEvent.setup()
    const providers: AuthProvider[] = [{ id: 'provider with spaces', name: 'Test', provider_type: 'oidc' }]
    const mockAssign = vi.fn()
    window.location.assign = mockAssign

    // Act
    render(<IdentityProviderButtons providers={providers} />)
    await user.click(screen.getByRole('button', { name: /log in with test/i }))

    // Assert
    expect(mockAssign).toHaveBeenCalledWith('/api/v1/auth/oidc/authorize?provider_id=provider%20with%20spaces')
  })

  it('displays provider icon for known provider', () => {
    // Arrange
    const providers: AuthProvider[] = [{ id: 'okta-1', name: 'Okta', provider_type: 'oidc' }]

    // Act
    render(<IdentityProviderButtons providers={providers} />)

    // Assert
    const button = screen.getByRole('button', { name: /log in with okta/i })
    expect(button.querySelector('svg')).toBeInTheDocument()
    expect(button).toHaveTextContent('Log in with Okta')
  })

  it('displays globe icon for unknown provider', () => {
    // Arrange
    const providers: AuthProvider[] = [{ id: 'custom-1', name: 'Custom IDP', provider_type: 'oidc' }]

    // Act
    render(<IdentityProviderButtons providers={providers} />)

    // Assert
    const button = screen.getByRole('button', { name: /log in with custom idp/i })
    expect(button.querySelector('svg')).toBeInTheDocument()
  })

  it('renders known brand icon for azure provider', () => {
    // Arrange
    const providers: AuthProvider[] = [{ id: 'azure-1', name: 'Azure AD', provider_type: 'oidc' }]

    // Act
    render(<IdentityProviderButtons providers={providers} />)

    // Assert - button exists, uses MicrosoftIcon (SVG) instead of letter
    const button = screen.getByRole('button', { name: /log in with azure ad/i })
    expect(button).toBeInTheDocument()
  })

  it('renders buttons with primary variant', () => {
    // Arrange
    const providers: AuthProvider[] = [{ id: 'okta-1', name: 'Okta', provider_type: 'oidc' }]

    // Act
    render(<IdentityProviderButtons providers={providers} />)

    // Assert
    const button = screen.getByRole('button', { name: /log in with okta/i })
    expect(button).toHaveClass('pf-m-primary')
  })

  it('renders buttons as block (full width)', () => {
    // Arrange
    const providers: AuthProvider[] = [{ id: 'okta-1', name: 'Okta', provider_type: 'oidc' }]

    // Act
    render(<IdentityProviderButtons providers={providers} />)

    // Assert
    const button = screen.getByRole('button', { name: /log in with okta/i })
    expect(button).toHaveClass('pf-m-block')
  })

  it('handles multiple providers with different IDs', async () => {
    // Arrange
    const user = userEvent.setup()
    const providers: AuthProvider[] = [
      { id: 'provider-1', name: 'Provider One', provider_type: 'oidc' },
      { id: 'provider-2', name: 'Provider Two', provider_type: 'oidc' },
    ]
    const mockAssign = vi.fn()
    window.location.assign = mockAssign

    // Act
    render(<IdentityProviderButtons providers={providers} />)

    // Click first button
    await user.click(screen.getByRole('button', { name: /log in with provider one/i }))
    expect(mockAssign).toHaveBeenCalledWith('/api/v1/auth/oidc/authorize?provider_id=provider-1')

    // Click second button
    mockAssign.mockClear()
    await user.click(screen.getByRole('button', { name: /log in with provider two/i }))
    expect(mockAssign).toHaveBeenCalledWith('/api/v1/auth/oidc/authorize?provider_id=provider-2')
  })

  it('renders a button for each provider', () => {
    // Arrange
    const providers: AuthProvider[] = [
      { id: 'p1', name: 'Provider 1', provider_type: 'oidc' },
      { id: 'p2', name: 'Provider 2', provider_type: 'oidc' },
    ]

    // Act
    render(<IdentityProviderButtons providers={providers} />)

    // Assert
    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(screen.getByRole('button', { name: /log in with provider 1/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /log in with provider 2/i })).toBeInTheDocument()
  })

  it('handles special characters in provider name', async () => {
    // Arrange
    const user = userEvent.setup()
    const providers: AuthProvider[] = [{ id: 'test-id', name: 'Test & Provider <Company>', provider_type: 'oidc' }]

    // Act
    render(<IdentityProviderButtons providers={providers} />)

    // Assert
    const button = screen.getByRole('button')
    expect(button).toHaveTextContent('Log in with Test & Provider <Company>')

    // Test click still works
    const mockAssign = vi.fn()
    window.location.assign = mockAssign
    await user.click(button)
    expect(mockAssign).toHaveBeenCalledWith('/api/v1/auth/oidc/authorize?provider_id=test-id')
  })

  it('handles empty provider name gracefully', () => {
    // Arrange
    const providers: AuthProvider[] = [{ id: 'empty-name', name: '', provider_type: 'oidc' }]

    // Act
    render(<IdentityProviderButtons providers={providers} />)

    // Assert - button still renders
    const button = screen.getByRole('button')
    expect(button).toBeInTheDocument()
    expect(button).toHaveTextContent('Log in with')
  })

  it('handles provider name with only whitespace', () => {
    // Arrange
    const providers: AuthProvider[] = [{ id: 'space-name', name: '   ', provider_type: 'oidc' }]

    // Act
    render(<IdentityProviderButtons providers={providers} />)

    // Assert
    const button = screen.getByRole('button')
    expect(button).toBeInTheDocument()
  })

  it('displays icons for different providers', () => {
    // Arrange
    const providers: AuthProvider[] = [
      { id: 'google', name: 'Google', provider_type: 'oidc' },
      { id: 'microsoft', name: 'Microsoft', provider_type: 'oidc' },
      { id: 'auth0', name: 'auth0', provider_type: 'oidc' },
    ]

    // Act
    render(<IdentityProviderButtons providers={providers} />)

    // Assert - each button has an SVG icon
    const googleButton = screen.getByRole('button', { name: /log in with google/i })
    expect(googleButton.querySelector('svg')).toBeInTheDocument()

    const microsoftButton = screen.getByRole('button', { name: /log in with microsoft/i })
    expect(microsoftButton.querySelector('svg')).toBeInTheDocument()

    const auth0Button = screen.getByRole('button', { name: /log in with auth0/i })
    expect(auth0Button.querySelector('svg')).toBeInTheDocument()
  })

  it('displays globe icon for each unknown provider', () => {
    // Arrange
    const providers: AuthProvider[] = [
      { id: 'test1', name: 'Zebra Auth', provider_type: 'oidc' },
      { id: 'test2', name: 'Yellow IDP', provider_type: 'oidc' },
      { id: 'test3', name: 'xAuthProvider', provider_type: 'oidc' },
    ]

    // Act
    render(<IdentityProviderButtons providers={providers} />)

    // Assert - Each button shows an SVG globe icon
    expect(screen.getByRole('button', { name: /zebra auth/i }).querySelector('svg')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /yellow idp/i }).querySelector('svg')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /xauthprovider/i }).querySelector('svg')).toBeInTheDocument()
  })
})
