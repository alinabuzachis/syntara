import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { credentialsClient } from '../../../client'
import { AlertProvider } from '../../../providers/alerts'

import CredentialDetail from './CredentialDetail'

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}))

const wouterMock = vi.hoisted(() => ({
  credentialId: '1' as string | undefined,
}))

const mockCredential = {
  id: '1',
  name: 'GitHub API Token',
  description: 'Token for GitHub API access',
  credential_type_id: 'type-1',
  inputs: { token: '$encrypted$', username: 'octocat' },
  enabled: true,
  labels: {},
  created_at: '2026-03-01T00:00:00Z',
  updated_at: '2026-03-18T00:00:00Z',
}

const mockCredentialType = {
  id: 'type-1',
  name: 'HTTP Bearer Token',
  description: 'Bearer token auth',
  inputs: {
    fields: [
      { id: 'token', label: 'Token', type: 'string', secret: true },
      { id: 'username', label: 'Username', type: 'string', secret: false },
    ],
    required: ['token'],
  },
  injectors: {},
  managed: true,
}

/** Credential payload as returned by the API (description may be absent). */
type MockCredentialRecord = Omit<typeof mockCredential, 'description'> & { description?: string }

vi.mock('../../../client', () => ({
  credentialsClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },

  authMiddleware: { onRequest: vi.fn(({ request }: { request: unknown }) => request) },
}))

vi.mock('wouter', () => ({
  useLocation: () => [`/configuration/credentials/${wouterMock.credentialId ?? ''}`, mockNavigate],
  useParams: () => ({ credentialId: wouterMock.credentialId }),
}))

