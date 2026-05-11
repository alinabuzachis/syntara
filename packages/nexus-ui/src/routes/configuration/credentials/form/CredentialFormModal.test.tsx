import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { credentialsClient } from '../../../../client'
import { AlertProvider } from '../../../../providers/alerts'
import { useAllProjects } from '../../../access/useAllProjects'

import { CredentialFormModal } from './CredentialFormModal'

vi.mock('../../../../client', () => ({
  credentialsClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
}))

vi.mock('../../../access/useAllProjects', () => ({
  useAllProjects: vi.fn(),
}))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>{children}</AlertProvider>
  </QueryClientProvider>
)

const mockTypes = [
  {
    id: 'type-1',
    name: 'HTTP Bearer Token',
    description: 'Bearer token authentication for HTTP APIs',
    inputs: {
      fields: [{ id: 'token', label: 'Token', type: 'string', secret: true, help_text: 'Bearer token value' }],
      required: ['token'],
    },
    injectors: {},
    managed: true,
  },
  {
    id: 'type-2',
    name: 'HTTP Basic Auth',
    description: 'Username and password',
    inputs: {
      fields: [
        { id: 'username', label: 'Username', type: 'string', secret: false },
        { id: 'password', label: 'Password', type: 'string', secret: true },
      ],
      required: ['username', 'password'],
    },
    injectors: {},
    managed: true,
  },
]

const mockProjects = [
  { id: 'proj-1', name: 'Project Alpha' },
  { id: 'proj-2', name: 'Project Beta' },
  { id: 'proj-3', name: 'Project Gamma' },
]

const mockCredential = {
  id: 'cred-1',
  name: 'My Token',
  description: 'A test token',
  credential_type_id: 'type-1',
  inputs: { token: '$encrypted$' },
  enabled: true,
  labels: {},
  created_by: 'user-1',
  project_id: 'proj-1',
  created_at: '2026-03-01T00:00:00Z',
  updated_at: '2026-03-01T00:00:00Z',
} as const

