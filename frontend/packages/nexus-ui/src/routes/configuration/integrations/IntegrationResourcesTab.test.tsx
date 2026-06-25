import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { integrationsClient, toolManagerClient } from '../../../client'
import { AlertProvider } from '../../../providers/alerts'

import { IntegrationResourcesTab } from './IntegrationResourcesTab'
import { useAllIntegrationTools } from './useAllIntegrationTools'

vi.mock('../../../client', () => ({
  integrationsClient: {
    useMutation: vi.fn(),
  },
  toolManagerClient: {
    useMutation: vi.fn(),
  },
}))

vi.mock('./useAllIntegrationTools', () => ({
  useAllIntegrationTools: vi.fn(),
}))

const mockRegisterDirtyCheck: ReturnType<typeof vi.fn> = vi.fn(() => vi.fn())

vi.mock('../../../app/useUnsavedChanges', () => ({
  useUnsavedChanges: () => ({
    registerDirtyCheck: mockRegisterDirtyCheck,
    requestNavigation: vi.fn(),
    registerSaveHandler: vi.fn(),
    unregisterSaveHandler: vi.fn(),
  }),
}))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>{children}</AlertProvider>
  </QueryClientProvider>
)

const mockTools = [
  { id: 't1', name: 'get_repo', description: 'Get a repo', enabled: true, provider_id: 'int-1', parameters: [] },
  { id: 't2', name: 'create_pr', description: 'Create a PR', enabled: true, provider_id: 'int-1', parameters: [] },
  { id: 't3', name: 'list_issues', description: 'List issues', enabled: false, provider_id: 'int-1', parameters: [] },
]

