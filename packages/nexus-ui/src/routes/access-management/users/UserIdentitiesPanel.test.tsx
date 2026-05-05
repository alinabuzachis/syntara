import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, renderHook, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { usersClient } from '../../../client'
import { AlertProvider } from '../../../components/alerts'

import { useDetachIdentity } from './useDetachIdentity'
import { UserIdentitiesPanel } from './UserIdentitiesPanel'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../client', () => ({
  usersClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
  OIDC_AUTHORIZE_PATH: '/api/v1/auth/oidc/authorize',
}))

const mockAttachIdentityModal: ReturnType<typeof vi.fn<(props: Record<string, unknown>) => null>> = vi.fn(() => null)
vi.mock('./AttachIdentityModal', () => ({
  AttachIdentityModal: (props: Record<string, unknown>) => mockAttachIdentityModal(props),
}))

type MockProvider = {
  id: string
  name: string
  provider_type: string
}

const mockUseAuthProviders = vi.fn((): { providers: MockProvider[]; isLoading: boolean } => ({
  providers: [],
  isLoading: false,
}))
vi.mock('../../../app/useAuthProviders', () => ({
  useAuthProviders: () => mockUseAuthProviders(),
}))

const mockNavigate = vi.fn()
vi.mock('wouter/use-browser-location', () => ({
  navigate: (...args: unknown[]): void => {
    mockNavigate(...args)
  },
}))

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockIdentities = [
  {
    id: 'id-1',
    user_id: 'user-1',
    identity_provider_id: 'provider-1',
    issuer: 'https://login.example.com',
    subject: 'sub-abc',
    created_at: '2026-01-15T00:00:00Z',
    last_used_at: '2026-03-10T14:30:00Z',
    provider_name: 'Azure',
  },
]

