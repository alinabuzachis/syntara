import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { workflowClient } from '../../client'
import { AlertProvider } from '../../components/alerts'

import { BuilderContent } from './BuilderContent'

// Mock dependencies
vi.mock('../../client', () => ({
  workflowClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
}))

const mockSetLocation = vi.fn()

vi.mock('wouter', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useLocation: () => ['/automation-builder/workflow-1', mockSetLocation],
  }
})

vi.mock('../../app/useUnsavedChanges', () => ({
  useUnsavedChanges: () => ({
    registerSaveHandler: vi.fn(),
    unregisterSaveHandler: vi.fn(),
  }),
}))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <AlertProvider>
      <ReactFlowProvider>{children}</ReactFlowProvider>
    </AlertProvider>
  </QueryClientProvider>
)

describe('BuilderContent - Delete Automation', () => {
  const mockWorkflow = {
    id: 'workflow-1',
    name: 'Test Workflow',
    description: 'Test Description',
    is_enabled: true,
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-01-02T00:00:00Z',
    createdBy: 'user-1',
    current_version: 1,
    version: {
      workflow_definition: {
        schemaVersion: '1.0.0',
        version: 1,
        metadata: {
          name: 'Test Workflow',
          description: 'Test Description',
        },
        triggers: [],
        workflow: {
          activities: [],
        },
      },
    },
  }

  const createMockMutation = (mutate = vi.fn()) => ({
    mutate,
    mutateAsync: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    isIdle: true,
    error: null,
    data: undefined,
    variables: undefined,
    context: undefined,
    failureCount: 0,
    failureReason: null,
    status: 'idle' as const,
    submittedAt: 0,
  })

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(workflowClient.useQuery).mockImplementation((method, path) => {
      if (method === 'get' && path === '/executions') {
        return {
          data: { resources: [] },
          isPending: false,
          isError: false,
          error: null,
          refetch: vi.fn(),
        }
      }
      return {
        data: undefined,
        isPending: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      }
    })

    vi.mocked(workflowClient.useMutation).mockReturnValue(createMockMutation())
  })

  it('shows delete button in kebab menu for existing workflows', () => {
    render(<BuilderContent workflow={mockWorkflow} isNew={false} workflowId="workflow-1" />, { wrapper })

    // Find and click kebab menu
    const kebabButton = screen.getByLabelText('Automation actions')
    fireEvent.click(kebabButton)

    // Verify delete option exists
    expect(screen.getByText('Delete automation')).toBeInTheDocument()
  })

  it('does not show delete button for new workflows', () => {
    render(<BuilderContent workflow={undefined} isNew={true} workflowId={null} />, { wrapper })

    // Kebab menu should not exist for new workflows
    expect(screen.queryByLabelText('Automation actions')).not.toBeInTheDocument()
  })

  it('opens delete confirmation modal when delete is clicked', async () => {
    render(<BuilderContent workflow={mockWorkflow} isNew={false} workflowId="workflow-1" />, { wrapper })

    // Open kebab menu
    const kebabButton = screen.getByLabelText('Automation actions')
    fireEvent.click(kebabButton)

    // Click delete
    const deleteItem = screen.getByText('Delete automation')
    fireEvent.click(deleteItem)

    // Verify modal appears
    await waitFor(() => {
      expect(screen.getByText('Delete automation?')).toBeInTheDocument()
      expect(screen.getByText(/You are about to permanently delete this automation/)).toBeInTheDocument()
      expect(screen.getByText(/This automation will stop running immediately/)).toBeInTheDocument()
    })
  })

  it('deletes automation and navigates to new workflow page', async () => {
    const mockDeleteMutate = vi.fn((params, callbacks) => {
      if (callbacks?.onSuccess) {
        callbacks.onSuccess(undefined, params, undefined)
      }
    })

    vi.mocked(workflowClient.useMutation).mockImplementation((method) => {
      if (method === 'delete') {
        return createMockMutation(mockDeleteMutate)
      }
      return createMockMutation()
    })

    render(<BuilderContent workflow={mockWorkflow} isNew={false} workflowId="workflow-1" />, { wrapper })

    // Open kebab and click delete
    const kebabButton = screen.getByLabelText('Automation actions')
    fireEvent.click(kebabButton)
    fireEvent.click(screen.getByText('Delete automation'))

    // Confirm deletion
    await waitFor(() => screen.getByText('Delete automation?'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    // Verify deletion and navigation
    await waitFor(() => {
      expect(mockDeleteMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { path: { workflowId: 'workflow-1' } },
        }),
        expect.any(Object)
      )
      expect(mockSetLocation).toHaveBeenCalledWith('/automation-builder/new')
      expect(screen.getByText('Automation Deleted')).toBeInTheDocument()
    })
  })

  it('handles delete error and shows error alert', async () => {
    const mockError = { message: 'Cannot delete workflow with active executions' }
    const mockDeleteMutate = vi.fn((params, callbacks) => {
      if (callbacks?.onError) {
        callbacks.onError(mockError, params, undefined)
      }
    })

    vi.mocked(workflowClient.useMutation).mockImplementation((method) => {
      if (method === 'delete') {
        return createMockMutation(mockDeleteMutate)
      }
      return createMockMutation()
    })

    render(<BuilderContent workflow={mockWorkflow} isNew={false} workflowId="workflow-1" />, { wrapper })

    // Open kebab and click delete
    fireEvent.click(screen.getByLabelText('Automation actions'))
    fireEvent.click(screen.getByText('Delete automation'))

    // Confirm deletion
    await waitFor(() => screen.getByText('Delete automation?'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    // Verify error alert
    await waitFor(() => {
      expect(mockDeleteMutate).toHaveBeenCalled()
      expect(screen.getByText('Delete Failed')).toBeInTheDocument()
      expect(screen.getByText(/Failed to delete automation/)).toBeInTheDocument()
    })
  })

  it('can cancel delete operation', async () => {
    render(<BuilderContent workflow={mockWorkflow} isNew={false} workflowId="workflow-1" />, { wrapper })

    // Open kebab and click delete
    fireEvent.click(screen.getByLabelText('Automation actions'))
    fireEvent.click(screen.getByText('Delete automation'))

    // Modal appears, then cancel
    await waitFor(() => screen.getByText('Delete automation?'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    // Modal closes
    await waitFor(() => {
      expect(screen.queryByText('Delete automation?')).not.toBeInTheDocument()
    })
  })
})
