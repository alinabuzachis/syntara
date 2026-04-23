import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { identityProvidersClient } from '../../../../client'
import { AlertProvider } from '../../../../components/alerts'

import { IdentityProviderForm } from './IdentityProviderForm'

type MutationCallbacks = {
  onSuccess?: (data?: unknown) => void
  onError?: (error: unknown) => void
}

function getMutationCallbacks(mockFn: ReturnType<typeof vi.fn>): MutationCallbacks {
  return (mockFn.mock.calls[0]?.[1] ?? {}) as MutationCallbacks
}

vi.mock('../../../../client', () => ({
  authMiddleware: { onRequest: vi.fn() },
  identityProvidersClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
}))

const mockUseParams = vi.fn(() => ({}))
vi.mock('wouter', () => ({
  useLocation: () => ['/access-management/authentication/identity-providers/add', vi.fn()],
  useParams: () => mockUseParams(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}))

const mockNavigate = vi.fn()
vi.mock('wouter/use-browser-location', () => ({
  navigate: (...args: unknown[]): void => {
    mockNavigate(...args)
  },
}))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>{children}</AlertProvider>
  </QueryClientProvider>
)

function setupMocks() {
  vi.mocked(identityProvidersClient.useQuery).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as never)
  vi.mocked(identityProvidersClient.useMutation).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as never)
}