describe('IntegrationResourcesTab', () => {
  const mockBulkUpdateMutate = vi.fn()
  const mockRefreshMutate = vi.fn()
  const mockOnRefreshed = vi.fn().mockResolvedValue(undefined)
  const mockRefetchTools = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useAllIntegrationTools).mockReturnValue({
      tools: mockTools,
      isLoading: false,
      error: null,
      refetch: mockRefetchTools,
    } as never)

    vi.mocked(toolManagerClient.useMutation).mockReturnValue({
      mutateAsync: mockBulkUpdateMutate.mockResolvedValue({}),
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

    vi.mocked(integrationsClient.useMutation).mockReturnValue({
      mutateAsync: mockRefreshMutate.mockResolvedValue({}),
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

  function renderTab() {
    return render(
      <IntegrationResourcesTab
        integrationId="int-1"
        lastRefreshedAt="2026-01-01T10:00:00Z"
        onRefreshed={mockOnRefreshed}
      />,
      { wrapper }
    )
  }

  describe('Rendering', () => {
    it('renders tools in a table with checkboxes', () => {
      renderTab()

      expect(screen.getByText('get_repo')).toBeInTheDocument()
      expect(screen.getByText('create_pr')).toBeInTheDocument()
      expect(screen.getByText('list_issues')).toBeInTheDocument()
    })

    it('shows enabled count', () => {
      renderTab()

      expect(screen.getByText('2 of 3 enabled')).toBeInTheDocument()
    })

    it('shows last refreshed time', () => {
      renderTab()

      expect(screen.getByText(/Last refreshed:/)).toBeInTheDocument()
    })

    it('shows search filter input', () => {
      renderTab()

      expect(screen.getByRole('textbox', { name: /filter tools/i })).toBeInTheDocument()
    })

    it('shows save button disabled when no changes made', () => {
      renderTab()

      expect(screen.getByRole('button', { name: 'Save changes' })).toHaveAttribute('aria-disabled', 'true')
    })
  })

  describe('Tool selection', () => {
    it('enables save button after toggling a tool checkbox', async () => {
      const user = userEvent.setup()
      renderTab()

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[1])

      expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    })

    it('select-all checkbox toggles all filtered tools', async () => {
      const user = userEvent.setup()
      renderTab()

      const selectAllCheckbox = screen.getAllByRole('checkbox')[0]
      await user.click(selectAllCheckbox)

      expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    })
  })

  describe('Unsaved changes guard', () => {
    it('registers a dirty check on mount', () => {
      renderTab()

      expect(mockRegisterDirtyCheck).toHaveBeenCalledWith(
        expect.objectContaining({
          check: expect.any(Function) as () => boolean,
          saveAndExit: expect.any(Function) as () => Promise<boolean>,
          title: 'Save resource changes?',
          body: 'You have unsaved changes to enabled resources. Would you like to save before leaving?',
          saveLabel: 'Save changes',
        })
      )
    })

    it('unregisters dirty check on unmount', () => {
      const unregister = vi.fn()
      mockRegisterDirtyCheck.mockReturnValue(unregister)

      const { unmount } = renderTab()
      unmount()

      expect(unregister).toHaveBeenCalled()
    })

    it('dirty check returns false when no changes made', () => {
      renderTab()

      const options = mockRegisterDirtyCheck.mock.calls[0][0] as { check: () => boolean }
      expect(options.check()).toBe(false)
    })

    it('dirty check returns true after toggling a tool', async () => {
      const user = userEvent.setup()
      renderTab()

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[1])

      const options = mockRegisterDirtyCheck.mock.calls[0][0] as { check: () => boolean }
      expect(options.check()).toBe(true)
    })

    it('saveAndExit calls bulk update and returns true on success', async () => {
      renderTab()

      const options = mockRegisterDirtyCheck.mock.calls[0][0] as { saveAndExit: () => Promise<boolean> }
      let result: boolean = false
      await act(async () => {
        result = await options.saveAndExit()
      })

      expect(result).toBe(true)
    })

    it('exitWithoutSaving resets selection to server state', async () => {
      const user = userEvent.setup()
      renderTab()

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[1])
      expect(screen.getByText('1 of 3 enabled')).toBeInTheDocument()

      const options = mockRegisterDirtyCheck.mock.calls[0][0] as { exitWithoutSaving: () => void }
      act(() => {
        options.exitWithoutSaving()
      })

      expect(screen.getByText('2 of 3 enabled')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save changes' })).toHaveAttribute('aria-disabled', 'true')
    })

    it('registers exitWithoutSaving callback', () => {
      renderTab()

      const options = mockRegisterDirtyCheck.mock.calls[0][0] as Record<string, unknown>
      expect(options).toHaveProperty('exitWithoutSaving')
    })
  })

  describe('Refresh', () => {
    it('refreshes directly when refresh button clicked (no confirmation dialog)', async () => {
      const user = userEvent.setup()
      mockOnRefreshed.mockResolvedValue({ refresh_status: 'available', refresh_error: null })

      renderTab()

      await user.click(screen.getByRole('button', { name: 'Refresh resources' }))

      expect(mockRefreshMutate).toHaveBeenCalled()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('shows error toast when refresh returns error status', async () => {
      const user = userEvent.setup()
      mockOnRefreshed.mockResolvedValue({
        refresh_status: 'error',
        refresh_error: 'Connection refused',
      })

      renderTab()

      await user.click(screen.getByRole('button', { name: 'Refresh resources' }))

      await waitFor(() => {
        expect(screen.getByText('Refresh failed')).toBeInTheDocument()
      })
    })

    it('shows success toast when refresh succeeds', async () => {
      const user = userEvent.setup()
      mockOnRefreshed.mockResolvedValue({
        refresh_status: 'available',
        refresh_error: null,
      })

      renderTab()

      await user.click(screen.getByRole('button', { name: 'Refresh resources' }))

      await waitFor(() => {
        expect(screen.getByText('Resources refreshed')).toBeInTheDocument()
      })
    })
  })

  describe('Empty state', () => {
    it('shows empty state when no tools exist', () => {
      vi.mocked(useAllIntegrationTools).mockReturnValue({
        tools: [],
        isLoading: false,
        error: null,
        refetch: mockRefetchTools,
      } as never)

      renderTab()

      expect(screen.getByText('No resources discovered yet')).toBeInTheDocument()
      expect(screen.getByText(/click refresh tools/i)).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('has no accessibility violations', async () => {
      const { container } = renderTab()

      let results: Awaited<ReturnType<typeof axe>>
      await act(async () => {
        results = await axe(container)
      })
      expect(results!).toHaveNoViolations()
    })
  })
})
