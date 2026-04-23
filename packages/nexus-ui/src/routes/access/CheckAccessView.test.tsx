import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { accessClient } from './accessClient'
import { CheckAccessView } from './CheckAccessView'
import type { PolicyRead } from './types'

const { mockMutate } = vi.hoisted(() => ({
  mockMutate: vi.fn<(...args: unknown[]) => void>(),
}))

vi.mock('./accessClient', () => ({
  accessClient: {
    useQuery: vi.fn().mockReturnValue({
      data: [{ id: 'proj-1', name: 'default' }],
      isPending: false,
      error: null,
    }),
    useMutation: vi.fn().mockReturnValue({
      mutate: mockMutate,
      mutateAsync: vi.fn(),
      isPending: false,
      isIdle: true,
      isError: false,
      isSuccess: false,
      data: undefined,
      error: null,
      reset: vi.fn(),
      status: 'idle',
      failureCount: 0,
      failureReason: null,
      context: undefined,
      submittedAt: 0,
      variables: undefined,
      isPaused: false,
    }),
  },
  accessFetchClient: {
    GET: vi.fn().mockResolvedValue({ data: { resources: [] }, error: null }),
    POST: vi.fn(),
  },
  dynamicFetchClient: {
    GET: vi.fn().mockResolvedValue({ data: { resources: [] }, error: undefined, response: new Response() }),
  },
}))

const samplePolicies: PolicyRead[] = [
  {
    id: 'p1',
    name: 'admin-policy',
    description: 'Admin policy',
    statements: [{ scope: 'any', effect: 'allow', actions: ['workflow:read', 'workflow:write', 'project:read'] }],
    is_builtin: true,
    is_system_scoped: true,
    project_id: null,
    labels: {},
    created_at: null,
    updated_at: null,
  },
]

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
)

function mockMutationState(overrides: Record<string, unknown>) {
  vi.mocked(accessClient.useMutation).mockReturnValue({
    mutate: mockMutate,
    mutateAsync: vi.fn(),
    isPending: false,
    isIdle: false,
    isError: false,
    isSuccess: false,
    data: undefined,
    error: null,
    reset: vi.fn(),
    status: 'idle',
    failureCount: 0,
    failureReason: null,
    context: undefined,
    submittedAt: 0,
    variables: undefined,
    isPaused: false,
    ...overrides,
  } as never)
}

/** Helper to fill the form with resource type "project" and action "read" */
async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByPlaceholderText('Select a resource type'))
  await user.click(screen.getByRole('option', { name: /^project$/i }))
  // project only has 'read', auto-selected via cascade effect
  await waitFor(() => {
    const actionInput = screen.getByPlaceholderText('Select an action')
    expect(actionInput).toHaveValue('read')
  })
}

