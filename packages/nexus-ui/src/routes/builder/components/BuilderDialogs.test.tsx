import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { BuilderDialogs } from './BuilderDialogs'

vi.mock('../../../client', () => ({
  approvalsClient: {
    useQuery: vi.fn().mockReturnValue({ data: undefined, refetch: vi.fn() }),
    useMutation: vi.fn().mockReturnValue({ mutate: vi.fn(), isPending: false }),
  },
}))

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

function renderDialogs(overrides: Partial<React.ComponentProps<typeof BuilderDialogs>> = {}) {
  const props: React.ComponentProps<typeof BuilderDialogs> = {
    workflowName: 'Test Workflow',
    workflowId: 'wf-1',
    confirmDialogOpen: false,
    deleteDialogOpen: false,
    dispatch: vi.fn(),
    handleRunWorkflow: vi.fn(),
    handleDeleteWorkflow: vi.fn(),
    pendingApproval: null,
    approvalViewOpen: false,
    activityNameMap: new Map(),
    handleApprovalClose: vi.fn(),
    ...overrides,
  }
  return render(<BuilderDialogs {...props} />, { wrapper })
}

describe('BuilderDialogs', () => {
  it('renders nothing visible when all dialogs are closed', () => {
    renderDialogs()

    expect(screen.queryByText('Run Test Workflow?')).not.toBeInTheDocument()
    expect(screen.queryByText('Delete workflow?')).not.toBeInTheDocument()
    expect(screen.queryByText('Review approval')).not.toBeInTheDocument()
  })

  it('shows the run confirmation dialog when confirmDialogOpen is true', () => {
    renderDialogs({ confirmDialogOpen: true })

    expect(screen.getByText('Run Test Workflow?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run now' })).toBeInTheDocument()
  })

  it('shows the delete confirmation dialog when deleteDialogOpen is true', () => {
    renderDialogs({ deleteDialogOpen: true })

    expect(screen.getByText('Delete workflow?')).toBeInTheDocument()
    expect(screen.getByText(/will be deleted/)).toBeInTheDocument()
  })

  it('calls handleRunWorkflow when run dialog is confirmed', async () => {
    const user = userEvent.setup()
    const handleRunWorkflow = vi.fn()
    renderDialogs({ confirmDialogOpen: true, handleRunWorkflow })

    await user.click(screen.getByRole('button', { name: 'Run now' }))

    expect(handleRunWorkflow).toHaveBeenCalledTimes(1)
  })

  describe('accessibility', () => {
    it('has no violations with run dialog open', async () => {
      const { container } = renderDialogs({ confirmDialogOpen: true })
      expect(await axe(container)).toHaveNoViolations()
    })
  })
})
