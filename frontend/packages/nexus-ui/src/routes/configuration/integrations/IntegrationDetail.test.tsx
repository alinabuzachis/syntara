import type { IntegrationsAPI, Tool } from '@ansible/nexus-contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { credentialsClient, integrationsClient, toolManagerClient } from '../../../client'
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
  toolManagerClient: {
    useMutation: vi.fn(),
  },
}))

const mockUseAllIntegrationTools = vi.fn()

vi.mock('./useAllIntegrationTools', () => ({
  useAllIntegrationTools: (...args: unknown[]) =>
    mockUseAllIntegrationTools(...args) as ReturnType<typeof import('./useAllIntegrationTools').useAllIntegrationTools>,
}))

const mockUseItemSelection = vi.fn()

vi.mock('./useItemSelection', () => ({
  useItemSelection: (...args: unknown[]) =>
    mockUseItemSelection(...args) as ReturnType<typeof import('./useItemSelection').useItemSelection>,
}))

vi.mock('./useIntegrationModelsState', () => ({
  useIntegrationModelsState: () => ({
    models: [],
    isLoading: false,
    error: null,
    refetchModels: vi.fn().mockResolvedValue(undefined),
    enabledModelIds: new Set<string>(),
    enabledCount: 0,
    allSelected: false,
    isDirty: false,
    isSaving: false,
    handleSave: vi.fn(),
    handleSelectAll: vi.fn(),
    defaultModelId: null,
    handleSelectWithDefaultClear: vi.fn(),
    handleSetDefault: vi.fn(),
    handleRemoveDefault: vi.fn(),
    resetSelectionToServer: vi.fn(),
    resetDefault: vi.fn(),
  }),
}))

const mockNavigate = vi.fn()

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual('@tanstack/react-router')
  return {
    ...actual,
    Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
      <a href={String(to)} {...rest}>
        {children}
      </a>
    ),
    useNavigate: () => mockNavigate,
    useParams: vi.fn(() => ({ integrationId: 'int-1' })),
    useRouterState: (opts?: { select?: (s: { location: { pathname: string; searchStr: string } }) => unknown }) => {
      const state = { location: { pathname: '/configuration/integrations/int-1', searchStr: '' } }
      return opts?.select ? opts.select(state) : state
    },
  }
})

vi.mock('./IntegrationModelsTab', () => ({
  IntegrationModelsTab: () => <div data-testid="models-tab-content">Models tab content</div>,
}))

vi.mock('./IntegrationResourcesTab', () => ({
  IntegrationResourcesTab: () => <div data-testid="resources-tab-content">Resources tab content</div>,
}))

let mockActiveTab = 'details'

vi.mock('../../../hooks/useUrlTab', () => ({
  useUrlTab: (): [string, (tab: string) => void] => [mockActiveTab, vi.fn()],
}))

const mockRegisterDirtyCheck: ReturnType<typeof vi.fn<(opts: Record<string, unknown>) => () => void>> = vi.fn(
  () => () => {}
)

vi.mock('../../../app/useUnsavedChanges', () => ({
  useUnsavedChanges: () => ({
    requestNavigation: vi.fn(),
    registerSaveHandler: vi.fn(),
    unregisterSaveHandler: vi.fn() as () => void,
    registerDirtyCheck: mockRegisterDirtyCheck,
  }),
}))

const mockPermissions = {
  canCreate: true,
  canUpdate: true,
  canDelete: true,
  isLoading: false,
  tooltips: {
    create: 'No create permission',
    update: 'No update permission',
    enable: 'No enable permission',
    validate: 'No validate permission',
    delete: 'No delete permission',
  },
}

