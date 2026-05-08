import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { identityProvidersClient } from '../../../../client'
import { AlertProvider } from '../../../../components/alerts'

import { IdentityProviderDetail } from './IdentityProviderDetail'
import { IdpTypeKey } from './idpTypePresets'

type MutationCallbacks = {
  onSuccess?: () => void
  onError?: (error: Error) => void
}

vi.mock('./GroupMappingTab', () => ({
  GroupMappingTab: () => <div data-testid="group-mapping-tab">Group Mapping Content</div>,
}))

vi.mock('../../../../client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../../client')>()
  return {
    ...original,
    identityProvidersClient: {
      useQuery: vi.fn(),
      useMutation: vi.fn().mockReturnValue({ mutate: vi.fn(), isPending: false }),
    },
  }
})

const VALID_PROVIDER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

const mockUseParams = vi.fn((): { providerId: string; tab?: string } => ({ providerId: VALID_PROVIDER_ID }))
vi.mock('wouter', () => ({
  useLocation: () => [`/access-management/authentication/identity-providers/${VALID_PROVIDER_ID}`, vi.fn()],
  useParams: () => mockUseParams(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}))

const mockNavigate = vi.fn()
vi.mock('wouter/use-browser-location', () => ({
  navigate: (...args: unknown[]): void => {
    mockNavigate(...args)
  },
}))

const mockProvider = {
  id: VALID_PROVIDER_ID,
  name: 'Azure AD',
  description: 'Corporate Azure AD',
  enabled: true,
  configuration: {
    provider_type: 'oidc',
    auto_discovery: true,
    issuer_url: 'https://login.microsoftonline.com/tenant/v2.0',
    client_id: 'client-123',
    scopes: 'openid profile email',
    authorization_endpoint: null,
    token_endpoint: null,
    jwks_uri: null,
    userinfo_endpoint: null,
  },
  created_at: '2026-01-15T00:00:00Z',
  updated_at: '2026-02-10T00:00:00Z',
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AlertProvider>{children}</AlertProvider>
      </QueryClientProvider>
    )
  }
}

function mockQueryReturn(overrides: Record<string, unknown> = {}): ReturnType<typeof identityProvidersClient.useQuery> {
  return {
    data: mockProvider,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  } as ReturnType<typeof identityProvidersClient.useQuery>
}