describe('IdentityProviderForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
    mockUseParams.mockReturnValue({})
  })

  describe('add mode', () => {
    it('renders the add form', () => {
      setupMocks()
      render(<IdentityProviderForm mode="add" />, { wrapper })

      expect(screen.getByRole('heading', { name: 'Add OIDC provider' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Add provider' })).toBeInTheDocument()
    })

    it('renders test connection button', () => {
      setupMocks()
      render(<IdentityProviderForm mode="add" />, { wrapper })

      expect(screen.getByRole('button', { name: 'Test connection' })).toBeInTheDocument()
    })

    it('renders cancel button', () => {
      setupMocks()
      render(<IdentityProviderForm mode="add" />, { wrapper })

      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    })

    it('renders all required form fields', () => {
      setupMocks()
      render(<IdentityProviderForm mode="add" />, { wrapper })

      expect(screen.getByLabelText(/Provider Name/)).toBeInTheDocument()
      expect(screen.getByLabelText(/Issuer URL/)).toBeInTheDocument()
      expect(screen.getByLabelText(/Client ID/)).toBeInTheDocument()
      expect(screen.getByLabelText(/Client Secret/)).toBeInTheDocument()
      expect(screen.getByLabelText(/Scopes/)).toBeInTheDocument()
    })

    it('renders redirect URI as read-only clipboard copy', () => {
      setupMocks()
      render(<IdentityProviderForm mode="add" />, { wrapper })

      expect(screen.getByText(/Redirect URI/)).toBeInTheDocument()
      expect(screen.getByDisplayValue(/\/api\/v1\/auth\/oidc\/callback/)).toBeInTheDocument()
    })

    it('shows manual endpoint fields when auto-discovery is disabled', async () => {
      setupMocks()
      const user = userEvent.setup()
      render(<IdentityProviderForm mode="add" />, { wrapper })

      // Toggle auto-discovery off
      const autoDiscoverySwitch = screen.getByLabelText(/Use OIDC Discovery/)
      await user.click(autoDiscoverySwitch)

      expect(screen.getByLabelText(/Authorization Endpoint/)).toBeInTheDocument()
      expect(screen.getByLabelText(/Token Endpoint/)).toBeInTheDocument()
      expect(screen.getByLabelText(/JWKS URI/)).toBeInTheDocument()
      expect(screen.getByLabelText(/Userinfo Endpoint/)).toBeInTheDocument()
    })

    it('has no accessibility violations', async () => {
      setupMocks()
      const { container } = render(<IdentityProviderForm mode="add" />, { wrapper })

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })

  describe('edit mode', () => {
    const mockProvider = {
      id: 'provider-1',
      name: 'Azure AD',
      enabled: true,
      configuration: {
        provider_type: 'oidc',
        auto_discovery: true,
        issuer_url: 'https://login.microsoftonline.com/tenant',
        client_id: 'client-123',
        scopes: 'openid profile email',
      },
    }

    function setupEditMocks() {
      vi.mocked(identityProvidersClient.useQuery).mockReturnValue({
        data: mockProvider,
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as never)
      vi.mocked(identityProvidersClient.useMutation).mockReturnValue({
        mutate: vi.fn(),
        isPending: false,
      } as never)
    }

    it('renders the edit form with Save button', () => {
      setupEditMocks()
      render(<IdentityProviderForm mode="edit" />, { wrapper })

      expect(screen.getByRole('heading', { name: 'Edit OIDC provider' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save provider' })).toBeInTheDocument()
    })

    it('populates form with provider data', () => {
      setupEditMocks()
      render(<IdentityProviderForm mode="edit" />, { wrapper })

      expect(screen.getByDisplayValue('Azure AD')).toBeInTheDocument()
      expect(screen.getByDisplayValue('https://login.microsoftonline.com/tenant')).toBeInTheDocument()
      expect(screen.getByDisplayValue('client-123')).toBeInTheDocument()
    })

    it('shows not found state when provider does not exist', () => {
      vi.mocked(identityProvidersClient.useQuery).mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error('Not found'),
        refetch: vi.fn(),
      } as never)
      vi.mocked(identityProvidersClient.useMutation).mockReturnValue({
        mutate: vi.fn(),
        isPending: false,
      } as never)

      render(<IdentityProviderForm mode="edit" />, { wrapper })

      expect(screen.getByText('Identity provider not found')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Back to identity providers/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Retry/ })).toBeInTheDocument()
    })

    it('shows loading state while fetching provider', () => {
      vi.mocked(identityProvidersClient.useQuery).mockReturnValue({
        data: undefined,
        isLoading: true,
        isPending: true,
        isError: false,
        error: null,
        refetch: vi.fn(),
        status: 'pending',
        fetchStatus: 'fetching',
      } as never)
      vi.mocked(identityProvidersClient.useMutation).mockReturnValue({
        mutate: vi.fn(),
        isPending: false,
      } as never)

      render(<IdentityProviderForm mode="edit" />, { wrapper })

      expect(screen.getByRole('heading', { name: 'Edit OIDC provider' })).toBeInTheDocument()
      // Should not render the submit button since the loading state takes over
      expect(screen.queryByRole('button', { name: 'Save provider' })).not.toBeInTheDocument()
    })

    it('calls patchProvider on submit in edit mode', async () => {
      const mockPatch = vi.fn()
      mockUseParams.mockReturnValue({ providerId: 'provider-1' })
      vi.mocked(identityProvidersClient.useQuery).mockReturnValue({
        data: mockProvider,
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as never)

      vi.mocked(identityProvidersClient.useMutation).mockImplementation(((method: string) => {
        if (method === 'patch') {
          return { mutate: mockPatch, isPending: false }
        }
        return { mutate: vi.fn(), isPending: false }
      }) as never)

      const user = userEvent.setup()
      render(<IdentityProviderForm mode="edit" />, { wrapper })

      await user.click(screen.getByRole('button', { name: 'Save provider' }))

      await waitFor(() => {
        expect(mockPatch).toHaveBeenCalled()
      })

      // Simulate onSuccess callback
      act(() => {
        getMutationCallbacks(mockPatch).onSuccess?.()
      })
      expect(mockNavigate).toHaveBeenCalled()
    })
  })

  describe('submit and test connection', () => {
    it('calls createProvider on submit in add mode', async () => {
      const mockCreate = vi.fn()
      setupMocks()

      vi.mocked(identityProvidersClient.useMutation).mockImplementation(((_method: string, path: string) => {
        if (path === '/') {
          return { mutate: mockCreate, isPending: false }
        }
        return { mutate: vi.fn(), isPending: false }
      }) as never)

      const user = userEvent.setup()
      render(<IdentityProviderForm mode="add" />, { wrapper })

      // Fill required fields
      await user.type(screen.getByLabelText(/Provider Name/), 'My Provider')
      await user.type(screen.getByLabelText(/Issuer URL/), 'https://issuer.example.com')
      await user.type(screen.getByLabelText(/Client ID/), 'client-id')
      await user.type(screen.getByLabelText(/Client Secret/), 'client-secret')

      await user.click(screen.getByRole('button', { name: 'Add provider' }))

      await waitFor(() => {
        expect(mockCreate).toHaveBeenCalled()
      })

      // Simulate onSuccess callback
      act(() => {
        getMutationCallbacks(mockCreate).onSuccess?.()
      })
      expect(mockNavigate).toHaveBeenCalled()
    })

    it('sets name field error on conflict error', async () => {
      const mockCreate = vi.fn()
      setupMocks()

      vi.mocked(identityProvidersClient.useMutation).mockImplementation(((_method: string, path: string) => {
        if (path === '/') {
          return { mutate: mockCreate, isPending: false }
        }
        return { mutate: vi.fn(), isPending: false }
      }) as never)

      const user = userEvent.setup()
      render(<IdentityProviderForm mode="add" />, { wrapper })

      await user.type(screen.getByLabelText(/Provider Name/), 'Duplicate')
      await user.type(screen.getByLabelText(/Issuer URL/), 'https://issuer.example.com')
      await user.type(screen.getByLabelText(/Client ID/), 'client-id')
      await user.type(screen.getByLabelText(/Client Secret/), 'secret')

      await user.click(screen.getByRole('button', { name: 'Add provider' }))

      await waitFor(() => {
        expect(mockCreate).toHaveBeenCalled()
      })

      // Simulate conflict error
      const conflictError = { code: 'PROVIDER_NAME_CONFLICT', detail: 'conflict' }
      act(() => {
        getMutationCallbacks(mockCreate).onError?.(conflictError)
      })

      await waitFor(() => {
        expect(screen.getByText(/already exists/)).toBeInTheDocument()
      })
    })

    it('handles test connection success', async () => {
      const mockTest = vi.fn()
      setupMocks()

      vi.mocked(identityProvidersClient.useMutation).mockImplementation(((method: string, path: string) => {
        if (method === 'post' && path === '/test') {
          return { mutate: mockTest, isPending: false }
        }
        return { mutate: vi.fn(), isPending: false }
      }) as never)

      const user = userEvent.setup()
      render(<IdentityProviderForm mode="add" />, { wrapper })

      await user.type(screen.getByLabelText(/Issuer URL/), 'https://issuer.example.com')
      await user.click(screen.getByRole('button', { name: 'Test connection' }))

      await waitFor(() => {
        expect(mockTest).toHaveBeenCalled()
      })

      // Simulate success
      act(() => {
        getMutationCallbacks(mockTest).onSuccess?.({ success: true, message: 'Connected' })
      })

      await waitFor(() => {
        expect(screen.getByText('Connection successful')).toBeInTheDocument()
        expect(screen.getByText('Connected')).toBeInTheDocument()
      })
    })

    it('handles test connection failure', async () => {
      const mockTest = vi.fn()
      setupMocks()

      vi.mocked(identityProvidersClient.useMutation).mockImplementation(((method: string, path: string) => {
        if (method === 'post' && path === '/test') {
          return { mutate: mockTest, isPending: false }
        }
        return { mutate: vi.fn(), isPending: false }
      }) as never)

      const user = userEvent.setup()
      render(<IdentityProviderForm mode="add" />, { wrapper })

      await user.type(screen.getByLabelText(/Issuer URL/), 'https://issuer.example.com')
      await user.click(screen.getByRole('button', { name: 'Test connection' }))

      await waitFor(() => {
        expect(mockTest).toHaveBeenCalled()
      })

      // Simulate error callback
      act(() => {
        getMutationCallbacks(mockTest).onError?.(new Error('Connection refused'))
      })

      await waitFor(() => {
        expect(screen.getByText('Connection failed')).toBeInTheDocument()
      })
    })
  })
})
