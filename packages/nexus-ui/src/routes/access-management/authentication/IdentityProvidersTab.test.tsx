import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'
import { navigate } from 'wouter/use-browser-location'

import { identityProvidersClient } from '../../../client'
import { AlertProvider } from '../../../components/alerts'

import { IdentityProvidersTab } from './IdentityProvidersTab'

vi.mock('../../../client', () => ({
  identityProvidersClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
}))

vi.mock('wouter', () => ({
  useLocation: () => ['/access-management/authentication', vi.fn()],
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}))

vi.mock('wouter/use-browser-location', () => ({
  navigate: vi.fn(),
}))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>{children}</AlertProvider>
  </QueryClientProvider>
)

const mockProvider = {
  id: 'provider-1',
  name: 'Azure AD',
  enabled: true,
  provider_type: 'oidc',
  configuration: {
    issuer_url: 'https://login.microsoftonline.com/tenant',
    client_id: 'client-123',
  },
}

function setupProviders(providers = [mockProvider]) {
  vi.mocked(identityProvidersClient.useQuery).mockReturnValue({
    data: { resources: providers, total: providers.length },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as never)
  vi.mocked(identityProvidersClient.useMutation).mockReturnValue({
    mutate: vi.fn(),
  } as never)
}

function setupEmptyProviders() {
  setupProviders([])
}

describe('IdentityProvidersTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('empty state', () => {
    it('renders empty state when no providers exist', () => {
      setupEmptyProviders()
      render(<IdentityProvidersTab />, { wrapper })

      expect(screen.getByText('No identity providers configured')).toBeInTheDocument()
      expect(screen.getByText(/Configure an external identity provider to enable single sign-on/)).toBeInTheDocument()
    })

    it('renders add button in empty state', () => {
      setupEmptyProviders()
      render(<IdentityProvidersTab />, { wrapper })

      expect(screen.getByRole('button', { name: /Add OIDC provider/ })).toBeInTheDocument()
    })

    it('navigates to add provider page when add button clicked', async () => {
      setupEmptyProviders()
      const user = userEvent.setup()
      render(<IdentityProvidersTab />, { wrapper })

      await user.click(screen.getByRole('button', { name: /Add OIDC provider/ }))

      expect(navigate).toHaveBeenCalledWith('/access-management/authentication/identity-providers/add')
    })

    it('has no accessibility violations in empty state', async () => {
      setupEmptyProviders()
      const { container } = render(<IdentityProvidersTab />, { wrapper })

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })
  })

  describe('with providers', () => {
    it('renders provider table with data', () => {
      setupProviders()
      render(<IdentityProvidersTab />, { wrapper })

      expect(screen.getByText('Azure AD')).toBeInTheDocument()
      expect(screen.getByText('Enabled')).toBeInTheDocument()
      expect(screen.getByText('https://login.microsoftonline.com/tenant')).toBeInTheDocument()
      expect(screen.getByText('client-123')).toBeInTheDocument()
    })

    it('renders table column headers', () => {
      setupProviders()
      render(<IdentityProvidersTab />, { wrapper })

      expect(screen.getByRole('columnheader', { name: /Name/ })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /Status/ })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /Issuer URL/ })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: /Client ID/ })).toBeInTheDocument()
    })

    it('renders add button in toolbar', () => {
      setupProviders()
      render(<IdentityProvidersTab />, { wrapper })

      expect(screen.getByRole('button', { name: /Add OIDC provider/ })).toBeInTheDocument()
    })

    it('shows provider count in footer', () => {
      setupProviders()
      render(<IdentityProvidersTab />, { wrapper })

      expect(screen.getByText(/1 provider/)).toBeInTheDocument()
    })

    it('renders disabled provider with Disabled label', () => {
      setupProviders([{ ...mockProvider, enabled: false }])
      render(<IdentityProvidersTab />, { wrapper })

      expect(screen.getByText('Disabled')).toBeInTheDocument()
    })

    it('has no accessibility violations with providers', async () => {
      setupProviders()
      const { container } = render(<IdentityProvidersTab />, { wrapper })

      const results = await axe(container)
      expect(results).toHaveNoViolations()
    })

    it('shows total count when more providers exist than displayed', () => {
      vi.mocked(identityProvidersClient.useQuery).mockReturnValue({
        data: { resources: [mockProvider], total: 5 },
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as never)
      vi.mocked(identityProvidersClient.useMutation).mockReturnValue({
        mutate: vi.fn(),
      } as never)

      render(<IdentityProvidersTab />, { wrapper })

      expect(screen.getByText(/of 5 total/)).toBeInTheDocument()
    })

    it('opens delete confirmation dialog when delete action is clicked', async () => {
      const user = userEvent.setup()
      setupProviders()
      render(<IdentityProvidersTab />, { wrapper })

      // Open the actions kebab menu
      const actionsButton = screen.getByRole('button', { name: /Kebab toggle/ })
      await user.click(actionsButton)

      // Click delete
      await user.click(screen.getByText('Delete'))

      // Delete dialog should appear
      expect(screen.getByText('Delete identity provider')).toBeInTheDocument()
      expect(screen.getByText(/Are you sure you want to delete "Azure AD"/)).toBeInTheDocument()
    })

    it('closes delete dialog when cancel is clicked', async () => {
      const user = userEvent.setup()
      setupProviders()
      render(<IdentityProvidersTab />, { wrapper })

      // Open delete dialog
      const actionsButton = screen.getByRole('button', { name: /Kebab toggle/ })
      await user.click(actionsButton)
      await user.click(screen.getByText('Delete'))

      // Cancel
      await user.click(screen.getByText('Cancel'))

      expect(screen.queryByText('Delete identity provider')).not.toBeInTheDocument()
    })

    it('calls delete mutation when confirmed', async () => {
      const mockMutate = vi.fn()
      const user = userEvent.setup()

      vi.mocked(identityProvidersClient.useQuery).mockReturnValue({
        data: { resources: [mockProvider], total: 1 },
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as never)
      vi.mocked(identityProvidersClient.useMutation).mockReturnValue({
        mutate: mockMutate,
      } as never)

      render(<IdentityProvidersTab />, { wrapper })

      // Open delete dialog
      const actionsButton = screen.getByRole('button', { name: /Kebab toggle/ })
      await user.click(actionsButton)
      await user.click(screen.getByText('Delete'))

      // Confirm delete — target the button inside the modal dialog
      const dialog = screen.getByRole('dialog')
      await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

      expect(mockMutate).toHaveBeenCalled()
    })

    it('navigates to edit page when edit action is clicked', async () => {
      const user = userEvent.setup()
      setupProviders()
      render(<IdentityProvidersTab />, { wrapper })

      const actionsButton = screen.getByRole('button', { name: /Kebab toggle/ })
      await user.click(actionsButton)
      await user.click(screen.getByText('Edit'))

      expect(navigate).toHaveBeenCalledWith('/access-management/authentication/identity-providers/provider-1')
    })
  })
})