vi.mock('../../access/useAllProjects', () => ({
  useAllProjects: () => ({
    projects: [
      { id: 'proj-1', name: 'Project Alpha' },
      { id: 'proj-2', name: 'Project Beta' },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}))

const disableCredentialHookMock = vi.hoisted(() => {
  const state = {
    credentialToDisable: null as typeof mockCredential | null,
    affectedWorkflows: [] as { id: string; name: string }[],
    workflowsFetchError: false,
    isLoadingWorkflows: false,
  }
  const openDisableDialog = vi.fn((cred: typeof mockCredential) => {
    state.credentialToDisable = cred
  })
  const closeDisableDialog = vi.fn(() => {
    state.credentialToDisable = null
  })
  return {
    state,
    openDisableDialog,
    closeDisableDialog,
    reset() {
      state.credentialToDisable = null
      state.affectedWorkflows = []
      state.workflowsFetchError = false
      state.isLoadingWorkflows = false
      openDisableDialog.mockClear()
      closeDisableDialog.mockClear()
    },
  }
})

vi.mock('./useDisableCredentialState', () => ({
  useDisableCredentialState: () => ({
    credentialToDisable: disableCredentialHookMock.state.credentialToDisable,
    affectedWorkflows: disableCredentialHookMock.state.affectedWorkflows,
    workflowsFetchError: disableCredentialHookMock.state.workflowsFetchError,
    isLoadingWorkflows: disableCredentialHookMock.state.isLoadingWorkflows,
    openDisableDialog: disableCredentialHookMock.openDisableDialog,
    closeDisableDialog: disableCredentialHookMock.closeDisableDialog,
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

function mockQuery(
  credential: MockCredentialRecord | null = mockCredential,
  credentialType: typeof mockCredentialType | null = mockCredentialType,
  options?: { credentialTypeQueryError?: boolean }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (_method: string, path: string): any => {
    if (path === '/credentials/{credential_id}') {
      return {
        data: credential,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      }
    }
    if (path === '/credential_types/{credential_type_id}') {
      if (options?.credentialTypeQueryError) {
        return {
          data: undefined,
          isLoading: false,
          isError: true,
          error: new Error('Credential type request failed'),
          refetch: vi.fn(),
        }
      }
      return {
        data: credentialType,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      }
    }
    if (path === '/credentials/{credential_id}/workflows') {
      return {
        data: [],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      }
    }
    return { data: null, isLoading: false, error: null, refetch: vi.fn() }
  }
}

describe('CredentialDetail', () => {
  let mockMutate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    wouterMock.credentialId = '1'
    disableCredentialHookMock.reset()
    vi.clearAllMocks()
    mockMutate = vi.fn()

    vi.mocked(credentialsClient.useQuery).mockImplementation(mockQuery())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(credentialsClient.useMutation).mockReturnValue({ mutate: mockMutate, isPending: false } as any)
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<CredentialDetail />, { wrapper })
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('renders credential name in page header as primary title', () => {
    render(<CredentialDetail />, { wrapper })
    expect(screen.getByRole('heading', { level: 1, name: 'GitHub API Token' })).toBeInTheDocument()
  })

  it('renders Details tab with credential fields', () => {
    render(<CredentialDetail />, { wrapper })

    expect(screen.getByRole('tab', { name: 'Details' })).toBeInTheDocument()
    expect(screen.getByText('Name')).toBeInTheDocument()
    const nameElements = screen.getAllByText('GitHub API Token')
    expect(nameElements.length).toBeGreaterThan(0)
    expect(screen.getByText('Description')).toBeInTheDocument()
    expect(screen.getByText('Token for GitHub API access')).toBeInTheDocument()
  })

  it('omits Description row when credential has no description', () => {
    const credWithoutDescription = { ...mockCredential, description: undefined }
    vi.mocked(credentialsClient.useQuery).mockImplementation(mockQuery(credWithoutDescription))

    render(<CredentialDetail />, { wrapper })

    expect(screen.queryByText('Description')).not.toBeInTheDocument()
  })

  it('omits Description row when description is whitespace only', () => {
    const credBlankDescription = { ...mockCredential, description: '   \n\t' }
    vi.mocked(credentialsClient.useQuery).mockImplementation(mockQuery(credBlankDescription))

    render(<CredentialDetail />, { wrapper })

    expect(screen.queryByText('Description')).not.toBeInTheDocument()
  })

  it('shows Encrypted label for secret fields', () => {
    render(<CredentialDetail />, { wrapper })

    expect(screen.getByRole('tab', { name: 'Details' })).toBeInTheDocument()
    const encryptedLabels = screen.getAllByText('Encrypted')
    expect(encryptedLabels.length).toBeGreaterThan(0)
  })

  it('shows plain value for non-secret fields', () => {
    render(<CredentialDetail />, { wrapper })

    expect(screen.getByRole('tab', { name: 'Details' })).toBeInTheDocument()
    expect(screen.getByText('octocat')).toBeInTheDocument()
  })

  it('renders credential type as plain text', () => {
    render(<CredentialDetail />, { wrapper })

    expect(screen.getByText('HTTP Bearer Token')).toBeInTheDocument()
  })

  it('renders Enabled switch', () => {
    render(<CredentialDetail />, { wrapper })

    const enabledSwitch = screen.getByRole('switch', { name: 'Enabled' })
    expect(enabledSwitch).toBeInTheDocument()
    expect(enabledSwitch).toBeChecked()
  })

  it('renders edit button', () => {
    render(<CredentialDetail />, { wrapper })

    expect(screen.getByRole('button', { name: 'Edit credential' })).toBeInTheDocument()
  })

  it('opens edit modal when edit button is clicked', async () => {
    const user = userEvent.setup()
    render(<CredentialDetail />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Edit credential' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('opens delete dialog via kebab menu', async () => {
    const user = userEvent.setup()
    render(<CredentialDetail />, { wrapper })

    const kebabButton = screen.getByRole('button', { name: 'Kebab toggle' })
    expect(kebabButton).toBeInTheDocument()
    await user.click(kebabButton)

    const deleteItem = await screen.findByText('Delete')
    await user.click(deleteItem)

    expect(screen.getByText('Delete credential?')).toBeInTheDocument()
  })

  it('renders loading state', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(credentialsClient.useQuery).mockImplementation((_method: string, path: string): any => {
      if (path === '/credentials/{credential_id}') {
        return {
          data: undefined,
          isPending: true,
          error: null,
          refetch: vi.fn(),
        }
      }
      return { data: null, isPending: false, error: null, refetch: vi.fn() }
    })

    render(<CredentialDetail />, { wrapper })
    expect(screen.getByLabelText('Loading')).toBeInTheDocument()
  })

  it('renders error state', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(credentialsClient.useQuery).mockImplementation((_method: string, path: string): any => {
      if (path === '/credentials/{credential_id}') {
        return {
          data: undefined,
          isLoading: false,
          error: new Error('Server error'),
          isError: true,
          refetch: vi.fn(),
        }
      }
      return { data: null, isLoading: false, error: null, refetch: vi.fn() }
    })

    render(<CredentialDetail />, { wrapper })
    expect(screen.getByRole('heading', { name: 'Credential' })).toBeInTheDocument()
    const errorElements = screen.getAllByText('Error loading credential')
    expect(errorElements.length).toBeGreaterThan(0)
  })

  it('renders formatted created date', () => {
    render(<CredentialDetail />, { wrapper })

    expect(screen.getByRole('tab', { name: 'Details' })).toBeInTheDocument()
    // Created date is formatted with formatDateTime (PPp format from date-fns)
    // Just verify the label is present, date format is locale-dependent
    expect(screen.getByText('Created')).toBeInTheDocument()
  })

  it('renders formatted last modified date', () => {
    render(<CredentialDetail />, { wrapper })

    expect(screen.getByRole('tab', { name: 'Details' })).toBeInTheDocument()
    // Last modified date is formatted with formatDateTime (PPp format from date-fns)
    // Just verify the label is present, date format is locale-dependent
    expect(screen.getByText('Last modified')).toBeInTheDocument()
  })

  it('renders enabled state label', () => {
    render(<CredentialDetail />, { wrapper })

    expect(screen.getByRole('tab', { name: 'Details' })).toBeInTheDocument()
    const stateLabels = screen.getAllByText('Enabled')
    expect(stateLabels.length).toBeGreaterThan(0)
  })

  it('renders disabled state label for disabled credential', () => {
    const disabledCredential = { ...mockCredential, enabled: false }
    vi.mocked(credentialsClient.useQuery).mockImplementation(mockQuery(disabledCredential))

    render(<CredentialDetail />, { wrapper })

    expect(screen.getByRole('tab', { name: 'Details' })).toBeInTheDocument()
    expect(screen.getByText('Disabled')).toBeInTheDocument()
  })

  it('renders Workflows tab with badge', () => {
    render(<CredentialDetail />, { wrapper })

    const workflowsTab = screen.getByRole('tab', { name: /Workflows/ })
    expect(workflowsTab).toBeInTheDocument()
    // Tab has a badge showing workflow count (may be multiple badges in the UI)
    const badges = screen.getAllByText('0')
    expect(badges.length).toBeGreaterThan(0)
  })

  it('does not render Team Access or User Access tabs', () => {
    render(<CredentialDetail />, { wrapper })

    expect(screen.queryByRole('tab', { name: /Team Access/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /User Access/ })).not.toBeInTheDocument()
  })

  it('renders only Details and Workflows tabs', () => {
    render(<CredentialDetail />, { wrapper })

    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(2)
    expect(screen.getByRole('tab', { name: 'Details' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Workflows/ })).toBeInTheDocument()
  })

  it('switches to Workflows tab when clicked', async () => {
    const user = userEvent.setup()
    render(<CredentialDetail />, { wrapper })

    await user.click(screen.getByRole('tab', { name: /Workflows/ }))

    expect(screen.getByRole('tab', { name: /Workflows/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('calls patch mutation to enable credential', async () => {
    const disabledCredential = { ...mockCredential, enabled: false }
    vi.mocked(credentialsClient.useQuery).mockImplementation(mockQuery(disabledCredential))

    const user = userEvent.setup()
    render(<CredentialDetail />, { wrapper })

    await user.click(screen.getByRole('switch', { name: 'Enabled' }))

    expect(mockMutate).toHaveBeenCalled()
  })

  it('handles enable mutation success', async () => {
    mockMutate.mockImplementation((_args: unknown, callbacks: { onSuccess?: () => void }) => {
      callbacks.onSuccess?.()
    })

    const disabledCredential = { ...mockCredential, enabled: false }
    vi.mocked(credentialsClient.useQuery).mockImplementation(mockQuery(disabledCredential))

    const user = userEvent.setup()
    render(<CredentialDetail />, { wrapper })

    await user.click(screen.getByRole('switch', { name: 'Enabled' }))

    expect(mockMutate).toHaveBeenCalled()
  })

  it('handles enable mutation error', async () => {
    mockMutate.mockImplementation((_args: unknown, callbacks: { onError?: (e: unknown) => void }) => {
      callbacks.onError?.(new Error('Failed to enable'))
    })

    const disabledCredential = { ...mockCredential, enabled: false }
    vi.mocked(credentialsClient.useQuery).mockImplementation(mockQuery(disabledCredential))

    const user = userEvent.setup()
    render(<CredentialDetail />, { wrapper })

    await user.click(screen.getByRole('switch', { name: 'Enabled' }))

    expect(mockMutate).toHaveBeenCalled()
  })

  it('confirms delete and calls delete mutation', async () => {
    mockMutate.mockImplementation((_args: unknown, callbacks: { onSuccess?: () => void; onSettled?: () => void }) => {
      callbacks.onSuccess?.()
      callbacks.onSettled?.()
    })

    const user = userEvent.setup()
    render(<CredentialDetail />, { wrapper })

    const kebabButton = screen.getByRole('button', { name: 'Kebab toggle' })
    await user.click(kebabButton)

    const deleteItem = await screen.findByText('Delete')
    await user.click(deleteItem)

    expect(screen.getByText('Delete credential?')).toBeInTheDocument()

    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('checkbox'))
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(mockMutate).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith('/configuration/credentials')
  })

  it('handles delete mutation error', async () => {
    mockMutate.mockImplementation(
      (_args: unknown, callbacks: { onError?: (e: unknown) => void; onSettled?: () => void }) => {
        callbacks.onError?.(new Error('Failed to delete'))
        callbacks.onSettled?.()
      }
    )

    const user = userEvent.setup()
    render(<CredentialDetail />, { wrapper })

    const kebabButton = screen.getByRole('button', { name: 'Kebab toggle' })
    await user.click(kebabButton)

    const deleteItem = await screen.findByText('Delete')
    await user.click(deleteItem)

    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('checkbox'))
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(mockMutate).toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('renders invalid credential shell when route has no credential id', () => {
    wouterMock.credentialId = undefined

    render(<CredentialDetail />, { wrapper })

    expect(screen.getByText('Invalid credential')).toBeInTheDocument()
    expect(screen.getByText('No credential ID provided')).toBeInTheDocument()
  })

  it('shows em dash for type while credential type is still loading', () => {
    vi.mocked(credentialsClient.useQuery).mockImplementation((_method: string, path: string) => {
      if (path === '/credentials/{credential_id}') {
        return {
          data: mockCredential,
          isLoading: false,
          error: null,
          refetch: vi.fn(),
        }
      }
      if (path === '/credential_types/{credential_type_id}') {
        return {
          data: undefined,
          isPending: true,
          isLoading: true,
          isError: false,
          error: null,
          refetch: vi.fn(),
        }
      }
      if (path === '/credentials/{credential_id}/workflows') {
        return {
          data: [],
          isLoading: false,
          error: null,
          refetch: vi.fn(),
        }
      }
      return { data: null, isLoading: false, error: null, refetch: vi.fn() }
    })

    render(<CredentialDetail />, { wrapper })

    expect(screen.getByRole('tab', { name: 'Details' })).toBeInTheDocument()
    expect(screen.getAllByText('\u2014').length).toBeGreaterThan(0)
  })

  it('calls openDisableDialog when disabling an enabled credential', async () => {
    const user = userEvent.setup()
    render(<CredentialDetail />, { wrapper })

    await user.click(screen.getByRole('switch', { name: 'Enabled' }))

    expect(disableCredentialHookMock.openDisableDialog).toHaveBeenCalledWith(
      expect.objectContaining({ id: '1', name: 'GitHub API Token', enabled: true })
    )
  })

  it('submits disable from confirmation dialog', async () => {
    disableCredentialHookMock.state.credentialToDisable = mockCredential
    const user = userEvent.setup()
    render(<CredentialDetail />, { wrapper })

    expect(screen.getByText('Disable credential?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Disable' }))

    expect(mockMutate).toHaveBeenCalledWith(
      { params: { path: { credential_id: '1' } }, body: { enabled: false } },
      expect.any(Object)
    )
  })

  it('handles disable mutation success', async () => {
    mockMutate.mockImplementation((_args: unknown, callbacks: { onSuccess?: () => void; onSettled?: () => void }) => {
      callbacks.onSuccess?.()
      callbacks.onSettled?.()
    })
    disableCredentialHookMock.state.credentialToDisable = mockCredential

    const user = userEvent.setup()
    render(<CredentialDetail />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Disable' }))
    expect(mockMutate).toHaveBeenCalled()
  })

  it('handles disable mutation error', async () => {
    mockMutate.mockImplementation(
      (_args: unknown, callbacks: { onError?: (e: unknown) => void; onSettled?: () => void }) => {
        callbacks.onError?.(new Error('Failed to disable'))
        callbacks.onSettled?.()
      }
    )
    disableCredentialHookMock.state.credentialToDisable = mockCredential

    const user = userEvent.setup()
    render(<CredentialDetail />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Disable' }))
    expect(mockMutate).toHaveBeenCalled()
  })

  it('shows Failed to load type when credential type query fails', () => {
    vi.mocked(credentialsClient.useQuery).mockImplementation(
      mockQuery(mockCredential, mockCredentialType, { credentialTypeQueryError: true })
    )

    render(<CredentialDetail />, { wrapper })

    expect(screen.getByText('Failed to load type')).toBeInTheDocument()
  })

  it('renders workflow count in details when greater than zero', () => {
    const credWithWorkflows = { ...mockCredential, workflow_count: 4 }
    vi.mocked(credentialsClient.useQuery).mockImplementation(mockQuery(credWithWorkflows))

    render(<CredentialDetail />, { wrapper })

    expect(screen.getByRole('tab', { name: /Workflows/ })).toHaveTextContent('4')
    expect(screen.getByRole('tab', { name: 'Details' })).toBeInTheDocument()
    const countCells = screen.getAllByText('4')
    expect(countCells.length).toBeGreaterThanOrEqual(1)
  })

  it('refetches when retry is clicked on retryable credential error', async () => {
    const refetch = vi.fn()
    const retryableError = { retryable: true, message: 'Temporary failure' }
    vi.mocked(credentialsClient.useQuery).mockImplementation((_method: string, path: string) => {
      if (path === '/credentials/{credential_id}') {
        return {
          data: undefined,
          isLoading: false,
          isError: true,
          error: retryableError,
          refetch,
        }
      }
      return { data: null, isLoading: false, error: null, refetch: vi.fn() }
    })

    const user = userEvent.setup()
    render(<CredentialDetail />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetch).toHaveBeenCalled()
  })

  it('renders nothing when credential has no id', () => {
    const credMissingId = { ...mockCredential, id: '' }
    vi.mocked(credentialsClient.useQuery).mockImplementation(mockQuery(credMissingId))

    render(<CredentialDetail />, { wrapper })
    expect(screen.queryByRole('switch', { name: 'Enabled' })).not.toBeInTheDocument()
  })

  it('renders type fields when credential type has no fields array', () => {
    const typeWithoutFields = { ...mockCredentialType, inputs: {} as (typeof mockCredentialType)['inputs'] }
    vi.mocked(credentialsClient.useQuery).mockImplementation(mockQuery(mockCredential, typeWithoutFields))

    render(<CredentialDetail />, { wrapper })

    expect(screen.getByRole('tab', { name: 'Details' })).toBeInTheDocument()
    expect(screen.queryByText('octocat')).not.toBeInTheDocument()
  })

  // Note: useParams is mocked via wouterMock for the missing credentialId case above.
})
