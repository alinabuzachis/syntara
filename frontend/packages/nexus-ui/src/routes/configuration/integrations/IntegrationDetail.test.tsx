import type { IntegrationsAPI } from '@ansible/nexus-contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { credentialsClient, integrationsClient } from '../../../client'
import { AlertProvider } from '../../../providers/alerts'

import { IntegrationDetail } from './IntegrationDetail'

vi.mock('../../../client', () => ({
  integrationsClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
  credentialsClient: {
    useQuery: vi.fn(),
  },
}))

const mockNavigate = vi.fn()

vi.mock('../../../hooks/routing/useNavigate', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('../../../hooks/routing/useParams', () => ({
  useParams: () => ({ integrationId: 'int-1' }),
}))

vi.mock('./IntegrationResourcesTab', () => ({
  IntegrationResourcesTab: () => <div data-testid="resources-tab-content">Resources tab content</div>,
}))

vi.mock('../../../app/useUnsavedChanges', () => ({
  useUnsavedChanges: () => ({
    requestNavigation: vi.fn(),
    registerSaveHandler: vi.fn(),
    unregisterSaveHandler: vi.fn(),
    registerDirtyCheck: vi.fn(() => vi.fn()),
  }),
}))

type IntegrationRead = IntegrationsAPI.components['schemas']['IntegrationRead']

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>{children}</AlertProvider>
  </QueryClientProvider>
)

const mockIntegration: IntegrationRead = {
  id: 'int-1',
  name: 'My MCP Server',
  description: 'A production integration',
  integration_type: 'mcp_server',
  enabled: true,
  validation_status: 'available',
  scope: 'global',
  configuration: {
    integration_type: 'mcp_server',
    base_url: 'https://mcp.example.com',
  },
  management_credential_id: 'cred-1',
  last_validated_at: '2026-01-01T00:00:00Z',
  validation_error: null,
  refresh_status: 'available',
  last_refreshed_at: '2026-01-01T00:00:00Z',
  refresh_error: null,
  enabled_tool_count: 2,
  total_tool_count: 2,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  created_by: 'user-1',
  labels: {},
}