vi.mock('./useIntegrationPermissions', () => ({
  useIntegrationPermissions: () => mockPermissions,
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

    vi.mocked(toolManagerClient.useMutation).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      mutate: vi.fn(),
      isPending: false,
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
    mockActiveTab = 'details'
    Object.assign(mockPermissions, {
      canCreate: true,
      canUpdate: true,
      canDelete: true,
      isLoading: false,
    })
    mockUseAllIntegrationTools.mockReturnValue({
      tools: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })
    mockUseItemSelection.mockReturnValue({
      enabledIds: new Set<string>(),
      enabledCount: 0,
      allSelected: false,
      isDirty: false,
      handleSelectAll: vi.fn(),
      handleSelectItem: vi.fn(),
      resetToServer: vi.fn(),
    })
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

      const credLink = screen.getByRole('link', { name: 'Test Credential' })
      expect(credLink).toBeInTheDocument()
    })

    it('shows None when no credential is assigned', () => {
      setupDefaultMocks({ integration: { management_credential_id: null } })
      render(<IntegrationDetail />, { wrapper })

      expect(screen.getByText('None')).toBeInTheDocument()
    })

    it('navigates to credential detail when credential link is clicked', () => {
      render(<IntegrationDetail />, { wrapper })

      const credLink = screen.getByRole('link', { name: 'Test Credential' })
      expect(credLink).toHaveAttribute('href', '/configuration/credentials/cred-1')
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

      expect(mockNavigate).toHaveBeenCalledWith({ to: '/configuration/integrations/int-1/edit' })
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
        expect(screen.getByText('Validate integration?')).toBeInTheDocument()
        expect(screen.getByText(/test the connection/i)).toBeInTheDocument()
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

  describe('Unsaved changes guard', () => {
    it('registers a dirty check on mount', () => {
      render(<IntegrationDetail />, { wrapper })

      expect(mockRegisterDirtyCheck).toHaveBeenCalledOnce()
      const opts = mockRegisterDirtyCheck.mock.lastCall?.[0] as unknown as Record<string, unknown> | undefined
      expect(opts).toBeDefined()
      expect(typeof opts!.check).toBe('function')
      expect(typeof opts!.saveAndExit).toBe('function')
      expect(typeof opts!.exitWithoutSaving).toBe('function')
      expect(opts!.title).toBe('Save resource changes?')
      expect(opts!.body).toBe('You have unsaved changes to enabled resources. Would you like to save before leaving?')
      expect(opts!.saveLabel).toBe('Save changes')
    })

    it('shows save button disabled on resources tab when no changes are made', () => {
      mockActiveTab = 'resources'
      render(<IntegrationDetail />, { wrapper })

      const saveButton = screen.getByRole('button', { name: 'Save changes' })
      expect(saveButton).toHaveAttribute('aria-disabled', 'true')
    })

    it('shows save button enabled on resources tab when changes are made', () => {
      mockActiveTab = 'resources'
      mockUseItemSelection.mockReturnValue({
        enabledIds: new Set(['t1']),
        enabledCount: 1,
        allSelected: false,
        isDirty: true,
        handleSelectAll: vi.fn(),
        handleSelectItem: vi.fn(),
        resetToServer: vi.fn(),
      })
      render(<IntegrationDetail />, { wrapper })

      const saveButton = screen.getByRole('button', { name: 'Save changes' })
      expect(saveButton).not.toHaveAttribute('aria-disabled', 'true')
    })

    it('does not show save button on details tab', () => {
      mockActiveTab = 'details'
      render(<IntegrationDetail />, { wrapper })

      expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
    })
  })

  describe('Resource save flow', () => {
    const mockTools = [
      { id: 't1', name: 'Tool 1' },
      { id: 't2', name: 'Tool 2' },
    ] as unknown as Tool[]

    let mockMutateAsync: ReturnType<typeof vi.fn>

    beforeEach(() => {
      mockActiveTab = 'resources'
      mockMutateAsync = vi.fn().mockResolvedValue({})

      mockUseAllIntegrationTools.mockReturnValue({
        tools: mockTools,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })

      mockUseItemSelection.mockReturnValue({
        enabledIds: new Set(['t1']),
        enabledCount: 1,
        allSelected: false,
        isDirty: true,
        handleSelectAll: vi.fn(),
        handleSelectItem: vi.fn(),
        resetToServer: vi.fn(),
      })

      vi.mocked(toolManagerClient.useMutation).mockReturnValue({
        mutateAsync: mockMutateAsync,
        mutate: vi.fn(),
        isPending: false,
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
    })

    it('calls updateTools with enabled and disabled tool IDs when save is clicked', async () => {
      const user = userEvent.setup()
      render(<IntegrationDetail />, { wrapper })

      await user.click(screen.getByRole('button', { name: 'Save changes' }))

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({ body: { tool_ids: ['t1'], enabled: true } })
      })
      expect(mockMutateAsync).toHaveBeenCalledWith({ body: { tool_ids: ['t2'], enabled: false } })
    })

    it('shows success alert after save completes', async () => {
      const user = userEvent.setup()
      render(<IntegrationDetail />, { wrapper })

      await user.click(screen.getByRole('button', { name: 'Save changes' }))

      await waitFor(() => {
        expect(screen.getByText('Changes saved')).toBeInTheDocument()
      })
    })

    it('shows error alert when save fails', async () => {
      mockMutateAsync.mockRejectedValue(new Error('Network error'))
      const user = userEvent.setup()
      render(<IntegrationDetail />, { wrapper })

      await user.click(screen.getByRole('button', { name: 'Save changes' }))

      await waitFor(() => {
        expect(screen.getByText('Save failed')).toBeInTheDocument()
      })
    })
  })

  describe('Dirty check callbacks', () => {
    it('check() reflects the current isDirty state', () => {
      mockUseItemSelection.mockReturnValue({
        enabledIds: new Set<string>(),
        enabledCount: 0,
        allSelected: false,
        isDirty: true,
        handleSelectAll: vi.fn(),
        handleSelectItem: vi.fn(),
        resetToServer: vi.fn(),
      })
      render(<IntegrationDetail />, { wrapper })

      const opts = mockRegisterDirtyCheck.mock.lastCall?.[0] as unknown as Record<string, unknown>
      expect((opts.check as () => boolean)()).toBe(true)
    })

    it('exitWithoutSaving() calls resetToServer', () => {
      const mockResetToServer = vi.fn()
      mockUseItemSelection.mockReturnValue({
        enabledIds: new Set<string>(),
        enabledCount: 0,
        allSelected: false,
        isDirty: false,
        handleSelectAll: vi.fn(),
        handleSelectItem: vi.fn(),
        resetToServer: mockResetToServer,
      })
      render(<IntegrationDetail />, { wrapper })

      const opts = mockRegisterDirtyCheck.mock.lastCall?.[0] as unknown as Record<string, unknown>
      ;(opts.exitWithoutSaving as () => void)()
      expect(mockResetToServer).toHaveBeenCalled()
    })

    it('saveAndExit() triggers the save mutation', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({})
      vi.mocked(toolManagerClient.useMutation).mockReturnValue({
        mutateAsync: mockMutateAsync,
        mutate: vi.fn(),
        isPending: false,
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

      mockUseAllIntegrationTools.mockReturnValue({
        tools: [{ id: 't1' }] as unknown as Tool[],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })

      mockUseItemSelection.mockReturnValue({
        enabledIds: new Set(['t1']),
        enabledCount: 1,
        allSelected: false,
        isDirty: true,
        handleSelectAll: vi.fn(),
        handleSelectItem: vi.fn(),
        resetToServer: vi.fn(),
      })

      render(<IntegrationDetail />, { wrapper })

      const opts = mockRegisterDirtyCheck.mock.lastCall?.[0] as unknown as Record<string, unknown>
      let result: boolean | undefined
      await act(async () => {
        result = await (opts.saveAndExit as () => Promise<boolean>)()
      })
      expect(result).toBe(true)
      expect(mockMutateAsync).toHaveBeenCalledWith({ body: { tool_ids: ['t1'], enabled: true } })
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

  describe('LLM Provider', () => {
    const llmIntegration: IntegrationRead = {
      ...mockIntegration,
      integration_type: 'llm_provider',
      configuration: {
        integration_type: 'llm_provider',
        provider_hint: 'red_hat_ai',
        base_url: 'https://api.redhat.ai',
      },
      total_model_count: 5,
      enabled_model_count: 3,
      total_tool_count: 0,
      enabled_tool_count: 0,
    }

    it('shows Provider type row for LLM provider', () => {
      setupDefaultMocks({ integration: llmIntegration })
      render(<IntegrationDetail />, { wrapper })

      expect(screen.getByText('Provider type')).toBeInTheDocument()
      expect(screen.getByText('Red Hat AI')).toBeInTheDocument()
    })

    it('shows LLM Provider as integration type', () => {
      setupDefaultMocks({ integration: llmIntegration })
      render(<IntegrationDetail />, { wrapper })

      expect(screen.getByText('LLM Provider')).toBeInTheDocument()
    })

    it('shows model count for enabled resources', () => {
      setupDefaultMocks({ integration: llmIntegration })
      render(<IntegrationDetail />, { wrapper })

      expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1)
    })

    it('renders IntegrationModelsTab for LLM provider', async () => {
      setupDefaultMocks({ integration: llmIntegration })
      const user = userEvent.setup()
      render(<IntegrationDetail />, { wrapper })

      await user.click(screen.getByRole('tab', { name: /Enabled resources/ }))

      expect(screen.getByTestId('models-tab-content')).toBeInTheDocument()
    })

    it('renders IntegrationResourcesTab for MCP server (regression)', async () => {
      const user = userEvent.setup()
      render(<IntegrationDetail />, { wrapper })

      await user.click(screen.getByRole('tab', { name: /Enabled resources/ }))

      expect(screen.getByTestId('resources-tab-content')).toBeInTheDocument()
    })

    it('resources tab badge shows model count for LLM provider', () => {
      setupDefaultMocks({ integration: llmIntegration })
      render(<IntegrationDetail />, { wrapper })

      const resourcesTab = screen.getByRole('tab', { name: /Enabled resources/ })
      expect(within(resourcesTab).getByText('3')).toBeInTheDocument()
    })

    it('does not show Provider type row for MCP server', () => {
      render(<IntegrationDetail />, { wrapper })

      expect(screen.queryByText('Provider type')).not.toBeInTheDocument()
    })
  })

  describe('Permission gating', () => {
    it('disables Edit button when canUpdate is false', () => {
      mockPermissions.canUpdate = false
      render(<IntegrationDetail />, { wrapper })

      const editButton = screen.getByRole('button', { name: 'Edit integration' })
      expect(editButton).toHaveAttribute('aria-disabled', 'true')
    })

    it('disables toggle switch with correct label when canUpdate is false', () => {
      mockPermissions.canUpdate = false
      render(<IntegrationDetail />, { wrapper })

      const toggle = screen.getByRole('switch')
      expect(toggle).toBeDisabled()
      expect(screen.getByText('Enabled')).toBeInTheDocument()
    })

    it('disables validate kebab action when canUpdate is false', async () => {
      mockPermissions.canUpdate = false
      const user = userEvent.setup()
      render(<IntegrationDetail />, { wrapper })

      await user.click(screen.getByRole('button', { name: 'Integration actions' }))

      const validateItem = await screen.findByRole('menuitem', { name: /Validate integration/i })
      expect(validateItem).toHaveAttribute('aria-disabled', 'true')
    })

    it('disables delete kebab action when canDelete is false', async () => {
      mockPermissions.canDelete = false
      const user = userEvent.setup()
      render(<IntegrationDetail />, { wrapper })

      await user.click(screen.getByRole('button', { name: 'Integration actions' }))

      const deleteItem = await screen.findByRole('menuitem', { name: /Delete integration/i })
      expect(deleteItem).toHaveAttribute('aria-disabled', 'true')
    })

    it('disables switch during permission loading', () => {
      mockPermissions.isLoading = true
      render(<IntegrationDetail />, { wrapper })

      expect(screen.getByRole('switch')).toBeDisabled()
    })
  })
})
