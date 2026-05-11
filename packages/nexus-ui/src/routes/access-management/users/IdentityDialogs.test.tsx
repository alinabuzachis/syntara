import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { usersClient } from '../../../client'
import { AlertProvider } from '../../../providers/alerts'

import { ConnectAction, IdentityDialogs, type ConvertProviderInfo } from './IdentityDialogs'
import type { UserIdentity } from './identityUtils'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../client', () => ({
  usersClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
}))

vi.mock('wouter/use-browser-location', () => ({
  navigate: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockIdentity: UserIdentity = {
  id: 'id-1',
  user_id: 'user-1',
  identity_provider_id: 'provider-1',
  issuer: 'https://login.example.com',
  subject: 'sub-abc',
  created_at: '2026-01-15T00:00:00Z',
  updated_at: '2026-01-15T00:00:00Z',
  last_used_at: '2026-03-10T14:30:00Z',
  provider_name: 'Azure',
}

const mockConvertProvider: ConvertProviderInfo = {
  name: 'GitHub',
  authorizeUrl: '/oidc/authorize?provider_id=gh-1&flow=link',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>{children}</AlertProvider>
  </QueryClientProvider>
)

function setupMocks() {
  vi.mocked(usersClient.useQuery).mockReturnValue({
    data: { resources: [] },
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as never)

  vi.mocked(usersClient.useMutation).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as never)
}

const defaultDialogProps = {
  isAttachOpen: false,
  onCloseAttach: vi.fn(),
  currentUserId: 'user-1',
  onAttached: vi.fn(),
  identityToDetach: null as UserIdentity | null,
  isDetaching: false,
  onConfirmDetach: vi.fn(),
  onCancelDetach: vi.fn(),
  convertProvider: null as ConvertProviderInfo | null,
  onCloseConvert: vi.fn(),
  onConfirmConvert: vi.fn(),
}

function renderDialogs(overrides: Partial<typeof defaultDialogProps> = {}) {
  const props = { ...defaultDialogProps, ...overrides }
  return { ...render(<IdentityDialogs {...props} />, { wrapper }), props }
}

// ---------------------------------------------------------------------------
// IdentityDialogs
// ---------------------------------------------------------------------------

describe('IdentityDialogs', () => {
  beforeEach(() => {
    queryClient.clear()
    vi.clearAllMocks()
    setupMocks()
  })

  // ---- Detach dialog -------------------------------------------------------

  describe('DetachConfirmModal', () => {
    it('does not render when identityToDetach is null', () => {
      renderDialogs({ identityToDetach: null })

      expect(screen.queryByText('Disconnect identity?')).not.toBeInTheDocument()
    })

    it('renders identity details when identityToDetach is set', () => {
      renderDialogs({ identityToDetach: mockIdentity })

      expect(screen.getByText('Disconnect identity?')).toBeInTheDocument()
      expect(screen.getByText('Azure')).toBeInTheDocument()
      expect(screen.getByText('https://login.example.com')).toBeInTheDocument()
      expect(screen.getByText('sub-abc')).toBeInTheDocument()
    })

    it('calls onConfirmDetach when Disconnect is clicked', async () => {
      const user = userEvent.setup()
      const { props } = renderDialogs({ identityToDetach: mockIdentity })

      await user.click(screen.getByRole('button', { name: 'Disconnect' }))

      expect(props.onConfirmDetach).toHaveBeenCalledTimes(1)
    })

    it('calls onCancelDetach when Cancel is clicked', async () => {
      const user = userEvent.setup()
      const { props } = renderDialogs({ identityToDetach: mockIdentity })

      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(props.onCancelDetach).toHaveBeenCalledTimes(1)
    })

    it('disables Disconnect button while detaching', () => {
      renderDialogs({ identityToDetach: mockIdentity, isDetaching: true })

      expect(screen.getByRole('button', { name: /Disconnect/ })).toBeDisabled()
    })

    it('has no accessibility violations', async () => {
      const { baseElement } = renderDialogs({ identityToDetach: mockIdentity })

      const results = await axe(baseElement)
      expect(results).toHaveNoViolations()
    })
  })

  // ---- Convert dialog ------------------------------------------------------

  describe('ConvertConfirmDialog', () => {
    it('does not render when convertProvider is null', () => {
      renderDialogs({ convertProvider: null })

      expect(screen.queryByText('Link identity provider?')).not.toBeInTheDocument()
    })

    it('renders conversion warning when convertProvider is set', () => {
      renderDialogs({ convertProvider: mockConvertProvider })

      expect(screen.getByText('Link identity provider?')).toBeInTheDocument()
      expect(screen.getByText(/GitHub/)).toBeInTheDocument()
      expect(screen.getByText('Your password will be permanently removed')).toBeInTheDocument()
      expect(screen.getByText('This action cannot be undone')).toBeInTheDocument()
    })

    it('has confirm button disabled until acknowledgement checkbox is checked', async () => {
      const user = userEvent.setup()
      renderDialogs({ convertProvider: mockConvertProvider })

      const confirmButton = screen.getByRole('button', { name: 'Convert and link' })
      expect(confirmButton).toBeDisabled()

      const checkbox = screen.getByRole('checkbox', { name: 'I understand this action is irreversible' })
      await user.click(checkbox)

      expect(confirmButton).toBeEnabled()
    })

    it('calls onConfirmConvert when confirmed after acknowledgement', async () => {
      const user = userEvent.setup()
      const { props } = renderDialogs({ convertProvider: mockConvertProvider })

      await user.click(screen.getByRole('checkbox', { name: 'I understand this action is irreversible' }))
      await user.click(screen.getByRole('button', { name: 'Convert and link' }))

      expect(props.onConfirmConvert).toHaveBeenCalledTimes(1)
    })

    it('calls onCloseConvert when Cancel is clicked', async () => {
      const user = userEvent.setup()
      const { props } = renderDialogs({ convertProvider: mockConvertProvider })

      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(props.onCloseConvert).toHaveBeenCalledTimes(1)
    })

    it('has no accessibility violations', async () => {
      const { baseElement } = renderDialogs({ convertProvider: mockConvertProvider })

      const results = await axe(baseElement)
      expect(results).toHaveNoViolations()
    })
  })

  // ---- Closed state --------------------------------------------------------

  it('has no accessibility violations when all dialogs are closed', async () => {
    const { baseElement } = renderDialogs()

    const results = await axe(baseElement)
    expect(results).toHaveNoViolations()
  })
})

// ---------------------------------------------------------------------------
// ConnectAction
// ---------------------------------------------------------------------------

describe('ConnectAction', () => {
  const defaultConnectProps = {
    isSelf: true,
    isLocalUser: false,
    providerName: 'GitHub',
    authorizeUrl: '/oidc/authorize?provider_id=gh-1&flow=link',
    onConvert: vi.fn(),
  }

  function renderConnectAction(overrides: Partial<typeof defaultConnectProps> = {}) {
    const props = { ...defaultConnectProps, onConvert: vi.fn(), ...overrides }
    return { ...render(<ConnectAction {...props} />), props }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a dash when not viewing own profile', () => {
    renderConnectAction({ isSelf: false })

    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('renders a button that triggers onConvert for local users', async () => {
    const user = userEvent.setup()
    const { props } = renderConnectAction({ isSelf: true, isLocalUser: true })

    const button = screen.getByRole('button', { name: 'Connect' })
    expect(button).toBeInTheDocument()

    await user.click(button)

    expect(props.onConvert).toHaveBeenCalledTimes(1)
    expect(props.onConvert).toHaveBeenCalledWith({
      name: 'GitHub',
      authorizeUrl: '/oidc/authorize?provider_id=gh-1&flow=link',
    })
  })

  it('renders a link for federated users', () => {
    renderConnectAction({ isSelf: true, isLocalUser: false })

    const link = screen.getByRole('link', { name: 'Connect' })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/oidc/authorize?provider_id=gh-1&flow=link')
  })

  it('has no accessibility violations for non-self view', async () => {
    const { container } = renderConnectAction({ isSelf: false })

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations for local user button', async () => {
    const { container } = renderConnectAction({ isSelf: true, isLocalUser: true })

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations for federated user link', async () => {
    const { container } = renderConnectAction({ isSelf: true, isLocalUser: false })

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