describe('IntegrationDetail', () => {
  const mockMutate = vi.fn()
  const mockRefetch = vi.fn().mockResolvedValue({ data: mockIntegration })

  function setupDefaultMocks(overrides?: {
    integration?: Partial<IntegrationRead>
    isPending?: boolean
    isError?: boolean
    credentialName?: string
  }) {
    const integration = overrides?.integration ? { ...mockIntegration, ...overrides.integration } : mockIntegration

    vi.mocked(integrationsClient.useQuery).mockReturnValue({
      data: overrides?.isError ? undefined : integration,
      isPending: overrides?.isPending ?? false,
      isError: overrides?.isError ?? false,
      error: overrides?.isError ? new Error('Load failed') : null,
      refetch: mockRefetch,
    } as never)

    vi.mocked(credentialsClient.useQuery).mockReturnValue({
      data: integration.management_credential_id
        ? { name: overrides?.credentialName ?? 'Test Credential', id: integration.management_credential_id }
        : undefined,
      isPending: false,
      isError: false,
      error: null,
    } as never)

    vi.mocked(integrationsClient.useMutation).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      mutateAsync: vi.fn(),
      isIdle: true,
      isSuccess: false,
      isError: false,
      error: null,
      data: null,
      reset: vi.fn(),
      failureCount: 0,
      failureReason: null,
      context: undefined,
      submittedAt: 0,
      variables: undefined,
      status: 'idle',
      isPaused: false,
    } as never)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    setupDefaultMocks()
  })

  describe('Details tab rendering', () => {
    it('shows the integration name as the page title', () => {
      render(<IntegrationDetail />, { wrapper })

      expect(screen.getByRole('heading', { name: 'My MCP Server', level: 1 })).toBeInTheDocument()
    })

    it('shows server name, description, type, status, scope, URL, and resource count', () => {
      render(<IntegrationDetail />, { wrapper })

      expect(screen.getAllByText('My MCP Server').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('A production integration')).toBeInTheDocument()
      expect(screen.getByText('MCP Server')).toBeInTheDocument()
      expect(screen.getByText('Global')).toBeInTheDocument()
      expect(screen.getByText('https://mcp.example.com')).toBeInTheDocument()
      expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1)
    })

    it('shows credential name as a link when credential is assigned', () => {
      render(<IntegrationDetail />, { wrapper })

      const credLink = screen.getByRole('button', { name: 'Test Credential' })
      expect(credLink).toBeInTheDocument()
    })

    it('shows None when no credential is assigned', () => {
      setupDefaultMocks({ integration: { management_credential_id: null } })
      render(<IntegrationDetail />, { wrapper })

      expect(screen.getByText('None')).toBeInTheDocument()
    })

    it('navigates to credential detail when credential link is clicked', async () => {
      const user = userEvent.setup()
      render(<IntegrationDetail />, { wrapper })

      await user.click(screen.getByRole('button', { name: 'Test Credential' }))

      expect(mockNavigate).toHaveBeenCalledWith('/configuration/credentials/cred-1')
    })

    it('shows dash for URL when none is set', () => {
      setupDefaultMocks({
        integration: { configuration: { integration_type: 'mcp_server', base_url: '' } },
      })
      render(<IntegrationDetail />, { wrapper })

      const dashes = screen.getAllByText('—')
      expect(dashes.length).toBeGreaterThanOrEqual(1)
    })

    it('maps integration type to human-readable label', () => {
      render(<IntegrationDetail />, { wrapper })

      expect(screen.getByText('MCP Server')).toBeInTheDocument()
      expect(screen.queryByText('mcp_server')).not.toBeInTheDocument()
    })

    it('shows scope as Global for global integrations', () => {
      render(<IntegrationDetail />, { wrapper })

      expect(screen.getByText('Global')).toBeInTheDocument()
    })

    it('shows scope as Project for project integrations', () => {
      setupDefaultMocks({ integration: { scope: 'project' } })
      render(<IntegrationDetail />, { wrapper })

      expect(screen.getByText('Project')).toBeInTheDocument()
    })

    it('shows enabled resource count from tools data', () => {
      render(<IntegrationDetail />, { wrapper })

      expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('Tab structure', () => {
    it('shows two tabs: Details and Enabled resources', () => {
      render(<IntegrationDetail />, { wrapper })

      expect(screen.getByRole('tab', { name: 'Details' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /Enabled resources/ })).toBeInTheDocument()
      expect(screen.queryByRole('tab', { name: 'Connection credential' })).not.toBeInTheDocument()
    })

    it('shows enabled resource count badge on the resources tab', () => {
      render(<IntegrationDetail />, { wrapper })

      const resourcesTab = screen.getByRole('tab', { name: /Enabled resources/ })
      expect(within(resourcesTab).getByText('2')).toBeInTheDocument()
    })
  })

  describe('Toolbar', () => {
    it('shows enabled/disabled toggle switch', () => {
      render(<IntegrationDetail />, { wrapper })

      expect(screen.getByLabelText(/toggle my mcp server/i)).toBeInTheDocument()
      expect(screen.getByText('Enabled')).toBeInTheDocument()
    })

    it('shows disabled label when integration is disabled', () => {
      setupDefaultMocks({ integration: { enabled: false } })
      render(<IntegrationDetail />, { wrapper })

      expect(screen.getByText('Disabled')).toBeInTheDocument()
    })

    it('shows Edit integration as a primary button in toolbar', () => {
      render(<IntegrationDetail />, { wrapper })

      expect(screen.getByRole('button', { name: 'Edit integration' })).toBeInTheDocument()
    })

    it('navigates to edit page when Edit integration is clicked', async () => {
      const user = userEvent.setup()
      render(<IntegrationDetail />, { wrapper })

      await user.click(screen.getByRole('button', { name: 'Edit integration' }))

      expect(mockNavigate).toHaveBeenCalledWith('/configuration/integrations/int-1/edit')
    })

    it('shows kebab menu', () => {
      render(<IntegrationDetail />, { wrapper })

      expect(screen.getByRole('button', { name: 'Integration actions' })).toBeInTheDocument()
    })
  })

  describe('Kebab menu', () => {
    it('shows Validate integration menu item', async () => {
      const user = userEvent.setup()
      render(<IntegrationDetail />, { wrapper })

      await user.click(screen.getByRole('button', { name: 'Integration actions' }))

      expect(await screen.findByRole('menuitem', { name: /validate integration/i })).toBeInTheDocument()
    })

    it('shows Delete integration menu item', async () => {
      const user = userEvent.setup()
      render(<IntegrationDetail />, { wrapper })

      await user.click(screen.getByRole('button', { name: 'Integration actions' }))

      expect(await screen.findByRole('menuitem', { name: /delete integration/i })).toBeInTheDocument()
    })

    it('does not show Edit in kebab menu', async () => {
      const user = userEvent.setup()
      render(<IntegrationDetail />, { wrapper })

      await user.click(screen.getByRole('button', { name: 'Integration actions' }))

      expect(screen.queryByRole('menuitem', { name: /edit/i })).not.toBeInTheDocument()
    })

    it('opens validate dialog when Validate integration is clicked', async () => {
      const user = userEvent.setup()
      render(<IntegrationDetail />, { wrapper })

      await user.click(screen.getByRole('button', { name: 'Integration actions' }))
      await user.click(await screen.findByRole('menuitem', { name: /validate integration/i }))

      await waitFor(() => {
        expect(screen.getByText('Validate integration')).toBeInTheDocument()
        expect(screen.getByText(/validate the connection/i)).toBeInTheDocument()
      })
    })

    it('opens delete dialog with checkbox when Delete integration is clicked', async () => {
      const user = userEvent.setup()
      render(<IntegrationDetail />, { wrapper })

      await user.click(screen.getByRole('button', { name: 'Integration actions' }))
      await user.click(await screen.findByRole('menuitem', { name: /delete integration/i }))

      await waitFor(() => {
        const dialog = screen.getByRole('dialog')
        expect(within(dialog).getByText(/delete integration/i)).toBeInTheDocument()
        expect(within(dialog).getByRole('checkbox')).toBeInTheDocument()
        expect(within(dialog).getByText(/permanently deleted/i)).toBeInTheDocument()
      })
    })
  })

  describe('Toggle', () => {
    it('opens disable confirmation dialog when toggling enabled to disabled', async () => {
      const user = userEvent.setup()
      render(<IntegrationDetail />, { wrapper })

      await user.click(screen.getByLabelText(/toggle my mcp server/i))

      await waitFor(() => {
        expect(screen.getByText('Disable integration?')).toBeInTheDocument()
      })
    })

    it('calls PATCH directly when toggling disabled to enabled', async () => {
      setupDefaultMocks({ integration: { enabled: false } })
      const user = userEvent.setup()
      render(<IntegrationDetail />, { wrapper })

      await user.click(screen.getByLabelText(/toggle my mcp server/i))

      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { enabled: true },
        }),
        expect.any(Object)
      )
    })
  })

  describe('Loading and error states', () => {
    it('shows loading state while integration data loads', () => {
      setupDefaultMocks({ isPending: true })
      render(<IntegrationDetail />, { wrapper })

      expect(screen.getByRole('heading', { name: 'Integration' })).toBeInTheDocument()
    })

    it('shows error state when loading fails', () => {
      setupDefaultMocks({ isError: true })
      render(<IntegrationDetail />, { wrapper })

      expect(screen.getAllByText('Error loading integration').length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('Accessibility', () => {
    it('has no accessibility violations', async () => {
      const { container } = render(<IntegrationDetail />, { wrapper })

      let results: Awaited<ReturnType<typeof axe>>
      await act(async () => {
        results = await axe(container)
      })
      expect(results!).toHaveNoViolations()
    })
  })
})
