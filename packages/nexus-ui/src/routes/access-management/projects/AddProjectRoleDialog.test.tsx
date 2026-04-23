import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { AlertProvider } from '../../../components/alerts'
import { accessClient } from '../../access/accessClient'

import { AddProjectRoleDialog } from './AddProjectRoleDialog'

vi.mock('../../access/accessClient', () => ({
  accessClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
}))

vi.mock('../../../client', () => ({
  authMiddleware: { onRequest: vi.fn() },
}))

vi.mock('./ProjectPolicySelect', () => ({
  ProjectPolicySelect: ({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) => (
    <div data-testid="policy-select">
      <span>{selected.join(',')}</span>
      <button onClick={() => onChange([...selected, 'test-policy'])}>Add policy</button>
    </div>
  ),
}))

const mockMutate = vi.fn()

const mockMutationReturn = {
  mutate: mockMutate,
  isPending: false,
  isError: false,
  error: null,
  data: null,
  reset: vi.fn(),
  isIdle: true,
  isSuccess: false,
  failureCount: 0,
  failureReason: null,
  context: undefined,
  submittedAt: 0,
  variables: undefined,
  status: 'idle',
  isPaused: false,
} as never

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>{children}</AlertProvider>
  </QueryClientProvider>
)

describe('AddProjectRoleDialog', () => {
  const mockOnClose = vi.fn()
  const mockOnSuccess = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(accessClient.useMutation).mockReturnValue(mockMutationReturn)
  })

  function renderDialog() {
    return render(<AddProjectRoleDialog projectId="proj-1" onClose={mockOnClose} onSuccess={mockOnSuccess} />, {
      wrapper,
    })
  }

  it('has no accessibility violations', async () => {
    const { container } = renderDialog()
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('renders the modal header', () => {
    renderDialog()
    expect(screen.getByText('Add Project Role')).toBeInTheDocument()
  })

  it('renders Name and Description form fields', () => {
    renderDialog()
    expect(screen.getByRole('textbox', { name: 'Role name' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Role description' })).toBeInTheDocument()
  })

  it('renders the Policies field', () => {
    renderDialog()
    expect(screen.getByText('Policies')).toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mockOnClose).toHaveBeenCalledOnce()
  })
})