describe('CheckAccessView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryClient.clear()
    // Reset to default idle state
    vi.mocked(accessClient.useMutation).mockReturnValue({
      mutate: mockMutate,
      mutateAsync: vi.fn(),
      isPending: false,
      isIdle: true,
      isError: false,
      isSuccess: false,
      data: undefined,
      error: null,
      reset: vi.fn(),
      status: 'idle',
      failureCount: 0,
      failureReason: null,
      context: undefined,
      submittedAt: 0,
      variables: undefined,
      isPaused: false,
    } as never)
  })

  it('renders the empty state initially', () => {
    render(<CheckAccessView policies={samplePolicies} />, { wrapper })

    expect(screen.getByText('Check access permissions')).toBeInTheDocument()
    expect(
      screen.getByText('Select a resource type and action, then click Check Access to verify your permissions.')
    ).toBeInTheDocument()
  })

  it('renders form fields', () => {
    render(<CheckAccessView policies={samplePolicies} />, { wrapper })

    expect(screen.getByText('Resource type')).toBeInTheDocument()
    expect(screen.getByText('Action')).toBeInTheDocument()
    expect(screen.getByText('Resource ID')).toBeInTheDocument()
    expect(screen.getByText('Project')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check Access' })).toBeInTheDocument()
  })

  it('disables Check Access button when form is incomplete', () => {
    render(<CheckAccessView policies={samplePolicies} />, { wrapper })

    expect(screen.getByRole('button', { name: 'Check Access' })).toBeDisabled()
  })

  it('renders resource type options from policies', async () => {
    const user = userEvent.setup()
    render(<CheckAccessView policies={samplePolicies} />, { wrapper })

    // Open the typeahead to see options
    await user.click(screen.getByPlaceholderText('Select a resource type'))

    expect(screen.getByRole('option', { name: /^project$/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /^workflow$/i })).toBeInTheDocument()
  })

  it('populates actions when resource type is selected', async () => {
    const user = userEvent.setup()
    render(<CheckAccessView policies={samplePolicies} />, { wrapper })

    await user.click(screen.getByPlaceholderText('Select a resource type'))
    await user.click(screen.getByRole('option', { name: /workflow/i }))

    // Workflow has read and write actions
    await user.click(screen.getByPlaceholderText('Select an action'))
    expect(screen.getByRole('option', { name: /read/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /write/i })).toBeInTheDocument()
  })

  it('auto-selects action when only one is available', async () => {
    const user = userEvent.setup()
    render(<CheckAccessView policies={samplePolicies} />, { wrapper })

    // project only has 'read' action - should auto-select
    await user.click(screen.getByPlaceholderText('Select a resource type'))
    await user.click(screen.getByRole('option', { name: /^project$/i }))

    await waitFor(() => {
      const actionInput = screen.getByPlaceholderText('Select an action')
      expect(actionInput).toHaveValue('read')
    })
  })

  it('shows access allowed result', () => {
    mockMutationState({
      isSuccess: true,
      data: { allowed: true, denied: false, matched_policy: 'admin-policy', denial_reason: '', denied_by: '' },
    })

    render(<CheckAccessView policies={samplePolicies} />, { wrapper })

    expect(screen.getByText('Access allowed')).toBeInTheDocument()
    expect(screen.getByText('admin-policy')).toBeInTheDocument()
  })

  it('shows access denied result', () => {
    mockMutationState({
      isSuccess: true,
      data: {
        allowed: false,
        denied: true,
        matched_policy: 'deny-policy',
        denial_reason: 'Explicitly denied',
        denied_by: 'deny-policy',
      },
    })

    render(<CheckAccessView policies={samplePolicies} />, { wrapper })

    expect(screen.getByText('Access denied')).toBeInTheDocument()
    expect(screen.getByText(/Explicitly denied/)).toBeInTheDocument()
    expect(screen.getAllByText('deny-policy')).toHaveLength(2)
  })

  it('shows access not granted result (warning)', () => {
    mockMutationState({
      isSuccess: true,
      data: {
        allowed: false,
        denied: false,
        matched_policy: '',
        denial_reason: '',
        denied_by: '',
      },
    })

    render(<CheckAccessView policies={samplePolicies} />, { wrapper })

    expect(screen.getByText('Access not granted')).toBeInTheDocument()
  })

  it('shows error state when API call fails', () => {
    mockMutationState({
      isError: true,
      error: new Error('Server error'),
    })

    render(<CheckAccessView policies={samplePolicies} />, { wrapper })

    expect(screen.getByText('Access check failed')).toBeInTheDocument()
  })

  it('shows spinner while checking access', () => {
    mockMutationState({ isPending: true, isIdle: false })

    render(<CheckAccessView policies={samplePolicies} />, { wrapper })

    expect(screen.getByRole('progressbar', { name: 'Checking access' })).toBeInTheDocument()
  })

  it('calls mutate with correct params on submit', async () => {
    const user = userEvent.setup()
    render(<CheckAccessView policies={samplePolicies} />, { wrapper })

    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Check Access' }))

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          body: expect.objectContaining({
            action: 'read',
            resource_type: 'project',
          }),
        })
      )
    })
  })

  it('renders with empty policies', async () => {
    const user = userEvent.setup()
    render(<CheckAccessView policies={[]} />, { wrapper })

    // Open typeahead - should show no results
    await user.click(screen.getByPlaceholderText('Select a resource type'))
    expect(screen.getByText(/No results match/)).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<CheckAccessView policies={samplePolicies} />, { wrapper })
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
