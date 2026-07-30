import { IntegrationStatusEnum } from '@syntara/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { integrationsClient } from '../../../client'
import { AlertProvider } from '../../../providers/alerts'

import { CredentialIntegrationsTab } from './CredentialIntegrationsTab'

const mockRefetch = vi.fn()
const mockNavigate = vi.fn()

vi.mock('../../../client', () => ({
  integrationsClient: {
    useQuery: vi.fn(),
  },
  authMiddleware: { onRequest: vi.fn() },
  interfaceTagMiddleware: { onRequest: vi.fn() },
}))

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual('@tanstack/react-router')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>{children}</AlertProvider>
  </QueryClientProvider>
)

const mockIntegrations = [
  {
    id: 'int-1',
    name: 'GitHub Copilot',
    integration_type: 'mcp_server',
    validation_status: 'available',
    scope: 'global',
  },
  {
    id: 'int-2',
    name: 'Jira Integration',
    integration_type: 'mcp_server',
    validation_status: IntegrationStatusEnum.ERROR,
    validation_error: 'Connection refused',
    scope: 'global',
  },
  {
    id: 'int-3',
    name: 'Red Hat AI',
    integration_type: 'llm_provider',
    validation_status: 'available',
    scope: 'project',
  },
]

describe('CredentialIntegrationsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRefetch.mockResolvedValue({})
  })

  it('has no accessibility violations with integrations', async () => {
    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: { resources: mockIntegrations },
      isPending: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const { container } = render(<CredentialIntegrationsTab credentialId="cred-1" />, { wrapper })
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no accessibility violations in empty state', async () => {
    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: { resources: [] },
      isPending: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const { container } = render(<CredentialIntegrationsTab credentialId="cred-1" />, { wrapper })
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('renders empty state when no integrations', () => {
    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: { resources: [] },
      isPending: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<CredentialIntegrationsTab credentialId="cred-1" />, { wrapper })

    expect(screen.getByText('No integrations using this credential')).toBeInTheDocument()
    expect(
      screen.getByText(
        'This credential is not currently referenced by any integrations. Integrations will appear here once they are configured to use this credential.'
      )
    ).toBeInTheDocument()
  })

  it('renders integration names in table', () => {
    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: { resources: mockIntegrations },
      isPending: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<CredentialIntegrationsTab credentialId="cred-1" />, { wrapper })

    expect(screen.getByText('GitHub Copilot')).toBeInTheDocument()
    expect(screen.getByText('Jira Integration')).toBeInTheDocument()
    expect(screen.getByText('Red Hat AI')).toBeInTheDocument()
  })

  it('renders table headers', () => {
    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: { resources: mockIntegrations },
      isPending: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<CredentialIntegrationsTab credentialId="cred-1" />, { wrapper })

    expect(screen.getByText('Integration Name')).toBeInTheDocument()
    expect(screen.getByText('Type')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Scope')).toBeInTheDocument()
  })

  it('renders footer with pagination', () => {
    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: { resources: mockIntegrations },
      isPending: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<CredentialIntegrationsTab credentialId="cred-1" />, { wrapper })

    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument()
  })

  it('renders footer with singular count', () => {
    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: { resources: [mockIntegrations[0]] },
      isPending: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<CredentialIntegrationsTab credentialId="cred-1" />, { wrapper })

    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument()
  })

  it('renders loading state', () => {
    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: undefined,
      isPending: true,
      error: null,
      isFetching: true,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<CredentialIntegrationsTab credentialId="cred-1" />, { wrapper })

    expect(screen.getByTestId('loading-state')).toBeInTheDocument()
    expect(screen.getByLabelText('Loading')).toBeInTheDocument()
  })

  it('renders error state', () => {
    const mockError = new Error('Network error')
    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: undefined,
      isPending: false,
      error: mockError,
      isError: true,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<CredentialIntegrationsTab credentialId="cred-1" />, { wrapper })

    expect(screen.getByTestId('error-state')).toBeInTheDocument()
  })

  it('calls refetch when retry button clicked', () => {
    const mockError = { detail: 'Server error', status: 500 }
    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: undefined,
      isPending: false,
      error: mockError,
      isError: true,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const { rerender } = render(<CredentialIntegrationsTab credentialId="cred-1" />, { wrapper })

    const retryButton = screen.getByRole('button', { name: 'Retry' })
    retryButton.click()

    expect(mockRefetch).toHaveBeenCalled()

    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: { resources: mockIntegrations },
      isPending: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    rerender(<CredentialIntegrationsTab credentialId="cred-1" />)

    expect(screen.getByText('GitHub Copilot')).toBeInTheDocument()
  })

  it('uses correct API endpoint with credential ID', () => {
    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: { resources: [] },
      isPending: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<CredentialIntegrationsTab credentialId="test-credential-123" />, { wrapper })

    expect(integrationsClient.useQuery).toHaveBeenCalledWith('get', '/integrations', {
      params: { query: { management_credential_id: 'test-credential-123' } },
    })
  })

  it('renders table with accessible label', () => {
    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: { resources: mockIntegrations },
      isPending: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<CredentialIntegrationsTab credentialId="cred-1" />, { wrapper })

    const table = screen.getByRole('grid', { name: 'Integrations using this credential' })
    expect(table).toBeInTheDocument()
  })

  it('handles undefined data gracefully', () => {
    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: undefined,
      isPending: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<CredentialIntegrationsTab credentialId="cred-1" />, { wrapper })

    expect(screen.getByText('No integrations using this credential')).toBeInTheDocument()
  })

  it('displays integration type labels correctly', () => {
    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: { resources: mockIntegrations },
      isPending: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<CredentialIntegrationsTab credentialId="cred-1" />, { wrapper })

    expect(screen.getAllByText('MCP Server').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('LLM Provider')).toBeInTheDocument()
  })

  it('shows validation error tooltip on hover for error status', async () => {
    const user = userEvent.setup()
    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: { resources: mockIntegrations },
      isPending: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
    } as never)

    render(<CredentialIntegrationsTab credentialId="cred-1" />, { wrapper })

    const errorLabels = screen.getAllByText('Error')
    await user.hover(errorLabels[0])
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Connection refused')
  })

  it('displays scope correctly', () => {
    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: { resources: mockIntegrations },
      isPending: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<CredentialIntegrationsTab credentialId="cred-1" />, { wrapper })

    expect(screen.getAllByText('Global').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Project')).toBeInTheDocument()
  })

  it('renders integration description when present', () => {
    const integrationsWithDescription = [
      {
        id: 'int-1',
        name: 'GitHub Copilot',
        description: 'AI coding assistant',
        integration_type: 'mcp_server',
        validation_status: 'available',
        scope: 'global',
        created_by: 'admin',
      },
    ]
    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: { resources: integrationsWithDescription },
      isPending: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<CredentialIntegrationsTab credentialId="cred-1" />, { wrapper })

    expect(screen.getByText('AI coding assistant')).toBeInTheDocument()
  })

  it('renders Created By column with username', () => {
    const integrationsWithCreator = [
      {
        id: 'int-1',
        name: 'GitHub Copilot',
        integration_type: 'mcp_server',
        validation_status: 'available',
        scope: 'global',
        created_by: 'admin',
      },
    ]
    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: { resources: integrationsWithCreator },
      isPending: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<CredentialIntegrationsTab credentialId="cred-1" />, { wrapper })

    expect(screen.getByText('Created By')).toBeInTheDocument()
    expect(screen.getByText('admin')).toBeInTheDocument()
  })

  it('renders clickable rows', () => {
    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: { resources: mockIntegrations },
      isPending: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<CredentialIntegrationsTab credentialId="cred-1" />, { wrapper })

    const rows = screen.getAllByRole('row')
    const dataRows = rows.filter((row) => row.getAttribute('class')?.includes('clickable'))
    expect(dataRows.length).toBe(3)
  })

  it('navigates to integration detail on row click', async () => {
    const user = userEvent.setup()
    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: { resources: [mockIntegrations[0]] },
      isPending: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<CredentialIntegrationsTab credentialId="cred-1" />, { wrapper })

    await user.click(screen.getByText('GitHub Copilot'))

    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: expect.stringContaining('int-1') as string })
    )
  })

  it('paginates with next and previous buttons', async () => {
    const user = userEvent.setup()
    const manyIntegrations = Array.from({ length: 25 }, (_, i) => ({
      id: `int-${i}`,
      name: `Integration ${i}`,
      integration_type: 'mcp_server',
      validation_status: 'available',
      scope: 'global',
      created_by: 'admin',
    }))
    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: { resources: manyIntegrations },
      isPending: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<CredentialIntegrationsTab credentialId="cred-1" />, { wrapper })

    // First page: 20 data rows + 1 header = 21
    expect(screen.getAllByRole('row').length).toBe(21)
    expect(screen.getByText('Integration 0')).toBeInTheDocument()

    // Click next page
    const nextButton = screen.getByRole('button', { name: /next/i })
    await user.click(nextButton)

    // Second page: 5 data rows + 1 header = 6
    expect(screen.getAllByRole('row').length).toBe(6)
    expect(screen.getByText('Integration 20')).toBeInTheDocument()

    // Click previous page
    const prevButton = screen.getByRole('button', { name: /prev/i })
    await user.click(prevButton)

    // Back to first page
    expect(screen.getAllByRole('row').length).toBe(21)
  })

  it('renders integration with missing optional fields', () => {
    const integrationWithMissingFields = [
      {
        id: null,
        name: 'Bare Integration',
        integration_type: null,
        validation_status: null,
        scope: 'project',
        created_by: null,
      },
    ]
    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: { resources: integrationWithMissingFields },
      isPending: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<CredentialIntegrationsTab credentialId="cred-1" />, { wrapper })

    expect(screen.getByText('Bare Integration')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('Project')).toBeInTheDocument()
  })

  it('navigates with empty string when integration id is null', async () => {
    const user = userEvent.setup()
    const integrationWithNullId = [
      {
        id: null,
        name: 'No ID Integration',
        integration_type: 'mcp_server',
        validation_status: 'available',
        scope: 'global',
        created_by: 'admin',
      },
    ]
    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: { resources: integrationWithNullId },
      isPending: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<CredentialIntegrationsTab credentialId="cred-1" />, { wrapper })

    await user.click(screen.getByText('No ID Integration'))

    expect(mockNavigate).toHaveBeenCalled()
  })

  it('changes per-page count and resets to page 1', async () => {
    const user = userEvent.setup()
    const manyIntegrations = Array.from({ length: 100 }, (_, i) => ({
      id: `int-${i}`,
      name: `Integration ${i}`,
      integration_type: 'mcp_server',
      validation_status: 'available',
      scope: 'global',
      created_by: 'admin',
    }))
    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: { resources: manyIntegrations },
      isPending: false,
      error: null,
      isFetching: false,
      refetch: mockRefetch,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<CredentialIntegrationsTab credentialId="cred-1" />, { wrapper })

    // Default: 20 per page, 20 data rows + 1 header = 21
    expect(screen.getAllByRole('row').length).toBe(21)

    // Click the per-page toggle (shows "1 - 20" range)
    const perPageToggle = screen.getByRole('button', { name: /1 - 20/i })
    await user.click(perPageToggle)

    // Select 50 per page
    const option50 = await screen.findByRole('menuitem', { name: /50 per page/i })
    await user.click(option50)

    // Now 50 data rows + 1 header = 51
    expect(screen.getAllByRole('row').length).toBe(51)
  })
})