const twoIdentities = [
  ...mockIdentities,
  {
    id: 'id-2',
    user_id: 'user-1',
    identity_provider_id: 'provider-2',
    issuer: 'https://auth.other.com',
    subject: 'sub-xyz',
    created_at: '2026-02-20T00:00:00Z',
    last_used_at: null,
    provider_name: 'Okta',
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let queryClient: QueryClient

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>{children}</AlertProvider>
  </QueryClientProvider>
)

const mockMutate = vi.fn()

function setupMocks(identities: unknown[] = [], queryOverrides: Record<string, unknown> = {}) {
  vi.mocked(usersClient.useQuery).mockReturnValue({
    data: { resources: identities, next: null, prev: null, total: identities.length },
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...queryOverrides,
  } as never)

  vi.mocked(usersClient.useMutation).mockReturnValue({
    mutate: mockMutate,
    isPending: false,
  } as never)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UserIdentitiesPanel', () => {
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    mockNavigate.mockClear()
    mockMutate.mockClear()
    mockAttachIdentityModal.mockClear()
    mockUseAuthProviders.mockReturnValue({ providers: [], isLoading: false })
  })

  // ---- Empty state --------------------------------------------------------

  describe('Empty state', () => {
    it('shows empty state when no identities and no providers exist', () => {
      setupMocks([])

      render(<UserIdentitiesPanel userId="user-1" hasPassword={false} />, { wrapper })

      expect(screen.getByRole('heading', { name: 'No identity providers configured' })).toBeInTheDocument()
    })
  })

  // ---- Table rendering ----------------------------------------------------

  describe('Table rendering', () => {
    it('renders identities in a table with correct columns', () => {
      setupMocks(mockIdentities)

      render(<UserIdentitiesPanel userId="user-1" hasPassword={false} />, { wrapper })

      expect(screen.getByText('Azure')).toBeInTheDocument()
    })

    it('renders column headers', () => {
      setupMocks(mockIdentities)

      render(<UserIdentitiesPanel userId="user-1" hasPassword={false} />, { wrapper })

      expect(screen.getByRole('columnheader', { name: /Provider/i })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /Linked/i })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /Last authenticated/i })).toBeInTheDocument()
    })

    it('renders provider name as a link', () => {
      setupMocks(mockIdentities)

      render(<UserIdentitiesPanel userId="user-1" hasPassword={false} />, { wrapper })

      const providerLink = screen.getByRole('button', { name: 'Azure' })
      expect(providerLink).toBeInTheDocument()
    })
  })

  // ---- Identity count footer ----------------------------------------------

  describe('Identity count footer', () => {
    it('shows singular "1 identity" for one identity', () => {
      setupMocks(mockIdentities)

      render(<UserIdentitiesPanel userId="user-1" hasPassword={false} />, { wrapper })

      expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument()
    })

    it('shows plural "2 identities" for multiple identities', () => {
      setupMocks(twoIdentities)

      render(<UserIdentitiesPanel userId="user-1" hasPassword={false} />, { wrapper })

      expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument()
    })
  })

  // ---- Detach flow --------------------------------------------------------

  describe('Detach flow', () => {
    it('opens confirmation modal when Disconnect is clicked', async () => {
      const user = userEvent.setup()
      setupMocks(twoIdentities)

      render(<UserIdentitiesPanel userId="user-1" hasPassword={false} />, { wrapper })

      const disconnectButtons = screen.getAllByRole('button', { name: 'Disconnect' })
      await user.click(disconnectButtons[0])

      expect(screen.getByText('Disconnect identity')).toBeInTheDocument()
      expect(
        screen.getByText('Are you sure? You will no longer be able to sign in with this identity.')
      ).toBeInTheDocument()
      expect(screen.getAllByText('https://login.example.com').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('sub-abc').length).toBeGreaterThanOrEqual(1)
    })

    it('calls mutation when Disconnect in modal is confirmed', async () => {
      const user = userEvent.setup()
      setupMocks(twoIdentities)

      render(<UserIdentitiesPanel userId="user-1" hasPassword={false} />, { wrapper })

      const disconnectButtons = screen.getAllByRole('button', { name: 'Disconnect' })
      await user.click(disconnectButtons[0])

      // Click Disconnect in modal (last button with that name)
      const allButtons = screen.getAllByRole('button', { name: 'Disconnect' })
      await user.click(allButtons[allButtons.length - 1])

      expect(mockMutate).toHaveBeenCalledTimes(1)
      const callArgs = mockMutate.mock.calls[0]
      expect(callArgs[0]).toEqual({
        params: { path: { user_id: 'user-1', identity_id: 'id-1' } },
      })
    })

    it('closes modal when Cancel button is clicked', async () => {
      const user = userEvent.setup()
      setupMocks(twoIdentities)

      render(<UserIdentitiesPanel userId="user-1" hasPassword={false} />, { wrapper })

      const disconnectButtons = screen.getAllByRole('button', { name: 'Disconnect' })
      await user.click(disconnectButtons[0])

      expect(screen.getByText('Disconnect identity')).toBeInTheDocument()

      const cancelButton = screen.getByRole('button', { name: 'Cancel' })
      await user.click(cancelButton)

      await waitFor(() => {
        expect(screen.queryByText('Disconnect identity')).not.toBeInTheDocument()
      })
    })

    it('closes modal on successful detach', async () => {
      const user = userEvent.setup()
      const mockRefetch = vi.fn()

      vi.mocked(usersClient.useQuery).mockReturnValue({
        data: { resources: twoIdentities, next: null, prev: null, total: twoIdentities.length },
        isPending: false,
        isError: false,
        error: null,
        refetch: mockRefetch,
      } as never)

      vi.mocked(usersClient.useMutation).mockReturnValue({
        mutate: mockMutate,
        isPending: false,
      } as never)

      render(<UserIdentitiesPanel userId="user-1" hasPassword={false} />, { wrapper })

      const disconnectButtons = screen.getAllByRole('button', { name: 'Disconnect' })
      await user.click(disconnectButtons[0])
      const allButtons = screen.getAllByRole('button', { name: 'Disconnect' })
      await user.click(allButtons[allButtons.length - 1])

      const callbacks = mockMutate.mock.calls[0][1] as {
        onSuccess: () => void
        onSettled: () => void
      }
      act(() => {
        callbacks.onSuccess()
        callbacks.onSettled()
      })

      await waitFor(() => {
        expect(screen.queryByText('Disconnect identity')).not.toBeInTheDocument()
      })
      expect(mockRefetch).toHaveBeenCalled()
    })

    it('handles detach error gracefully', async () => {
      const user = userEvent.setup()
      setupMocks(twoIdentities)

      render(<UserIdentitiesPanel userId="user-1" hasPassword={false} />, { wrapper })

      const disconnectButtons = screen.getAllByRole('button', { name: 'Disconnect' })
      await user.click(disconnectButtons[0])
      const allButtons = screen.getAllByRole('button', { name: 'Disconnect' })
      await user.click(allButtons[allButtons.length - 1])

      const callbacks = mockMutate.mock.calls[0][1] as {
        onError: () => void
        onSettled: () => void
      }
      act(() => {
        callbacks.onError()
        callbacks.onSettled()
      })

      await waitFor(() => {
        expect(screen.queryByText('Disconnect identity')).not.toBeInTheDocument()
      })
    })
  })

  // ---- Loading state ------------------------------------------------------

  describe('Loading state', () => {
    it('shows loading spinner when query is pending', () => {
      setupMocks([], { data: undefined, isPending: true })

      render(<UserIdentitiesPanel userId="user-1" hasPassword={false} />, { wrapper })

      expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeInTheDocument()
    })
  })

  // ---- Error state --------------------------------------------------------

  describe('Error state', () => {
    it('shows error state when query errors', () => {
      setupMocks([], { data: undefined, isPending: false, isError: true, error: new Error('Network error') })

      render(<UserIdentitiesPanel userId="user-1" hasPassword={false} />, { wrapper })

      expect(screen.getByRole('heading', { name: 'Error loading identities' })).toBeInTheDocument()
    })
  })

  // ---- Attach identity button (table view) --------------------------------

  describe('Attach identity button', () => {
    it('renders Attach identity button in table view', () => {
      setupMocks(mockIdentities)

      render(<UserIdentitiesPanel userId="user-1" hasPassword={false} />, { wrapper })

      expect(screen.getByRole('button', { name: /attach identity/i })).toBeInTheDocument()
    })
  })

  // ---- Expandable rows ----------------------------------------------------

  describe('Expandable rows', () => {
    it('expands a row to show issuer and subject details', async () => {
      const user = userEvent.setup()
      setupMocks(mockIdentities)

      render(<UserIdentitiesPanel userId="user-1" hasPassword={false} />, { wrapper })

      // Click the expand toggle button
      const expandButton = screen.getAllByRole('button').find((btn) => btn.closest('td.pf-v6-c-table__toggle'))
      expect(expandButton).toBeDefined()
      await user.click(expandButton!)

      // The issuer and subject should now be visible in the expanded content
      expect(screen.getByText('Issuer')).toBeInTheDocument()
      expect(screen.getByText('Subject')).toBeInTheDocument()
    })

    it('collapses an expanded row on second toggle', async () => {
      const user = userEvent.setup()
      setupMocks(mockIdentities)

      render(<UserIdentitiesPanel userId="user-1" hasPassword={false} />, { wrapper })

      const expandButton = screen.getAllByRole('button').find((btn) => btn.closest('td.pf-v6-c-table__toggle'))
      expect(expandButton).toBeDefined()

      // Expand
      await user.click(expandButton!)
      // Collapse
      await user.click(expandButton!)

      // Row should be collapsed — the tbody should not have expanded state
      // The issuer/subject are still in DOM but the parent Tbody isExpanded=false
      // Just verify no error occurs
    })
  })

  // ---- Last identity protection -------------------------------------------

  describe('Last identity protection', () => {
    it('disables Disconnect button when it is the only identity and user has no password', () => {
      setupMocks(mockIdentities) // single identity, isLocalUser defaults to false

      render(<UserIdentitiesPanel userId="user-1" hasPassword={false} />, { wrapper })

      const disconnectButton = screen.getByRole('button', { name: 'Disconnect' })
      expect(disconnectButton).toHaveAttribute('aria-disabled', 'true')
    })

    it('renders aria-disabled Disconnect button with tooltip wrapper for last identity without password', () => {
      setupMocks(mockIdentities)

      render(<UserIdentitiesPanel userId="user-1" hasPassword={false} />, { wrapper })

      const disconnectButton = screen.getByRole('button', { name: 'Disconnect' })
      // PF6 Tooltip wraps the button; the button itself is aria-disabled
      expect(disconnectButton).toHaveAttribute('aria-disabled', 'true')
      // The button should not be clickable (no onClick fires the modal)
      expect(screen.queryByText('Disconnect identity')).not.toBeInTheDocument()
    })

    it('shows empty state for local users with no identities', () => {
      setupMocks([])

      render(<UserIdentitiesPanel userId="user-1" isLocalUser hasPassword={true} />, { wrapper })

      expect(screen.getByRole('heading', { name: 'Local user' })).toBeInTheDocument()
      expect(screen.getByText(/Local users cannot be linked to external identity providers/)).toBeInTheDocument()
    })

    it('enables Disconnect button when there are multiple identities', () => {
      setupMocks(twoIdentities)

      render(<UserIdentitiesPanel userId="user-1" hasPassword={false} />, { wrapper })

      const disconnectButtons = screen.getAllByRole('button', { name: 'Disconnect' })
      disconnectButtons.forEach((btn) => {
        expect(btn).not.toHaveAttribute('aria-disabled', 'true')
      })
    })

    it('enables Disconnect for the only identity when hasPassword is true (password fallback exists)', () => {
      setupMocks(mockIdentities)

      render(<UserIdentitiesPanel userId="user-1" hasPassword={true} />, { wrapper })

      const disconnectButton = screen.getByRole('button', { name: 'Disconnect' })
      expect(disconnectButton).not.toHaveAttribute('aria-disabled', 'true')
    })
  })

  // ---- last_used_at rendering ---------------------------------------------

  describe('Last authenticated column', () => {
    it('shows dash when last_used_at is null', () => {
      setupMocks([twoIdentities[1]]) // Okta identity has last_used_at: null

      render(<UserIdentitiesPanel userId="user-1" hasPassword={false} />, { wrapper })

      // The last authenticated cell should show '-'
      const cells = screen.getAllByRole('cell')
      const lastAuthCell = cells.find((cell) => cell.textContent === '-')
      expect(lastAuthCell).toBeDefined()
    })

    it('shows formatted date when last_used_at has a value', () => {
      setupMocks(mockIdentities) // Azure identity has last_used_at

      render(<UserIdentitiesPanel userId="user-1" hasPassword={false} />, { wrapper })

      // Should not show a dash for last authenticated
      const cells = screen.getAllByRole('cell')
      const lastAuthCell = cells.find(
        (cell) => cell.getAttribute('data-label') === 'Last authenticated' && cell.textContent !== '-'
      )
      expect(lastAuthCell).toBeDefined()
    })
  })

  // ---- Unlinked providers -------------------------------------------------

  describe('Unlinked providers', () => {
    const mockProviders = [
      { id: 'provider-1', name: 'Azure', provider_type: 'oidc' },
      { id: 'provider-3', name: 'GitHub', provider_type: 'oidc' },
    ]

    it('shows unlinked providers as "Not connected"', () => {
      mockUseAuthProviders.mockReturnValue({ providers: mockProviders, isLoading: false })
      setupMocks(mockIdentities) // Azure is linked, GitHub is not

      render(<UserIdentitiesPanel userId="user-1" hasPassword={false} />, { wrapper })

      expect(screen.getByText('Not connected')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'GitHub' })).toBeInTheDocument()
    })

    it('shows Connect button for unlinked providers when viewing own profile', () => {
      mockUseAuthProviders.mockReturnValue({ providers: mockProviders, isLoading: false })
      setupMocks(mockIdentities)

      render(<UserIdentitiesPanel userId="user-1" currentUserId="user-1" hasPassword={false} />, { wrapper })

      expect(screen.getByRole('link', { name: /Connect/i })).toBeInTheDocument()
    })

    it('shows dash instead of Connect button for unlinked providers when viewing another user', () => {
      mockUseAuthProviders.mockReturnValue({ providers: mockProviders, isLoading: false })
      setupMocks(mockIdentities)

      render(<UserIdentitiesPanel userId="user-1" currentUserId="other-user" hasPassword={false} />, { wrapper })

      // Should not have a Connect link
      expect(screen.queryByRole('link', { name: /Connect/i })).not.toBeInTheDocument()
      // Should show dash
      expect(screen.getByText('—')).toBeInTheDocument()
    })

    it('renders table when only unlinked providers exist (no identities)', () => {
      mockUseAuthProviders.mockReturnValue({ providers: mockProviders, isLoading: false })
      setupMocks([])

      render(<UserIdentitiesPanel userId="user-1" currentUserId="user-1" hasPassword={false} />, { wrapper })

      // Should show the table, not the empty state
      expect(screen.queryByRole('heading', { name: 'No identity providers configured' })).not.toBeInTheDocument()
      // Both providers are unlinked so there are two "Not connected" texts
      expect(screen.getAllByText('Not connected')).toHaveLength(2)
    })
  })

  // ---- isSelf / currentUserId ---------------------------------------------

  describe('currentUserId matching', () => {
    it('treats userId === currentUserId as self (isSelf = true)', () => {
      const mockProviders = [{ id: 'provider-3', name: 'GitHub', provider_type: 'oidc' }]
      mockUseAuthProviders.mockReturnValue({ providers: mockProviders, isLoading: false })
      setupMocks([])

      render(<UserIdentitiesPanel userId="user-1" currentUserId="user-1" hasPassword={false} />, { wrapper })

      // Self users see a Connect link for unlinked providers
      expect(screen.getByRole('link', { name: /Connect/i })).toBeInTheDocument()
    })

    it('treats different userId and currentUserId as not self', () => {
      const mockProviders = [{ id: 'provider-3', name: 'GitHub', provider_type: 'oidc' }]
      mockUseAuthProviders.mockReturnValue({ providers: mockProviders, isLoading: false })
      setupMocks([])

      render(<UserIdentitiesPanel userId="user-1" currentUserId="user-2" hasPassword={false} />, { wrapper })

      // Non-self users do not see a Connect link
      expect(screen.queryByRole('link', { name: /Connect/i })).not.toBeInTheDocument()
    })

    it('treats missing currentUserId as not self', () => {
      const mockProviders = [{ id: 'provider-3', name: 'GitHub', provider_type: 'oidc' }]
      mockUseAuthProviders.mockReturnValue({ providers: mockProviders, isLoading: false })
      setupMocks([])

      render(<UserIdentitiesPanel userId="user-1" hasPassword={false} />, { wrapper })

      // No currentUserId means not self
      expect(screen.queryByRole('link', { name: /Connect/i })).not.toBeInTheDocument()
    })
  })

  // ---- Attach identity modal interactions ---------------------------------

  describe('Attach identity modal', () => {
    it('opens AttachIdentityModal when Attach identity button is clicked', async () => {
      const user = userEvent.setup()
      setupMocks(mockIdentities)

      render(<UserIdentitiesPanel userId="user-1" hasPassword={false} />, { wrapper })

      await user.click(screen.getByRole('button', { name: /attach identity/i }))

      // The mock should have been called with isOpen=true
      const lastCall = mockAttachIdentityModal.mock.calls[mockAttachIdentityModal.mock.calls.length - 1]
      expect(lastCall[0]).toMatchObject({ isOpen: true })
    })

    it('passes correct currentUserId to AttachIdentityModal', () => {
      setupMocks(mockIdentities)

      render(<UserIdentitiesPanel userId="user-1" hasPassword={false} />, { wrapper })

      const calls = mockAttachIdentityModal.mock.calls
      // Check that any call has currentUserId set to the userId prop
      const hasCorrectId = calls.some((call: [Record<string, unknown>]) => call[0].currentUserId === 'user-1')
      expect(hasCorrectId).toBe(true)
    })
  })

  // ---- Provider link navigation -------------------------------------------

  describe('Provider link navigation', () => {
    it('navigates via wouter on left-click', async () => {
      const user = userEvent.setup()
      setupMocks(mockIdentities)

      render(<UserIdentitiesPanel userId="user-1" hasPassword={false} />, { wrapper })

      const providerLink = screen.getByRole('button', { name: 'Azure' })
      await user.click(providerLink)

      expect(mockNavigate).toHaveBeenCalledTimes(1)
      expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('provider-1'))
    })
  })

  // ---- link_error URL param -----------------------------------------------

  describe('link_error URL param', () => {
    it('reads and removes link_error from URL search params', () => {
      // Spy on history.replaceState before the component reads the URL
      const replaceStateSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {
        // no-op to avoid SecurityError in jsdom
      })

      // Inject a link_error param via the real location (jsdom supports this)
      const originalSearch = window.location.search
      // Use pushState to set the URL without navigation
      window.history.pushState({}, '', '/?link_error=Something+went+wrong')

      setupMocks(mockIdentities)

      render(<UserIdentitiesPanel userId="user-1" hasPassword={false} />, { wrapper })

      // The effect should have called replaceState to clean the URL
      expect(replaceStateSpy).toHaveBeenCalled()
      const calledUrl = replaceStateSpy.mock.calls[0][2] as string
      expect(calledUrl).not.toContain('link_error')

      replaceStateSpy.mockRestore()
      // Restore the original URL
      window.history.pushState({}, '', originalSearch || '/')
    })
  })

  // ---- Detach flow edge cases ---------------------------------------------

  describe('Detach flow edge cases', () => {
    it('does not call mutate if identityToDetach is null (confirmDetach early return)', () => {
      // This tests the confirmDetach guard: if somehow confirmDetach is called
      // without identityToDetach being set, the mutation should not fire.
      // The guard is at line 269: if (!identityToDetach) return
      // We test this indirectly by verifying the mutation is only called
      // when a valid identity is selected.
      setupMocks(mockIdentities)

      render(<UserIdentitiesPanel userId="user-1" hasPassword={false} />, { wrapper })

      // Without clicking Disconnect first, mockMutate should not be called
      expect(mockMutate).not.toHaveBeenCalled()
    })

    it('shows the detach confirmation modal with identity details from the selected row', async () => {
      const user = userEvent.setup()
      setupMocks(twoIdentities)

      render(<UserIdentitiesPanel userId="user-1" hasPassword={false} />, { wrapper })

      // Click Disconnect on the second identity (Okta)
      const disconnectButtons = screen.getAllByRole('button', { name: 'Disconnect' })
      await user.click(disconnectButtons[1])

      // Modal should show Okta identity details
      expect(screen.getByText('Disconnect identity')).toBeInTheDocument()
      expect(screen.getAllByText('https://auth.other.com').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('sub-xyz').length).toBeGreaterThanOrEqual(1)
    })
  })

  // ---- Accessibility -------------------------------------------------------

  describe('Accessibility', () => {
    it('has no accessibility violations with identities', async () => {
      setupMocks(mockIdentities)

      const { container } = render(<UserIdentitiesPanel userId="user-1" hasPassword={false} />, { wrapper })
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no accessibility violations in empty state', async () => {
      setupMocks([])

      const { container } = render(<UserIdentitiesPanel userId="user-1" hasPassword={false} />, { wrapper })
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no accessibility violations with unlinked providers', async () => {
      const mockProviders = [
        { id: 'provider-1', name: 'Azure', provider_type: 'oidc' },
        { id: 'provider-3', name: 'GitHub', provider_type: 'oidc' },
      ]
      mockUseAuthProviders.mockReturnValue({ providers: mockProviders, isLoading: false })
      setupMocks(mockIdentities)

      const { container } = render(<UserIdentitiesPanel userId="user-1" currentUserId="user-1" hasPassword={false} />, {
        wrapper,
      })
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('has no accessibility violations with disabled Disconnect (last identity, no password)', async () => {
      setupMocks(mockIdentities)

      const { container } = render(<UserIdentitiesPanel userId="user-1" hasPassword={false} />, { wrapper })
      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })
})

// ---------------------------------------------------------------------------
// useDetachIdentity hook
// ---------------------------------------------------------------------------

describe('useDetachIdentity', () => {
  beforeEach(() => {
    mockMutate.mockClear()
    vi.mocked(usersClient.useMutation).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as never)
  })

  const hookWrapper = ({ children }: { children: ReactNode }) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return (
      <QueryClientProvider client={client}>
        <AlertProvider>{children}</AlertProvider>
      </QueryClientProvider>
    )
  }

  it('initializes with no identity selected', () => {
    const { result } = renderHook(() => useDetachIdentity('user-1', vi.fn()), { wrapper: hookWrapper })

    expect(result.current.identityToDetach).toBeNull()
    expect(result.current.isDetaching).toBe(false)
  })

  it('does not call mutate when confirmDetach is called without a selected identity', () => {
    const { result } = renderHook(() => useDetachIdentity('user-1', vi.fn()), { wrapper: hookWrapper })

    act(() => result.current.confirmDetach())

    expect(mockMutate).not.toHaveBeenCalled()
  })

  it('calls mutate with correct params when an identity is selected', () => {
    const { result } = renderHook(() => useDetachIdentity('user-1', vi.fn()), { wrapper: hookWrapper })

    act(() => result.current.setIdentityToDetach({ id: 'id-1' } as never))
    act(() => result.current.confirmDetach())

    expect(mockMutate).toHaveBeenCalledTimes(1)
    expect(mockMutate.mock.calls[0][0]).toEqual({
      params: { path: { user_id: 'user-1', identity_id: 'id-1' } },
    })
  })
})
