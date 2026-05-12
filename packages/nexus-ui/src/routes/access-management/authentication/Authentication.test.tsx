import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { identityProvidersClient } from '../../../client'
import { AlertProvider } from '../../../providers/alerts'

import Authentication from './Authentication'

vi.mock('../../../client', () => ({
  identityProvidersClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
}))

vi.mock('wouter', () => ({
  useLocation: () => ['/system-administration/authentication', vi.fn()],
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

function setupEmptyProviders() {
  vi.mocked(identityProvidersClient.useQuery).mockReturnValue({
    data: { resources: [], total: 0 },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as never)
  vi.mocked(identityProvidersClient.useMutation).mockReturnValue({
    mutate: vi.fn(),
  } as never)
}

describe('Authentication', () => {
  it('renders the page header', () => {
    setupEmptyProviders()
    render(<Authentication />, { wrapper })

    expect(screen.getByRole('heading', { level: 1, name: 'Identity Providers' })).toBeInTheDocument()
  })

  it('renders empty state when no providers configured', () => {
    setupEmptyProviders()
    render(<Authentication />, { wrapper })

    expect(screen.getByText('No identity providers configured')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add OIDC provider/ })).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    setupEmptyProviders()
    const { container } = render(<Authentication />, { wrapper })

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
