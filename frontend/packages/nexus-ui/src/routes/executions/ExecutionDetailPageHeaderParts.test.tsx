import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { axe } from 'vitest-axe'

import { ExecutionDetailHeaderToolbar, ExecutionDetailTitleRowAddons } from './ExecutionDetailPageHeaderParts'
import { executionDetailHasTitleRowExtras, executionDetailPageHeading } from './executionDetailPageHeaderTitle'

vi.mock('../../client', () => ({
  executionsClient: {
    useMutation: vi.fn(() => ({
      mutate: vi.fn(),
      isPending: false,
    })),
  },
}))

vi.mock('../../providers/alerts/AlertContext', () => ({
  useAlerts: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}))

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('executionDetailPageHeaderTitle', () => {
  it('derives heading from workflow metadata when present', () => {
    const execution = {
      workflow_definition: { metadata: { name: 'My workflow' } },
    } as unknown as Parameters<typeof executionDetailPageHeading>[0]
    expect(executionDetailPageHeading(execution, 'exec-id')).toBe('My workflow')
  })

  it('falls back to execution id prefix when metadata missing', () => {
    expect(executionDetailPageHeading(undefined, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe('Execution aaaaaaaa...')
  })

  it('detects when title row extras should render', () => {
    expect(executionDetailHasTitleRowExtras(undefined)).toBe(false)
  })
})

describe('ExecutionDetailPageHeaderParts', () => {
  it('renders no addon labels when execution has no status or created time', () => {
    render(<ExecutionDetailTitleRowAddons execution={undefined} />)
    expect(screen.queryByText(/Viewing run/i)).not.toBeInTheDocument()
  })

  it('has no accessibility violations for title row addons with status', async () => {
    const execution = {
      status: 'running' as const,
      created_at: '2024-01-01T00:00:00.000Z',
    } as never
    const { container } = render(<ExecutionDetailTitleRowAddons execution={execution} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no accessibility violations for header toolbar', async () => {
    const queryClient = new QueryClient()
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <ExecutionDetailHeaderToolbar
          showApprovalActionStrip={false}
          isApprovalLoading={false}
          onReviewClick={() => {}}
          historyCardOpen={false}
          onToggleHistory={() => {}}
          onBackToEditor={() => {}}
          isCancellable={false}
          executionId="exec-123"
        />
      </QueryClientProvider>
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('renders cancel button when execution is cancellable', () => {
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <ExecutionDetailHeaderToolbar
          showApprovalActionStrip={false}
          isApprovalLoading={false}
          onReviewClick={() => {}}
          historyCardOpen={false}
          onToggleHistory={() => {}}
          onBackToEditor={() => {}}
          isCancellable={true}
          executionId="exec-123"
        />
      </QueryClientProvider>
    )
    expect(screen.getByRole('button', { name: 'Cancel execution' })).toBeInTheDocument()
  })

  it('does not render cancel button when execution is not cancellable', () => {
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <ExecutionDetailHeaderToolbar
          showApprovalActionStrip={false}
          isApprovalLoading={false}
          onReviewClick={() => {}}
          historyCardOpen={false}
          onToggleHistory={() => {}}
          onBackToEditor={() => {}}
          isCancellable={false}
          executionId="exec-123"
        />
      </QueryClientProvider>
    )
    expect(screen.queryByRole('button', { name: 'Cancel execution' })).not.toBeInTheDocument()
  })

  it('renders status label when execution has status', () => {
    const execution = {
      status: 'running' as const,
    } as never
    render(<ExecutionDetailTitleRowAddons execution={execution} />)
    expect(screen.getByText('Running')).toBeInTheDocument()
  })

  it('renders viewing run label when execution has created_at', () => {
    const execution = {
      created_at: '2024-01-15T10:30:00.000Z',
    } as never
    render(<ExecutionDetailTitleRowAddons execution={execution} />)
    expect(screen.getByText(/Viewing run:/)).toBeInTheDocument()
  })

  it('renders approval action buttons when showApprovalActionStrip is true', () => {
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <ExecutionDetailHeaderToolbar
          showApprovalActionStrip={true}
          isApprovalLoading={false}
          onReviewClick={() => {}}
          historyCardOpen={false}
          onToggleHistory={() => {}}
          onBackToEditor={() => {}}
          isCancellable={false}
          executionId="exec-123"
        />
      </QueryClientProvider>
    )
    expect(screen.getByRole('button', { name: /Review/i })).toBeInTheDocument()
  })

  it('renders cancel and approval buttons together when both applicable', () => {
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <ExecutionDetailHeaderToolbar
          showApprovalActionStrip={true}
          isApprovalLoading={false}
          onReviewClick={() => {}}
          historyCardOpen={true}
          onToggleHistory={() => {}}
          onBackToEditor={() => {}}
          isCancellable={true}
          executionId="exec-123"
        />
      </QueryClientProvider>
    )
    expect(screen.getByRole('button', { name: 'Cancel execution' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Review/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to editor' })).toBeInTheDocument()
  })

  it('renders both status and viewing run label when execution has both', () => {
    const execution = {
      status: 'completed' as const,
      created_at: '2024-01-15T10:30:00.000Z',
    } as never
    render(<ExecutionDetailTitleRowAddons execution={execution} />)
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText(/Viewing run:/)).toBeInTheDocument()
  })
})