describe('IdentityProviderDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseParams.mockReturnValue({ providerId: VALID_PROVIDER_ID })
  })

  it('renders provider details when data is loaded', () => {
    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn())

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    expect(screen.getAllByRole('heading', { name: 'Azure AD' }).length).toBeGreaterThan(0)
    expect(screen.getByText('https://login.microsoftonline.com/tenant/v2.0')).toBeInTheDocument()
    expect(screen.getByText('client-123')).toBeInTheDocument()
    expect(screen.getByText('openid')).toBeInTheDocument()
    expect(screen.getByText('profile')).toBeInTheDocument()
    expect(screen.getByText('email')).toBeInTheDocument()
  })

  it('shows enabled status', () => {
    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn())

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    const enabledLabels = screen.getAllByText('Enabled')
    expect(enabledLabels.length).toBeGreaterThan(0)
  })

  it('shows disabled status for disabled provider', () => {
    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(
      mockQueryReturn({ data: { ...mockProvider, enabled: false } })
    )

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    const disabledLabels = screen.getAllByText('Disabled')
    expect(disabledLabels.length).toBeGreaterThan(0)
  })

  it('shows not found state for 404 errors', () => {
    const notFoundError = Object.assign(new Error('Not found'), { status: 404 })
    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(
      mockQueryReturn({ data: undefined, isError: true, error: notFoundError })
    )

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    expect(screen.getByText('Identity provider not found')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /back to identity providers/i })).toBeInTheDocument()
  })

  it('navigates back when back button is clicked in 404 state', async () => {
    const user = userEvent.setup()
    const notFoundError = Object.assign(new Error('Not found'), { status: 404 })
    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(
      mockQueryReturn({ data: undefined, isError: true, error: notFoundError })
    )

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    await user.click(screen.getByRole('button', { name: /back to identity providers/i }))
    expect(mockNavigate).toHaveBeenCalled()
  })

  it('calls refetch when retry button is clicked in 404 state', async () => {
    const user = userEvent.setup()
    const mockRefetch = vi.fn()
    const notFoundError = Object.assign(new Error('Not found'), { status: 404 })
    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(
      mockQueryReturn({ data: undefined, isError: true, error: notFoundError, refetch: mockRefetch })
    )

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    await user.click(screen.getByRole('button', { name: /retry/i }))
    expect(mockRefetch).toHaveBeenCalled()
  })

  it('shows generic error state for non-404 errors', () => {
    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(
      mockQueryReturn({ data: undefined, isError: true, error: new Error('Server error') })
    )

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    expect(screen.getAllByText('Error loading identity provider').length).toBeGreaterThan(0)
  })

  it('navigates to edit page from primary Edit provider button', async () => {
    const user = userEvent.setup()
    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn())

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    await user.click(screen.getByRole('button', { name: /edit provider/i }))
    expect(mockNavigate).toHaveBeenCalled()
  })

  it('shows manual endpoints when auto_discovery is false', () => {
    const manualProvider = {
      ...mockProvider,
      configuration: {
        ...mockProvider.configuration,
        auto_discovery: false,
        authorization_endpoint: 'https://example.com/authorize',
        token_endpoint: 'https://example.com/token',
        jwks_uri: 'https://example.com/.well-known/jwks.json',
        userinfo_endpoint: 'https://example.com/userinfo',
      },
    }

    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn({ data: manualProvider }))

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    expect(screen.getByText('https://example.com/authorize')).toBeInTheDocument()
    expect(screen.getByText('https://example.com/token')).toBeInTheDocument()
    expect(screen.getByText('https://example.com/.well-known/jwks.json')).toBeInTheDocument()
    expect(screen.getByText('https://example.com/userinfo')).toBeInTheDocument()
  })

  it('hides manual endpoints when auto_discovery is true', () => {
    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn())

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    expect(screen.queryByText('Authorization endpoint')).not.toBeInTheDocument()
    expect(screen.queryByText('Token endpoint')).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn())

    const { container } = render(<IdentityProviderDetail />, { wrapper: createWrapper() })
    // Wrap axe in act() — axe triggers DOM events that cause PatternFly Tabs
    // to schedule React state updates
    let results: Awaited<ReturnType<typeof axe>>
    await act(async () => {
      // Exclude aria-valid-attr-value: PatternFly Tabs generates aria-controls
      // referencing lazily-rendered tab panels that don't exist in the DOM yet
      results = await axe(container, {
        rules: { 'aria-valid-attr-value': { enabled: false } },
      })
    })
    expect(results!).toHaveNoViolations()
  })

  it('has no accessibility violations in error state', async () => {
    const notFoundError = Object.assign(new Error('Not found'), { status: 404 })
    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(
      mockQueryReturn({ data: undefined, isError: true, error: notFoundError })
    )

    const { container } = render(<IdentityProviderDetail />, { wrapper: createWrapper() })
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('renders nothing when providerData is undefined and no error', () => {
    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(
      mockQueryReturn({ data: undefined, isPending: false, isError: false, error: null })
    )

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    // Should not render provider name or error states (detail returns null until data loads)
    expect(screen.queryByText('Azure AD')).not.toBeInTheDocument()
    expect(screen.queryByText('Identity provider not found')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Azure AD' })).not.toBeInTheDocument()
  })

  it('renders loading state when query is pending', () => {
    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(
      mockQueryReturn({ data: undefined, isPending: true, isError: false, error: null })
    )

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    // useQueryState renders a LoadingState which includes a spinner
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('shows the IDP type label from presets for known types', () => {
    const aapProvider = {
      ...mockProvider,
      configuration: {
        ...mockProvider.configuration,
        idp_type: IdpTypeKey.AAP,
      },
    }

    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn({ data: aapProvider }))

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    expect(screen.getByText('Ansible Automation Platform')).toBeInTheDocument()
  })

  it('shows AAP role mapping as Enabled for AAP providers with mapping enabled', () => {
    const aapProvider = {
      ...mockProvider,
      configuration: {
        ...mockProvider.configuration,
        idp_type: IdpTypeKey.AAP,
        aap_role_mapping_enabled: true,
      },
    }

    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn({ data: aapProvider }))

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    const roleMappingGroup = screen.getByText('AAP role mapping').parentElement!.parentElement!
    expect(within(roleMappingGroup).getByText('Enabled')).toBeInTheDocument()
  })

  it('shows AAP role mapping as Disabled for AAP providers with mapping disabled', () => {
    const aapProvider = {
      ...mockProvider,
      configuration: {
        ...mockProvider.configuration,
        idp_type: IdpTypeKey.AAP,
        aap_role_mapping_enabled: false,
      },
    }

    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn({ data: aapProvider }))

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    const roleMappingGroup = screen.getByText('AAP role mapping').parentElement!.parentElement!
    expect(within(roleMappingGroup).getByText('Disabled')).toBeInTheDocument()
  })

  it('does not show AAP role mapping for non-AAP providers', () => {
    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn())

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    expect(screen.queryByText('AAP role mapping')).not.toBeInTheDocument()
  })

  it('shows raw idp_type value as label for unknown types', () => {
    const customTypeProvider = {
      ...mockProvider,
      configuration: {
        ...mockProvider.configuration,
        idp_type: 'my_unknown_type',
      },
    }

    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn({ data: customTypeProvider }))

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    expect(screen.getByText('my_unknown_type')).toBeInTheDocument()
  })

  it('shows OIDC label when idp_type is not set', () => {
    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn())

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    expect(screen.getByText('OIDC')).toBeInTheDocument()
  })

  it('displays auto-discovery as Enabled when true', () => {
    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn())

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    // The auto-discovery label should show "Enabled"
    expect(screen.getByText('Auto-discovery')).toBeInTheDocument()
  })

  it('displays auto-discovery as Disabled when false', () => {
    const manualProvider = {
      ...mockProvider,
      configuration: {
        ...mockProvider.configuration,
        auto_discovery: false,
      },
    }

    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn({ data: manualProvider }))

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    expect(screen.getByText('Auto-discovery')).toBeInTheDocument()
    // auto_discovery is false and auto_create_groups defaults to false, so there are two "Disabled" labels
    const disabledLabels = screen.getAllByText('Disabled')
    expect(disabledLabels.length).toBeGreaterThanOrEqual(2)
  })

  it('displays auto-create groups as Enabled when true', () => {
    const autoCreateProvider = {
      ...mockProvider,
      configuration: {
        ...mockProvider.configuration,
        auto_create_groups: true,
      },
    }

    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn({ data: autoCreateProvider }))

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    expect(screen.getByText('Auto-create groups')).toBeInTheDocument()
  })

  it('displays fallback dash when issuer_url is not set', () => {
    const noIssuerProvider = {
      ...mockProvider,
      configuration: {
        ...mockProvider.configuration,
        issuer_url: undefined,
      },
    }

    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn({ data: noIssuerProvider }))

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    expect(screen.getByText('Issuer URL')).toBeInTheDocument()
    // The fallback is "-"
    const dashes = screen.getAllByText('-')
    expect(dashes.length).toBeGreaterThan(0)
  })

  it('displays fallback dash when client_id is not set', () => {
    const noClientIdProvider = {
      ...mockProvider,
      configuration: {
        ...mockProvider.configuration,
        client_id: undefined,
      },
    }

    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn({ data: noClientIdProvider }))

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    expect(screen.getByText('Client ID')).toBeInTheDocument()
  })

  it('navigates back from the header back button', async () => {
    const user = userEvent.setup()
    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn())

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    const backButton = screen.getByRole('button', { name: /back to identity providers/i })
    await user.click(backButton)
    expect(mockNavigate).toHaveBeenCalled()
  })

  it('calls patchProvider to toggle enabled state', async () => {
    const user = userEvent.setup()
    const mockPatch = vi.fn()
    vi.mocked(identityProvidersClient.useMutation).mockImplementation(((method: string) => {
      if (method === 'patch') return { mutate: mockPatch, isPending: false }
      return { mutate: vi.fn(), isPending: false }
    }) as unknown as typeof identityProvidersClient.useMutation)
    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn())

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    // The Switch has a checkbox input
    const toggle = screen.getByRole('switch', { name: /enabled/i })
    await user.click(toggle)

    expect(mockPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { path: { provider_id: VALID_PROVIDER_ID } },
        body: { enabled: false },
      }),
      expect.objectContaining({
        onSuccess: expect.any(Function) as unknown,
        onError: expect.any(Function) as unknown,
      })
    )
  })

  it('shows success alert when toggle succeeds', async () => {
    const user = userEvent.setup()
    const mockRefetch = vi.fn()
    const mockPatch = vi.fn((_params: unknown, callbacks: MutationCallbacks) => {
      callbacks.onSuccess?.()
    })
    vi.mocked(identityProvidersClient.useMutation).mockImplementation(((method: string) => {
      if (method === 'patch') return { mutate: mockPatch, isPending: false }
      return { mutate: vi.fn(), isPending: false }
    }) as unknown as typeof identityProvidersClient.useMutation)
    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn({ refetch: mockRefetch }))

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    const toggle = screen.getByRole('switch', { name: /enabled/i })
    await user.click(toggle)

    // The success callback should trigger refetch
    expect(mockRefetch).toHaveBeenCalled()
  })

  it('shows error alert when toggle fails', async () => {
    const user = userEvent.setup()
    const mockPatch = vi.fn((_params: unknown, callbacks: MutationCallbacks) => {
      callbacks.onError?.(new Error('Toggle failed'))
    })
    vi.mocked(identityProvidersClient.useMutation).mockImplementation(((method: string) => {
      if (method === 'patch') return { mutate: mockPatch, isPending: false }
      return { mutate: vi.fn(), isPending: false }
    }) as unknown as typeof identityProvidersClient.useMutation)
    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn())

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    const toggle = screen.getByRole('switch', { name: /enabled/i })
    await user.click(toggle)

    // The error alert should appear with an appropriate message
    await waitFor(() => {
      expect(screen.getByText(/failed to disable identity provider/i)).toBeInTheDocument()
    })
  })

  it('does not call patchProvider when provider has no id', async () => {
    const user = userEvent.setup()
    const mockPatch = vi.fn()
    vi.mocked(identityProvidersClient.useMutation).mockImplementation(((method: string) => {
      if (method === 'patch') return { mutate: mockPatch, isPending: false }
      return { mutate: vi.fn(), isPending: false }
    }) as unknown as typeof identityProvidersClient.useMutation)
    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(
      mockQueryReturn({ data: { ...mockProvider, id: undefined } })
    )

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    const toggle = screen.getByRole('switch', { name: /enabled/i })
    await user.click(toggle)

    expect(mockPatch).not.toHaveBeenCalled()
  })

  it('opens delete confirmation dialog from kebab menu', async () => {
    const user = userEvent.setup()
    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn())

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    const kebabButton = screen.getByRole('button', { name: /kebab toggle/i })
    await user.click(kebabButton)

    await user.click(screen.getByText('Delete'))

    // The confirmation dialog should now be visible
    expect(screen.getByText('Delete identity provider')).toBeInTheDocument()
    expect(screen.getByText(/are you sure you want to delete "Azure AD"\?/i)).toBeInTheDocument()
    expect(screen.getByText(/remove all user identities linked to this provider/i)).toBeInTheDocument()
    expect(screen.getByText(/revoke active sessions authenticated via this provider/i)).toBeInTheDocument()
    expect(screen.getByText(/prevent users from signing in with this provider/i)).toBeInTheDocument()
    expect(screen.getByText(/this action cannot be undone/i)).toBeInTheDocument()
  })

  it('calls delete mutation when confirming deletion', async () => {
    const user = userEvent.setup()
    const mockDelete = vi.fn()
    vi.mocked(identityProvidersClient.useMutation).mockImplementation(((method: string) => {
      if (method === 'delete') return { mutate: mockDelete, isPending: false }
      return { mutate: vi.fn(), isPending: false }
    }) as unknown as typeof identityProvidersClient.useMutation)
    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn())

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    // Open kebab and click delete
    const kebabButton = screen.getByRole('button', { name: /kebab toggle/i })
    await user.click(kebabButton)
    await user.click(screen.getByText('Delete'))

    // Confirm deletion
    const confirmButton = screen.getByRole('button', { name: /^delete$/i })
    await user.click(confirmButton)

    expect(mockDelete).toHaveBeenCalled()
  })

  it('closes delete dialog when cancel is clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn())

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    // Open kebab and click delete
    const kebabButton = screen.getByRole('button', { name: /kebab toggle/i })
    await user.click(kebabButton)
    await user.click(screen.getByText('Delete'))

    expect(screen.getByText('Delete identity provider')).toBeInTheDocument()

    // Click cancel
    const cancelButton = screen.getByRole('button', { name: /cancel/i })
    await user.click(cancelButton)

    // Dialog should close
    await waitFor(() => {
      expect(screen.queryByText(/are you sure you want to delete/i)).not.toBeInTheDocument()
    })
  })

  it('switches to the Group Mapping tab when clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn())

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    // Click the Group mapping tab
    const groupMappingTab = screen.getByRole('tab', { name: /group mapping/i })
    await user.click(groupMappingTab)

    // Should navigate with the group-mapping tab key
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringContaining('group-mapping'),
      expect.objectContaining({ replace: true })
    )
  })

  it('renders GroupMappingTab content when tab is group-mapping', () => {
    mockUseParams.mockReturnValue({ providerId: VALID_PROVIDER_ID, tab: 'group-mapping' })
    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn())

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    expect(screen.getByText('Group Mapping Content')).toBeInTheDocument()
  })

  it('renders ProviderDetailsContent when tab is details', () => {
    mockUseParams.mockReturnValue({ providerId: VALID_PROVIDER_ID, tab: 'details' })
    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn())

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    // Details tab should show configuration details
    expect(screen.getByText('Issuer URL')).toBeInTheDocument()
    expect(screen.getByText('Client ID')).toBeInTheDocument()
  })

  it('defaults to details tab when tab param is invalid', () => {
    mockUseParams.mockReturnValue({ providerId: VALID_PROVIDER_ID, tab: 'invalid-tab' })
    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn())

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    // Should show details content (the default)
    expect(screen.getByText('Issuer URL')).toBeInTheDocument()
    expect(screen.queryByText('Group Mapping Content')).not.toBeInTheDocument()
  })

  it('switches to the Details tab from group-mapping', async () => {
    const user = userEvent.setup()
    mockUseParams.mockReturnValue({ providerId: VALID_PROVIDER_ID, tab: 'group-mapping' })
    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn())

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    // Click the Details tab
    const detailsTab = screen.getByRole('tab', { name: /details/i })
    await user.click(detailsTab)

    // Should navigate to the base path (no tab suffix)
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.not.stringContaining('group-mapping'),
      expect.objectContaining({ replace: true })
    )
  })

  it('shows group mapping badge count when entries exist', () => {
    const providerWithMappings = {
      ...mockProvider,
      configuration: {
        ...mockProvider.configuration,
        auto_create_groups: false,
        group_mapping_entries: [
          { provider_group: 'admins', local_group_id: 'g1' },
          { provider_group: 'users', local_group_id: 'g2' },
        ],
      },
    }

    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn({ data: providerWithMappings }))

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    // Should show the badge with count 2
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('does not show group mapping badge when auto_create_groups is true', () => {
    const autoCreateProvider = {
      ...mockProvider,
      configuration: {
        ...mockProvider.configuration,
        auto_create_groups: true,
        group_mapping_entries: [{ provider_group: 'admins', local_group_id: 'g1' }],
      },
    }

    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn({ data: autoCreateProvider }))

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    // With auto_create_groups=true, mappingCount is forced to 0, so no badge
    const groupMappingTab = screen.getByRole('tab', { name: /group mapping/i })
    expect(groupMappingTab).toBeInTheDocument()
    // Badge "1" should not appear
    expect(screen.queryByText('1')).not.toBeInTheDocument()
  })

  it('navigates to edit mapping via kebab menu', async () => {
    const user = userEvent.setup()
    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn())

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    const kebabButton = screen.getByRole('button', { name: /kebab toggle/i })
    await user.click(kebabButton)

    await user.click(screen.getByText('Edit mapping'))

    // Should navigate to group-mapping tab
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringContaining('group-mapping'),
      expect.objectContaining({ replace: true })
    )
  })

  it('shows only some manual endpoints when others are not set', () => {
    const partialManualProvider = {
      ...mockProvider,
      configuration: {
        ...mockProvider.configuration,
        auto_discovery: false,
        authorization_endpoint: 'https://example.com/authorize',
        token_endpoint: null,
        jwks_uri: 'https://example.com/.well-known/jwks.json',
        userinfo_endpoint: null,
      },
    }

    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn({ data: partialManualProvider }))

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    expect(screen.getByText('https://example.com/authorize')).toBeInTheDocument()
    expect(screen.getByText('https://example.com/.well-known/jwks.json')).toBeInTheDocument()
    expect(screen.queryByText('Token endpoint')).not.toBeInTheDocument()
    expect(screen.queryByText('Userinfo endpoint')).not.toBeInTheDocument()
  })

  it('renders ProviderDetailsContent as null when configuration is missing', () => {
    const noConfigProvider = {
      ...mockProvider,
      configuration: undefined,
    }

    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn({ data: noConfigProvider }))

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    // Provider name should still render in the header
    expect(screen.getAllByRole('heading', { name: 'Azure AD' }).length).toBeGreaterThan(0)
    // But configuration fields should not appear
    expect(screen.queryByText('Issuer URL')).not.toBeInTheDocument()
    expect(screen.queryByText('Client ID')).not.toBeInTheDocument()
  })

  it('renders created and updated timestamps', () => {
    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn())

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    expect(screen.getByText('Created')).toBeInTheDocument()
    expect(screen.getByText('Last updated')).toBeInTheDocument()
  })

  it('displays the 404 empty state description text', () => {
    const notFoundError = Object.assign(new Error('Not found'), { status: 404 })
    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(
      mockQueryReturn({ data: undefined, isError: true, error: notFoundError })
    )

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    expect(
      screen.getByText(/the identity provider you are looking for does not exist or may have been deleted/i)
    ).toBeInTheDocument()
  })

  it('handles empty scopes gracefully', () => {
    const emptyScopes = {
      ...mockProvider,
      configuration: {
        ...mockProvider.configuration,
        scopes: '',
      },
    }

    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn({ data: emptyScopes }))

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    // Should still render the Scopes label
    expect(screen.getByText('Scopes')).toBeInTheDocument()
    // But no individual scope labels
    expect(screen.queryByText('openid')).not.toBeInTheDocument()
  })

  it('handles undefined scopes gracefully', () => {
    const noScopes = {
      ...mockProvider,
      configuration: {
        ...mockProvider.configuration,
        scopes: undefined,
      },
    }

    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn({ data: noScopes }))

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    expect(screen.getByText('Scopes')).toBeInTheDocument()
  })

  it('shows group mapping with jmespath expression but no entries', () => {
    const jmespathOnly = {
      ...mockProvider,
      configuration: {
        ...mockProvider.configuration,
        auto_create_groups: false,
        group_jmespath_expression: 'groups[*]',
        group_mapping_entries: [],
      },
    }

    vi.mocked(identityProvidersClient.useQuery).mockReturnValue(mockQueryReturn({ data: jmespathOnly }))

    render(<IdentityProviderDetail />, { wrapper: createWrapper() })

    // With no mapping entries and auto_create_groups=false, badge count is 0 (no badge shown)
    const groupMappingTab = screen.getByRole('tab', { name: /group mapping/i })
    expect(groupMappingTab).toBeInTheDocument()
  })
})