describe('CredentialFormModal', () => {
  let mockMutate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockMutate = vi.fn()

    vi.mocked(credentialsClient.useQuery).mockReturnValue({
      data: { resources: mockTypes },
      isLoading: false,
      error: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(credentialsClient.useMutation).mockReturnValue({ mutate: mockMutate, isPending: false } as any)
    const projectsMock = { projects: mockProjects, isLoading: false, error: null, refetch: vi.fn() }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    vi.mocked(useAllProjects).mockReturnValue(projectsMock as any)
  })

  it('has no accessibility violations in create mode', async () => {
    const { container } = render(<CredentialFormModal isOpen onClose={vi.fn()} />, { wrapper })
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no accessibility violations in edit mode', async () => {
    const { container } = render(<CredentialFormModal isOpen onClose={vi.fn()} credentialToEdit={mockCredential} />, {
      wrapper,
    })
    expect(await axe(container)).toHaveNoViolations()
  })

  it('renders create modal title when no credential provided', () => {
    render(<CredentialFormModal isOpen onClose={vi.fn()} />, { wrapper })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    // Title and button both say "Create credential" — check the modal header specifically
    const dialog = screen.getByRole('dialog')
    expect(
      within(dialog).getByText('Create credential', { selector: '.pf-v6-c-modal-box__title-text' })
    ).toBeInTheDocument()
  })

  it('renders edit modal title when credential provided', () => {
    render(<CredentialFormModal isOpen onClose={vi.fn()} credentialToEdit={mockCredential} />, { wrapper })
    expect(screen.getByText('Edit credential')).toBeInTheDocument()
  })

  it('renders name and description fields', () => {
    render(<CredentialFormModal isOpen onClose={vi.fn()} />, { wrapper })
    expect(screen.getByLabelText('Credential name')).toBeInTheDocument()
    expect(screen.getByLabelText('Credential description')).toBeInTheDocument()
  })

  it('renders credential type dropdown with types', () => {
    render(<CredentialFormModal isOpen onClose={vi.fn()} />, { wrapper })
    expect(screen.getByLabelText('Credential type')).toBeInTheDocument()
    expect(screen.getByText('HTTP Bearer Token')).toBeInTheDocument()
    expect(screen.getByText('HTTP Basic Auth')).toBeInTheDocument()
  })

  it('shows dynamic fields when type is selected', async () => {
    const user = userEvent.setup()
    render(<CredentialFormModal isOpen onClose={vi.fn()} />, { wrapper })

    await user.selectOptions(screen.getByLabelText('Credential type'), 'type-1')

    expect(screen.getByLabelText('Token', { selector: 'input' })).toBeInTheDocument()
  })

  it('shows multiple fields for multi-field type', async () => {
    const user = userEvent.setup()
    render(<CredentialFormModal isOpen onClose={vi.fn()} />, { wrapper })

    await user.selectOptions(screen.getByLabelText('Credential type'), 'type-2')

    expect(screen.getByLabelText('Username', { selector: 'input' })).toBeInTheDocument()
    expect(screen.getByLabelText('Password', { selector: 'input' })).toBeInTheDocument()
  })

  it('pre-fills fields in edit mode', () => {
    render(<CredentialFormModal isOpen onClose={vi.fn()} credentialToEdit={mockCredential} />, { wrapper })

    expect(screen.getByDisplayValue('My Token')).toBeInTheDocument()
    expect(screen.getByDisplayValue('A test token')).toBeInTheDocument()
  })

  it('disables type dropdown in edit mode', () => {
    render(<CredentialFormModal isOpen onClose={vi.fn()} credentialToEdit={mockCredential} />, { wrapper })

    const typeSelect = screen.getByLabelText('Credential type')
    expect(typeSelect).toBeDisabled()
  })

  it('shows create button in create mode', () => {
    render(<CredentialFormModal isOpen onClose={vi.fn()} />, { wrapper })
    expect(screen.getByRole('button', { name: 'Create credential' })).toBeInTheDocument()
  })

  it('shows save button in edit mode', () => {
    render(<CredentialFormModal isOpen onClose={vi.fn()} credentialToEdit={mockCredential} />, { wrapper })
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
  })

  it('calls onClose when cancel is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<CredentialFormModal isOpen onClose={onClose} />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('validates required name field', async () => {
    const user = userEvent.setup()
    render(<CredentialFormModal isOpen onClose={vi.fn()} />, { wrapper })

    await user.click(screen.getByRole('button', { name: 'Create credential' }))

    expect(screen.getByText('Name is required')).toBeInTheDocument()
  })

  it('auto-selects first credential type in create mode', () => {
    render(<CredentialFormModal isOpen onClose={vi.fn()} />, { wrapper })

    expect(screen.getByLabelText('Credential type')).toHaveValue('type-1')
  })

  it('shows loading placeholder when types are loading', () => {
    vi.mocked(credentialsClient.useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<CredentialFormModal isOpen onClose={vi.fn()} />, { wrapper })

    expect(screen.getByText('Loading types...')).toBeInTheDocument()
  })

  it('shows error when types fail to load', () => {
    vi.mocked(credentialsClient.useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Network error'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    render(<CredentialFormModal isOpen onClose={vi.fn()} />, { wrapper })

    expect(screen.getByText('Failed to load credential types')).toBeInTheDocument()
  })

  it('calls create mutation with correct data', async () => {
    const user = userEvent.setup()
    render(<CredentialFormModal isOpen onClose={vi.fn()} defaultProjectId="proj-1" />, { wrapper })

    await user.type(screen.getByLabelText('Credential name'), 'New Token')
    await user.selectOptions(screen.getByLabelText('Credential type'), 'type-1')
    await user.type(screen.getByLabelText('Token', { selector: 'input' }), 'my-secret-token')
    await user.click(screen.getByRole('button', { name: 'Create credential' }))

    await waitFor(() => expect(mockMutate).toHaveBeenCalled())
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const callArgs = mockMutate.mock.calls[0][0]
    expect(callArgs).toHaveProperty('body.name', 'New Token')
    expect(callArgs).toHaveProperty('body.credential_type_id', 'type-1')
    expect(callArgs).toHaveProperty('body.project_id', 'proj-1')
  })

  it('does not render when isOpen is false', () => {
    const { container } = render(<CredentialFormModal isOpen={false} onClose={vi.fn()} />, { wrapper })

    expect(container.querySelector('.pf-v6-c-modal-box')).not.toBeInTheDocument()
  })

  it('calls patch mutation in edit mode', async () => {
    const user = userEvent.setup()
    render(<CredentialFormModal isOpen onClose={vi.fn()} credentialToEdit={mockCredential} />, { wrapper })

    await user.clear(screen.getByDisplayValue('My Token'))
    await user.type(screen.getByLabelText('Credential name'), 'Updated Token')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(mockMutate).toHaveBeenCalled())
  })

  it('calls onSuccess callback after successful create', async () => {
    const onSuccess = vi.fn()
    const onClose = vi.fn()
    // Make mutate call onSuccess immediately
    mockMutate.mockImplementation((_args: unknown, callbacks: { onSuccess: () => void }) => {
      callbacks.onSuccess()
    })

    const user = userEvent.setup()
    render(<CredentialFormModal isOpen onClose={onClose} onSuccess={onSuccess} defaultProjectId="proj-1" />, {
      wrapper,
    })

    await user.type(screen.getByLabelText('Credential name'), 'New Token')
    await user.selectOptions(screen.getByLabelText('Credential type'), 'type-1')
    await user.type(screen.getByLabelText('Token', { selector: 'input' }), 'secret')
    await user.click(screen.getByRole('button', { name: 'Create credential' }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(onClose).toHaveBeenCalled()
  })

  it('resets form when type changes in create mode', async () => {
    const user = userEvent.setup()
    render(<CredentialFormModal isOpen onClose={vi.fn()} />, { wrapper })

    // Select first type
    await user.selectOptions(screen.getByLabelText('Credential type'), 'type-1')
    expect(screen.getByLabelText('Token', { selector: 'input' })).toBeInTheDocument()

    // Change to second type
    await user.selectOptions(screen.getByLabelText('Credential type'), 'type-2')
    expect(screen.getByLabelText('Username', { selector: 'input' })).toBeInTheDocument()
    expect(screen.getByLabelText('Password', { selector: 'input' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Token', { selector: 'input' })).not.toBeInTheDocument()
  })

  it('clears field errors when input changes', async () => {
    const user = userEvent.setup()
    render(<CredentialFormModal isOpen onClose={vi.fn()} />, { wrapper })

    // Trigger validation error
    await user.click(screen.getByRole('button', { name: 'Create credential' }))
    expect(screen.getByText('Name is required')).toBeInTheDocument()

    // Type in name to clear error
    await user.type(screen.getByLabelText('Credential name'), 'Test')
    expect(screen.queryByText('Name is required')).not.toBeInTheDocument()
  })

  it('pre-selects credential type when preSelectedTypeId is provided', () => {
    render(<CredentialFormModal isOpen onClose={vi.fn()} preSelectedTypeId="type-1" />, { wrapper })

    const typeSelect = screen.getByLabelText('Credential type')
    expect(typeSelect).toHaveValue('type-1')
    expect(typeSelect).toBeDisabled()
  })

  it('shows dynamic fields for pre-selected type', () => {
    render(<CredentialFormModal isOpen onClose={vi.fn()} preSelectedTypeId="type-1" />, { wrapper })

    expect(screen.getByLabelText('Token', { selector: 'input' })).toBeInTheDocument()
  })

  it('renders project dropdown in create mode', () => {
    render(<CredentialFormModal isOpen onClose={vi.fn()} />, { wrapper })

    const projectSelect = screen.getByLabelText('Credential project')
    expect(projectSelect).toBeInTheDocument()
    expect(within(projectSelect).getByRole('option', { name: 'Project Alpha' })).toBeInTheDocument()
    expect(within(projectSelect).getByRole('option', { name: 'Project Beta' })).toBeInTheDocument()
    expect(within(projectSelect).getByRole('option', { name: 'Project Gamma' })).toBeInTheDocument()
  })

  it('pre-selects project when defaultProjectId is provided', () => {
    render(<CredentialFormModal isOpen onClose={vi.fn()} defaultProjectId="proj-1" />, { wrapper })

    expect(screen.getByLabelText('Credential project')).toHaveValue('proj-1')
  })

  it('shows placeholder when no defaultProjectId is provided', () => {
    render(<CredentialFormModal isOpen onClose={vi.fn()} />, { wrapper })

    expect(screen.getByLabelText('Credential project')).toHaveValue('')
    expect(screen.getByText('Select a project')).toBeInTheDocument()
  })

  it('validates project field is required in create mode', async () => {
    const user = userEvent.setup()
    render(<CredentialFormModal isOpen onClose={vi.fn()} />, { wrapper })

    await user.type(screen.getByLabelText('Credential name'), 'New Token')
    await user.selectOptions(screen.getByLabelText('Credential type'), 'type-1')
    await user.type(screen.getByLabelText('Token', { selector: 'input' }), 'my-secret-token')
    await user.click(screen.getByRole('button', { name: 'Create credential' }))

    expect(screen.getByText('Project is required')).toBeInTheDocument()
  })

  it('includes project_id from form in create payload', async () => {
    const user = userEvent.setup()
    render(<CredentialFormModal isOpen onClose={vi.fn()} defaultProjectId="proj-1" />, { wrapper })

    await user.type(screen.getByLabelText('Credential name'), 'New Token')
    await user.selectOptions(screen.getByLabelText('Credential type'), 'type-1')
    await user.type(screen.getByLabelText('Token', { selector: 'input' }), 'my-secret-token')
    await user.click(screen.getByRole('button', { name: 'Create credential' }))

    await waitFor(() => expect(mockMutate).toHaveBeenCalled())
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const callArgs = mockMutate.mock.calls[0][0]
    expect(callArgs).toHaveProperty('body.project_id', 'proj-1')
  })

  it('allows user to change project in create mode', async () => {
    const user = userEvent.setup()
    render(<CredentialFormModal isOpen onClose={vi.fn()} defaultProjectId="proj-1" />, { wrapper })

    await user.selectOptions(screen.getByLabelText('Credential project'), 'proj-2')
    await user.type(screen.getByLabelText('Credential name'), 'New Token')
    await user.selectOptions(screen.getByLabelText('Credential type'), 'type-1')
    await user.type(screen.getByLabelText('Token', { selector: 'input' }), 'my-secret-token')
    await user.click(screen.getByRole('button', { name: 'Create credential' }))

    await waitFor(() => expect(mockMutate).toHaveBeenCalled())
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const callArgs = mockMutate.mock.calls[0][0]
    expect(callArgs).toHaveProperty('body.project_id', 'proj-2')
  })

  it('disables project dropdown in edit mode', () => {
    render(<CredentialFormModal isOpen onClose={vi.fn()} credentialToEdit={mockCredential} />, { wrapper })

    expect(screen.getByLabelText('Credential project')).toBeDisabled()
  })

  it('shows credential project in edit mode', () => {
    render(<CredentialFormModal isOpen onClose={vi.fn()} credentialToEdit={mockCredential} />, { wrapper })

    expect(screen.getByLabelText('Credential project')).toHaveValue('proj-1')
  })

  it('shows loading state for projects', () => {
    const loadingMock = { projects: [], isLoading: true, error: null, refetch: vi.fn() }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    vi.mocked(useAllProjects).mockReturnValue(loadingMock as any)

    render(<CredentialFormModal isOpen onClose={vi.fn()} />, { wrapper })

    expect(screen.getByText('Loading projects...')).toBeInTheDocument()
    expect(screen.getByLabelText('Credential project')).toBeDisabled()
  })

  it('shows error when projects fail to load', () => {
    const errorMock = { projects: [], isLoading: false, error: new Error('Network error'), refetch: vi.fn() }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    vi.mocked(useAllProjects).mockReturnValue(errorMock as any)

    render(<CredentialFormModal isOpen onClose={vi.fn()} />, { wrapper })

    expect(screen.getByText('Failed to load projects')).toBeInTheDocument()
  })

  it('calls onCreated with the new credential ID on successful create', async () => {
    const onCreated = vi.fn()
    const onClose = vi.fn()
    mockMutate.mockImplementation((_args: unknown, callbacks: { onSuccess: (data: unknown) => void }) => {
      callbacks.onSuccess({ id: 'new-cred-123', name: 'New Token' })
    })

    const user = userEvent.setup()
    render(<CredentialFormModal isOpen onClose={onClose} onCreated={onCreated} defaultProjectId="proj-1" />, {
      wrapper,
    })

    await user.type(screen.getByLabelText('Credential name'), 'New Token')
    await user.selectOptions(screen.getByLabelText('Credential type'), 'type-1')
    await user.type(screen.getByLabelText('Token', { selector: 'input' }), 'secret')
    await user.click(screen.getByRole('button', { name: 'Create credential' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('new-cred-123'))
    expect(onClose).toHaveBeenCalled()
  })
})
