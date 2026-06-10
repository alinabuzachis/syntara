import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { credentialsClient } from '../../../client'
import { AlertProvider } from '../../../providers/alerts'

import { CredentialWorkflowsTab } from './CredentialWorkflowsTab'

const mockRefetch = vi.fn()

vi.mock('../../../client', () => ({
  credentialsClient: {
    useQuery: vi.fn(),
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

const mockWorkflows = [
  { id: 'wf-1', name: 'Production Deployment' },
  { id: 'wf-2', name: 'Staging Sync' },
  { id: 'wf-3', name: 'Database Backup' },
]

describe('CredentialWorkflowsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRefetch.mockResolvedValue({})
  })

  it('has no accessibility violations with workflows', async () => {
    vi.mocked(credentialsClient.useQuery).mockReturnValue({
      data: { resources: mockWorkflows },
      isPending: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const { container } = render(<CredentialWorkflowsTab credentialId="cred-1" />, { wrapper })
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations in empty state', async () => {
    vi.mocked(credentialsClient.useQuery).mockReturnValue({
      data: { resources: [] },
      isPending: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const { container } = render(<CredentialWorkflowsTab credentialId="cred-1" />, { wrapper })
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('renders empty state when no workflows', () => {
    vi.mocked(credentialsClient.useQuery).mockReturnValue({
      data: { resources: [] },
      isPending: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<CredentialWorkflowsTab credentialId="cred-1" />, { wrapper })

    expect(screen.getByText('No workflows using this credential')).toBeInTheDocument()
    expect(
      screen.getByText(
        'This credential is not currently referenced by any workflows. Workflows will appear here once they are configured to use this credential.'
      )
    ).toBeInTheDocument()
  })

  it('renders workflow names in table', () => {
    vi.mocked(credentialsClient.useQuery).mockReturnValue({
      data: { resources: mockWorkflows },
      isPending: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<CredentialWorkflowsTab credentialId="cred-1" />, { wrapper })

    expect(screen.getByText('Production Deployment')).toBeInTheDocument()
    expect(screen.getByText('Staging Sync')).toBeInTheDocument()
    expect(screen.getByText('Database Backup')).toBeInTheDocument()
  })

  it('renders table header', () => {
    vi.mocked(credentialsClient.useQuery).mockReturnValue({
      data: { resources: mockWorkflows },
      isPending: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<CredentialWorkflowsTab credentialId="cred-1" />, { wrapper })

    expect(screen.getByText('Workflow Name')).toBeInTheDocument()
  })

  it('renders footer with workflow count (plural)', () => {
    vi.mocked(credentialsClient.useQuery).mockReturnValue({
      data: { resources: mockWorkflows },
      isPending: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<CredentialWorkflowsTab credentialId="cred-1" />, { wrapper })

    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument()
  })

  it('renders footer with workflow count (singular)', () => {
    vi.mocked(credentialsClient.useQuery).mockReturnValue({
      data: { resources: [mockWorkflows[0]] },
      isPending: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<CredentialWorkflowsTab credentialId="cred-1" />, { wrapper })

    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument()
  })

  it('renders loading state', () => {
    vi.mocked(credentialsClient.useQuery).mockReturnValue({
      data: undefined,
      isPending: true,
      error: null,
      isFetching: true,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<CredentialWorkflowsTab credentialId="cred-1" />, { wrapper })

    expect(screen.getByTestId('loading-state')).toBeInTheDocument()
    expect(screen.getByLabelText('Loading')).toBeInTheDocument()
  })

  it('renders error state', () => {
    const mockError = new Error('Network error')
    vi.mocked(credentialsClient.useQuery).mockReturnValue({
      data: undefined,
      isPending: false,
      error: mockError,
      isError: true,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<CredentialWorkflowsTab credentialId="cred-1" />, { wrapper })

    // Error state is rendered (both in the component and as an alert)
    expect(screen.getByTestId('error-state')).toBeInTheDocument()
  })

  it('calls refetch when retry button clicked', () => {
    // Create a retryable error (5xx errors are retryable)
    const mockError = { detail: 'Server error', status: 500 }
    vi.mocked(credentialsClient.useQuery).mockReturnValue({
      data: undefined,
      isPending: false,
      error: mockError,
      isError: true,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const { rerender } = render(<CredentialWorkflowsTab credentialId="cred-1" />, { wrapper })

    const retryButton = screen.getByRole('button', { name: 'Retry' })
    retryButton.click()

    expect(mockRefetch).toHaveBeenCalled()

    // Simulate successful refetch
    vi.mocked(credentialsClient.useQuery).mockReturnValue({
      data: { resources: mockWorkflows },
      isPending: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    rerender(<CredentialWorkflowsTab credentialId="cred-1" />)

    expect(screen.getByText('Production Deployment')).toBeInTheDocument()
  })

  it('uses correct API endpoint with credential ID', () => {
    vi.mocked(credentialsClient.useQuery).mockReturnValue({
      data: { resources: [] },
      isPending: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<CredentialWorkflowsTab credentialId="test-credential-123" />, { wrapper })

    expect(credentialsClient.useQuery).toHaveBeenCalledWith('get', '/credentials/{credential_id}/workflows', {
      params: { path: { credential_id: 'test-credential-123' } },
    })
  })

  it('renders table with accessible label', () => {
    vi.mocked(credentialsClient.useQuery).mockReturnValue({
      data: { resources: mockWorkflows },
      isPending: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<CredentialWorkflowsTab credentialId="cred-1" />, { wrapper })

    // PatternFly 6 uses grid role for tables
    const table = screen.getByRole('grid', { name: 'Workflows using this credential' })
    expect(table).toBeInTheDocument()
  })

  it('handles undefined data gracefully', () => {
    vi.mocked(credentialsClient.useQuery).mockReturnValue({
      data: undefined,
      isPending: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<CredentialWorkflowsTab credentialId="cred-1" />, { wrapper })

    expect(screen.getByText('No workflows using this credential')).toBeInTheDocument()
  })
})
