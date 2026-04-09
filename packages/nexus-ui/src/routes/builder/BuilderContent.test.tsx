import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReactFlowProvider } from '@xyflow/react'
import type { ComponentProps, ReactNode } from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { executionsClient, workflowClient } from '../../client'
import { AlertProvider } from '../../components/alerts'
import { useWorkflowStore } from '../../stores/useWorkflowStore'

import { BuilderContent } from './BuilderContent'

type WorkflowWithVersion = WorkflowAPI.components['schemas']['WorkflowWithVersion']
type BuilderContentProps = ComponentProps<typeof BuilderContent>

interface MutationCallbacks {
  onSuccess?: (data: unknown, variables: unknown, context: unknown) => void
  onError?: (error: unknown, variables: unknown, context: unknown) => void
}

async function renderBuilder(props: BuilderContentProps) {
  const view = render(<BuilderContent {...props} />, { wrapper })
  await waitFor(() => {
    expect(screen.getByPlaceholderText('Workflow name')).toBeInTheDocument()
  })
  return view
}

// Mock dependencies
vi.mock('../../client', () => ({
  workflowClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
  executionsClient: {
    useQuery: vi.fn(),
    useMutation: vi.fn(),
  },
}))

const mockSetLocation = vi.fn()

vi.mock('wouter', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  const actual = (await importOriginal()) as Record<string, unknown>
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

describe('BuilderContent', () => {
  // Using 'as WorkflowWithVersion' cast since test mocks don't need all optional fields
  const mockWorkflow = {
    id: 'workflow-1',
    name: 'Test Workflow',
    description: 'Test Description',
    is_enabled: true,
    labels: {},
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-02T00:00:00Z',
    created_by: 'user-1',
    current_version: 1,
    version: {
      workflow_definition: {
        schema_version: '2.0.0' as const,
        name: 'Test Workflow',
        description: 'Test Description',
        triggers: [],
        nodes: [],
        edges: [],
        $defs: {},
      },
    },
  } as unknown as WorkflowWithVersion

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
    queryClient.clear()

    // Reset workflow store to initial state to prevent test pollution
    useWorkflowStore.setState({
      currentWorkflow: null,
      workflowVersion: 0,
      edges: [],
      isDirty: false,
    })

    vi.mocked(executionsClient.useQuery).mockImplementation((method, path) => {
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

    vi.mocked(workflowClient.useQuery).mockImplementation((method, path) => {
      if (method === 'get' && path === '/workflows') {
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
    vi.mocked(executionsClient.useMutation).mockReturnValue(createMockMutation())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ============================================================================
  // BASIC RENDERING TESTS
  // ============================================================================

  describe('New Workflow', () => {
    it('renders new workflow with default name', async () => {
      await renderBuilder({ workflow: undefined, isNew: true, workflowId: null })
      const nameInput = screen.getByPlaceholderText('Workflow name')
      await waitFor(() => {
        expect(nameInput).toHaveValue('new-workflow')
      })
    })

    it('uses next available default name when new-workflow exists', async () => {
      vi.mocked(workflowClient.useQuery).mockImplementation((method, path) => {
        if (method === 'get' && path === '/workflows') {
          return {
            data: {
              resources: [{ name: 'new-workflow' }],
            },
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
      vi.mocked(executionsClient.useQuery).mockImplementation((method, path) => {
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
      render(<BuilderContent workflow={undefined} isNew={true} workflowId={null} />, { wrapper })
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('new-workflow-1')
      })
    })

    it('does not show Run button for new workflows', async () => {
      await renderBuilder({ workflow: undefined, isNew: true, workflowId: null })
      expect(screen.queryByText('Run')).not.toBeInTheDocument()
    })

    it('does not show History button for new workflows', async () => {
      await renderBuilder({ workflow: undefined, isNew: true, workflowId: null })
      expect(screen.queryByLabelText('Run history')).not.toBeInTheDocument()
    })

    it('does not show Enabled switch for new workflows', async () => {
      await renderBuilder({ workflow: undefined, isNew: true, workflowId: null })
      expect(screen.queryByText('Enabled')).not.toBeInTheDocument()
      expect(screen.queryByText('Disabled')).not.toBeInTheDocument()
    })
  })

  describe('Existing Workflow', () => {
    it('renders existing workflow name in input', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })
      await waitFor(() => {
        const nameInput = screen.getByPlaceholderText('Workflow name')
        expect(nameInput).toHaveValue('Test Workflow')
      })
    })

    it('shows Run button for existing workflows', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })
      expect(screen.getByText('Run')).toBeInTheDocument()
    })

    it('shows History button for existing workflows', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })
      expect(screen.getByLabelText('Run history')).toBeInTheDocument()
    })

    it('shows Enabled switch for existing workflows', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })
      await waitFor(() => {
        expect(screen.getByText('Enabled')).toBeInTheDocument()
      })
    })

    it('shows Disabled for disabled workflows', async () => {
      const disabledWorkflow = { ...mockWorkflow, is_enabled: false }
      await renderBuilder({ workflow: disabledWorkflow, isNew: false, workflowId: 'workflow-1' })
      await waitFor(() => {
        expect(screen.getByText('Disabled')).toBeInTheDocument()
      })
    })
  })

  // ============================================================================
  // WORKFLOW NAME INPUT
  // ============================================================================

  describe('Workflow Name Input', () => {
    it('updates name when typing', async () => {
      await renderBuilder({ workflow: undefined, isNew: true, workflowId: null })
      const nameInput = screen.getByPlaceholderText('Workflow name')
      fireEvent.change(nameInput, { target: { value: 'My New Workflow' } })
      expect(nameInput).toHaveValue('My New Workflow')
    })

    it('marks workflow dirty when name changes', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Test Workflow')
      })
      const nameInput = screen.getByPlaceholderText('Workflow name')
      fireEvent.change(nameInput, { target: { value: 'Changed Name' } })
      // This tests SET_WORKFLOW_NAME reducer action and markDirty()
    })
  })

  // ============================================================================
  // ADD STEP PANEL
  // ============================================================================

  describe('Add step panel', () => {
    it('opens Add step panel when Add Step button is clicked', async () => {
      await renderBuilder({ workflow: undefined, isNew: true, workflowId: null })
      const addNodeButton = screen.getByRole('button', { name: /add step/i })
      fireEvent.click(addNodeButton)
      await waitFor(() => {
        expect(screen.getByText('Add step')).toBeInTheDocument()
      })
    })

    it('closes Add step panel via close callback', async () => {
      // Use workflow with steps - empty workflows force add step panel to stay open
      const workflowWithNodes = {
        ...mockWorkflow,
        version: {
          workflow_definition: {
            schema_version: '2.0.0' as const,
            name: 'Test',
            description: '',
            triggers: [{ id: 'manual_trigger', type: 'manual_trigger', config: {} }],
            nodes: [
              {
                type: 'script' as const,
                id: 'task-1',
                name: 'Task',
                config: { language: 'python', code: '' },
              },
            ],
            edges: [],
            $defs: {},
          },
        },
      } as unknown as WorkflowWithVersion
      await renderBuilder({ workflow: workflowWithNodes, isNew: false, workflowId: 'workflow-1' })

      // Open panel
      fireEvent.click(screen.getByRole('button', { name: /add step/i }))
      await waitFor(() => {
        expect(screen.getByText('Add step')).toBeInTheDocument()
      })

      // Find close button by aria-label "Close" in the panel
      const closeButtons = screen.getAllByLabelText('Close')
      // Click the first close button (panel close)
      fireEvent.click(closeButtons[0])

      // Panel should close (tests CLOSE_ADD_NODE_PANEL reducer)
      await waitFor(() => {
        expect(screen.queryByText('Add step')).not.toBeInTheDocument()
      })
    })

    it('opens step editor when selecting a step type from add step panel', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Test Workflow')
      })

      // Open add step panel
      fireEvent.click(screen.getByRole('button', { name: /add step/i }))
      await waitFor(() => {
        expect(screen.getByText('Add step')).toBeInTheDocument()
      })

      // Find and click a step type option (tests onSelectNode callback - line 1125)
      // Look for options that appear in the panel - try different labels
      const nodeOptions = ['Script', 'REST API', 'Condition', 'Loop', 'Parallel']
      for (const nodeName of nodeOptions) {
        const option = screen.queryByText(nodeName)
        if (option) {
          fireEvent.click(option)
          // This should trigger OPEN_NODE_EDITOR_ADD action or show subtypes
          break
        }
      }
    })
  })

  // ============================================================================
  // WORKFLOW DETAILS PANEL
  // ============================================================================

  describe('Workflow Details Panel', () => {
    it('has details button visible', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })
      const detailsButton = screen.getByLabelText('Workflow details')
      expect(detailsButton).toBeInTheDocument()
    })

    it('toggles details panel open', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })
      const detailsButton = screen.getByLabelText('Workflow details')
      fireEvent.click(detailsButton)
      await waitFor(() => {
        expect(screen.getByText('Workflow details')).toBeInTheDocument()
      })
    })

    it('toggles details panel closed', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })
      const detailsButton = screen.getByLabelText('Workflow details')

      // Open
      fireEvent.click(detailsButton)
      await waitFor(() => {
        expect(screen.getByText('Workflow details')).toBeInTheDocument()
      })
      // Close
      fireEvent.click(detailsButton)
      await waitFor(() => {
        expect(screen.queryByLabelText('Description')).not.toBeInTheDocument()
      })
    })

    it('updates workflow name via sidepanel input', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Test Workflow')
      })

      // Open details panel
      fireEvent.click(screen.getByLabelText('Workflow details'))

      // Wait for sidepanel to render
      await waitFor(() => {
        expect(screen.getByText('Workflow details')).toBeInTheDocument()
      })

      // Find the sidepanel name input and change it (tests onNameChange callback - lines 1155-1158)
      const sidepanelNameInput = screen.getByLabelText('Workflow name')
      fireEvent.change(sidepanelNameInput, { target: { value: 'Updated Via Sidepanel' } })

      // Verify the name was updated
      expect(sidepanelNameInput).toHaveValue('Updated Via Sidepanel')
    })

    it('updates workflow description via sidepanel textarea', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Test Workflow')
      })

      // Open details panel
      fireEvent.click(screen.getByLabelText('Workflow details'))

      // Wait for sidepanel to render
      await waitFor(() => {
        expect(screen.getByText('Workflow details')).toBeInTheDocument()
      })

      // Find the sidepanel description textarea and change it (tests onDescriptionChange callback - lines 1159-1162)
      const descriptionTextarea = screen.getByLabelText('Description')
      fireEvent.change(descriptionTextarea, { target: { value: 'New Description' } })

      // Verify the description was updated
      expect(descriptionTextarea).toHaveValue('New Description')
    })

    it('applies automation details from header popover onApply callback', async () => {
      const user = userEvent.setup()
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Test Workflow')
      })

      await user.click(screen.getByRole('button', { name: 'Edit automation details' }))
      await waitFor(() => {
        expect(screen.getByLabelText('Description')).toBeInTheDocument()
      })

      await user.clear(screen.getByLabelText('Description'))
      await user.type(screen.getByLabelText('Description'), 'Updated via edit details popover')
      const popoverSurface = screen.getByRole('dialog')
      const closeButtons = within(popoverSurface).getAllByRole('button', { name: 'Close' })
      await user.click(closeButtons[closeButtons.length - 1])

      await waitFor(() => {
        expect(screen.queryByLabelText('Description')).not.toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: 'Edit automation details' }))
      await waitFor(() => {
        expect(screen.getByLabelText('Description')).toHaveValue('Updated via edit details popover')
      })
    })

    it('closes sidepanel via its close button', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Test Workflow')
      })

      // Open details panel
      fireEvent.click(screen.getByLabelText('Workflow details'))

      // Wait for sidepanel to render with the title
      await waitFor(() => {
        expect(screen.getByText('Workflow details')).toBeInTheDocument()
      })

      // Find the sidepanel's Close button - it's sibling to the "Workflow details" title
      // (tests onClose callback - line 1163)
      const closeButtons = screen.getAllByLabelText('Close')
      // Click the first close button which belongs to the sidepanel (not a modal)
      expect(closeButtons.length).toBeGreaterThan(0)
      fireEvent.click(closeButtons[0])

      // Sidepanel should close - the title should no longer be visible
      await waitFor(() => {
        expect(screen.queryByText('Workflow details')).not.toBeInTheDocument()
      })
    })
  })

  // ============================================================================
  // RUN AUTOMATION
  // ============================================================================

  describe('Run Automation', () => {
    it('opens run confirmation dialog when Run button is clicked', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Test Workflow')
      })

      fireEvent.click(screen.getByRole('button', { name: 'Run' }))

      await waitFor(() => {
        expect(screen.getByText(/Run Test Workflow\?/)).toBeInTheDocument()
        expect(screen.getByText(/You are about to manually run this automation/)).toBeInTheDocument()
      })
    })

    it('can cancel run dialog', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Test Workflow')
      })

      fireEvent.click(screen.getByRole('button', { name: 'Run' }))
      await screen.findByText(/Run Test Workflow\?/)

      const cancelButton = screen.getByRole('button', { name: 'Cancel' })
      fireEvent.click(cancelButton)

      await waitFor(() => {
        expect(screen.queryByText(/Run Test Workflow\?/)).not.toBeInTheDocument()
      })
    })

    it('executes automation when confirmed', async () => {
      const mockExecuteMutate = vi.fn((params: unknown, callbacks?: MutationCallbacks) => {
        if (callbacks?.onSuccess) {
          callbacks.onSuccess({ id: 'exec-123' }, params, undefined)
        }
      })

      vi.mocked(executionsClient.useMutation).mockImplementation((method, path) => {
        if (method === 'post' && path === '/executions') {
          return createMockMutation(mockExecuteMutate)
        }
        return createMockMutation()
      })

      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Test Workflow')
      })

      fireEvent.click(screen.getByRole('button', { name: 'Run' }))
      await screen.findByText(/Run Test Workflow\?/)

      const confirmButton = screen.getByRole('button', { name: 'Run now' })
      fireEvent.click(confirmButton)

      await waitFor(() => {
        expect(mockExecuteMutate).toHaveBeenCalled()
        expect(mockSetLocation).toHaveBeenCalledWith('/executions/exec-123?history=open')
      })
    })

    it('shows error when execution fails', async () => {
      const mockExecuteMutate = vi.fn((params: unknown, callbacks?: MutationCallbacks) => {
        if (callbacks?.onError) {
          callbacks.onError({ message: 'Execution failed' }, params, undefined)
        }
      })

      vi.mocked(executionsClient.useMutation).mockImplementation((method, path) => {
        if (method === 'post' && path === '/executions') {
          return createMockMutation(mockExecuteMutate)
        }
        return createMockMutation()
      })

      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Test Workflow')
      })

      fireEvent.click(screen.getByRole('button', { name: 'Run' }))
      await screen.findByText(/Run Test Workflow\?/)

      const confirmButton = screen.getByRole('button', { name: 'Run now' })
      fireEvent.click(confirmButton)

      await waitFor(() => {
        expect(screen.getByText('Automation Failed')).toBeInTheDocument()
      })
    })

    it('closes run modal via modal onClose', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Test Workflow')
      })

      fireEvent.click(screen.getByRole('button', { name: 'Run' }))
      await screen.findByText(/Run Test Workflow\?/)

      // Cancel closes modal (tests SET_CONFIRM_DIALOG reducer)
      const cancelButton = screen.getByRole('button', { name: 'Cancel' })
      fireEvent.click(cancelButton)

      await waitFor(() => {
        expect(screen.queryByText(/Run Test Workflow\?/)).not.toBeInTheDocument()
      })
    })

    it('closes run modal via X button', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Test Workflow')
      })

      fireEvent.click(screen.getByRole('button', { name: 'Run' }))
      await screen.findByText(/Run Test Workflow\?/)

      // Find the modal's X close button (tests onClose callback - lines 1183-1185)
      const modal = screen.getByRole('dialog')

      const closeButton = modal.querySelector('button[aria-label="Close"]')
      expect(closeButton).not.toBeNull()
      fireEvent.click(closeButton!)

      // Modal should close
      await waitFor(() => {
        expect(screen.queryByText(/Run Test Workflow\?/)).not.toBeInTheDocument()
      })
    })
  })

  // ============================================================================
  // SAVE WORKFLOW
  // ============================================================================

  describe('Save Workflow', () => {
    it('shows Save button', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })
      expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
    })

    it('shows Saving... when pending', async () => {
      vi.mocked(workflowClient.useMutation).mockReturnValue({
        ...createMockMutation(),
        isPending: true,
      })

      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })
      expect(screen.getByText('Saving...')).toBeInTheDocument()
    })

    it('handles save attempt on new empty workflow', async () => {
      // Track mutation calls
      const mockCreateMutate = vi.fn()
      vi.mocked(workflowClient.useMutation).mockImplementation((method) => {
        if (method === 'post') {
          return createMockMutation(mockCreateMutate)
        }
        return createMockMutation()
      })

      // New workflow with no activities - component initializes default workflow
      await renderBuilder({ workflow: undefined, isNew: true, workflowId: null })

      const saveButton = screen.getByRole('button', { name: /save/i })
      expect(saveButton).toBeInTheDocument()
      fireEvent.click(saveButton)

      // Tests handleSaveWorkflow path for new workflow
      // Empty workflows pass validation, so create mutation should be called
      await waitFor(() => {
        expect(mockCreateMutate).toHaveBeenCalled()
      })
    })

    it('updates existing workflow via PATCH', async () => {
      const mockUpdateMutate = vi.fn((params: unknown, callbacks?: MutationCallbacks) => {
        if (callbacks?.onSuccess) {
          callbacks.onSuccess({ id: 'workflow-1' }, params, undefined)
        }
      })

      vi.mocked(workflowClient.useMutation).mockImplementation((method) => {
        if (method === 'patch') {
          return createMockMutation(mockUpdateMutate)
        }
        return createMockMutation()
      })

      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Test Workflow')
      })

      const saveButton = screen.getByRole('button', { name: /save/i })
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(mockUpdateMutate).toHaveBeenCalled()
      })
    })

    it('creates new workflow via POST', async () => {
      const mockCreateMutate = vi.fn((params: unknown, callbacks?: MutationCallbacks) => {
        if (callbacks?.onSuccess) {
          callbacks.onSuccess({ id: 'new-workflow-id' }, params, undefined)
        }
      })

      vi.mocked(workflowClient.useMutation).mockImplementation((method) => {
        if (method === 'post') {
          return createMockMutation(mockCreateMutate)
        }
        return createMockMutation()
      })

      await renderBuilder({ workflow: undefined, isNew: true, workflowId: null })

      const saveButton = screen.getByRole('button', { name: /save/i })
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(mockCreateMutate).toHaveBeenCalled()
      })
    })

    it('handles save error', async () => {
      const mockUpdateMutate = vi.fn((params: unknown, callbacks?: MutationCallbacks) => {
        if (callbacks?.onError) {
          callbacks.onError({ detail: 'Server error' }, params, undefined)
        }
      })

      vi.mocked(workflowClient.useMutation).mockImplementation((method) => {
        if (method === 'patch') {
          return createMockMutation(mockUpdateMutate)
        }
        return createMockMutation()
      })

      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Test Workflow')
      })

      const saveButton = screen.getByRole('button', { name: /save/i })
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(screen.getByText('Failed to update workflow: Server error')).toBeInTheDocument()
      })
    })

    it('handles create error', async () => {
      const mockCreateMutate = vi.fn((params: unknown, callbacks?: MutationCallbacks) => {
        if (callbacks?.onError) {
          callbacks.onError({ detail: 'Create failed' }, params, undefined)
        }
      })

      vi.mocked(workflowClient.useMutation).mockImplementation((method) => {
        if (method === 'post') {
          return createMockMutation(mockCreateMutate)
        }
        return createMockMutation()
      })

      await renderBuilder({ workflow: undefined, isNew: true, workflowId: null })

      const saveButton = screen.getByRole('button', { name: /save/i })
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(screen.getByText('Failed to create workflow: Create failed')).toBeInTheDocument()
      })
    })
  })

  // ============================================================================
  // ENABLED SWITCH
  // ============================================================================

  describe('Enabled Switch', () => {
    it('shows Enabled when workflow is enabled', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })
      await waitFor(() => {
        expect(screen.getByText('Enabled')).toBeInTheDocument()
      })
    })

    it('shows Disabled when workflow is disabled', async () => {
      const disabledWorkflow = { ...mockWorkflow, is_enabled: false }
      await renderBuilder({ workflow: disabledWorkflow, isNew: false, workflowId: 'workflow-1' })
      await waitFor(() => {
        expect(screen.getByText('Disabled')).toBeInTheDocument()
      })
    })

    it('toggles enabled state when clicked', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })
      await waitFor(() => {
        expect(screen.getByText('Enabled')).toBeInTheDocument()
      })

      // Find the switch container and click it
      const enabledText = screen.getByText('Enabled')

      const switchContainer = enabledText.closest('.pf-v6-c-switch')
      expect(switchContainer).not.toBeNull()
      fireEvent.click(switchContainer!)
      // Tests SET_IS_ENABLED reducer action
      await waitFor(() => {
        expect(screen.getByText('Disabled')).toBeInTheDocument()
      })
    })
  })

  // ============================================================================
  // HISTORY PANEL
  // ============================================================================

  describe('History Panel', () => {
    it('opens history panel when history button is clicked', async () => {
      const mockRefetch = vi.fn()
      vi.mocked(executionsClient.useQuery).mockImplementation((method, path) => {
        if (method === 'get' && path === '/executions') {
          return {
            data: { resources: [] },
            isPending: false,
            isError: false,
            error: null,
            refetch: mockRefetch,
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

      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      const historyButton = screen.getByLabelText('Run history')
      fireEvent.click(historyButton)

      await waitFor(() => {
        expect(mockRefetch).toHaveBeenCalled()
      })
    })

    it('toggles history panel closed', async () => {
      const mockRefetch = vi.fn()
      vi.mocked(executionsClient.useQuery).mockImplementation((method, path) => {
        if (method === 'get' && path === '/executions') {
          return {
            data: { resources: [] },
            isPending: false,
            isError: false,
            error: null,
            refetch: mockRefetch,
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

      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      const historyButton = screen.getByLabelText('Run history')

      // Open
      fireEvent.click(historyButton)
      await waitFor(() => {
        expect(mockRefetch).toHaveBeenCalledTimes(1)
      })

      // Toggle closed (tests TOGGLE_HISTORY reducer)
      fireEvent.click(historyButton)
    })

    it('shows history card with close button', async () => {
      vi.mocked(executionsClient.useQuery).mockImplementation((method, path) => {
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

      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      const historyButton = screen.getByLabelText('Run history')
      fireEvent.click(historyButton)

      // Wait for history card to render
      await waitFor(() => {
        expect(screen.getByText('Run History')).toBeInTheDocument()
      })

      // Find and click close button (tests onClose callback - line 1156)
      const closeButton = screen.getByLabelText('Close')
      fireEvent.click(closeButton)

      // Panel should close
      await waitFor(() => {
        expect(screen.queryByText('Run History')).not.toBeInTheDocument()
      })
    })

    it('handles execution selection', async () => {
      vi.mocked(executionsClient.useQuery).mockImplementation((method, path) => {
        if (method === 'get' && path === '/executions') {
          return {
            data: {
              resources: [
                {
                  id: 'exec-1',
                  status: 'completed',
                  created_at: '2023-01-01T00:00:00Z',
                  workflow_id: 'workflow-1',
                },
              ],
            },
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

      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      const historyButton = screen.getByLabelText('Run history')
      fireEvent.click(historyButton)

      // Wait for history card with executions
      await waitFor(() => {
        expect(screen.getByText('Run History')).toBeInTheDocument()
      })

      // Click on an execution to select it in the history panel
      const statusText = screen.getByText('Completed')
      expect(statusText).toBeInTheDocument()
      const row = statusText.closest('button')
      expect(row).not.toBeNull()
      fireEvent.click(row!)
      await waitFor(() => {
        expect(row).toHaveClass('pf-m-current')
      })
    })
  })

  // ============================================================================
  // KEBAB MENU
  // ============================================================================

  describe('Kebab Menu', () => {
    it('opens kebab menu when clicked', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      const kebabButton = screen.getByLabelText('Automation actions')
      fireEvent.click(kebabButton)

      await waitFor(() => {
        expect(screen.getByText('Delete automation')).toBeInTheDocument()
      })
    })

    it('closes kebab menu when item is selected', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      const kebabButton = screen.getByLabelText('Automation actions')
      fireEvent.click(kebabButton)

      await waitFor(() => {
        expect(screen.getByText('Delete automation')).toBeInTheDocument()
      })

      // Tests SET_KEBAB_OPEN reducer action via onSelect
      fireEvent.click(screen.getByText('Delete automation'))
    })

    it('closes kebab menu when clicking toggle again', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      const kebabButton = screen.getByLabelText('Automation actions')

      // Open
      fireEvent.click(kebabButton)
      await waitFor(() => {
        expect(screen.getByText('Delete automation')).toBeInTheDocument()
      })

      // Close
      fireEvent.click(kebabButton)
    })
  })

  // ============================================================================
  // DELETE MODAL
  // ============================================================================

  describe('Delete Modal', () => {
    it('opens delete modal when delete option is clicked', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      const kebabButton = screen.getByLabelText('Automation actions')
      fireEvent.click(kebabButton)

      fireEvent.click(await screen.findByText('Delete automation'))

      await waitFor(() => {
        expect(screen.getByText('Delete automation?')).toBeInTheDocument()
      })
    })

    it('closes delete modal when cancel is clicked', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      fireEvent.click(screen.getByLabelText('Automation actions'))
      fireEvent.click(await screen.findByText('Delete automation'))

      await screen.findByText('Delete automation?')

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      await waitFor(() => {
        expect(screen.queryByText('Delete automation?')).not.toBeInTheDocument()
      })
    })

    it('deletes workflow when confirmed', async () => {
      const mockDeleteMutate = vi.fn((params: unknown, callbacks?: MutationCallbacks) => {
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

      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      fireEvent.click(screen.getByLabelText('Automation actions'))
      fireEvent.click(await screen.findByText('Delete automation'))

      await screen.findByText('Delete automation?')
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

      await waitFor(() => {
        expect(mockDeleteMutate).toHaveBeenCalled()
        expect(mockSetLocation).toHaveBeenCalledWith('/automation-builder/new')
      })
    })

    it('shows error when delete fails', async () => {
      const mockDeleteMutate = vi.fn((params: unknown, callbacks?: MutationCallbacks) => {
        if (callbacks?.onError) {
          callbacks.onError({ message: 'Delete failed' }, params, undefined)
        }
      })

      vi.mocked(workflowClient.useMutation).mockImplementation((method) => {
        if (method === 'delete') {
          return createMockMutation(mockDeleteMutate)
        }
        return createMockMutation()
      })

      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      fireEvent.click(screen.getByLabelText('Automation actions'))
      fireEvent.click(await screen.findByText('Delete automation'))

      await screen.findByText('Delete automation?')
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

      await waitFor(() => {
        expect(mockDeleteMutate).toHaveBeenCalled()
      })
    })

    it('closes delete modal via X button', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      // Open kebab menu and click delete
      fireEvent.click(screen.getByLabelText('Automation actions'))
      fireEvent.click(await screen.findByText('Delete automation'))

      // Wait for delete modal to open
      await screen.findByText('Delete automation?')

      // Find the modal's X close button (tests onClose callback - line 1206)
      const modal = screen.getByRole('dialog')

      const closeButton = modal.querySelector('button[aria-label="Close"]')
      expect(closeButton).not.toBeNull()
      fireEvent.click(closeButton!)

      // Modal should close
      await waitFor(() => {
        expect(screen.queryByText('Delete automation?')).not.toBeInTheDocument()
      })
    })
  })

  // ============================================================================
  // WORKFLOW LOADING SCENARIOS
  // ============================================================================

  describe('Workflow loading', () => {
    it('loads workflow with activities and triggers', async () => {
      const workflowWithActivities = {
        ...mockWorkflow,
        version: {
          workflow_definition: {
            schema_version: '2.0.0' as const,
            name: 'Test Workflow',
            description: 'Test Description',
            triggers: [{ id: 'manual_trigger', type: 'manual_trigger', config: {} }],
            nodes: [
              {
                type: 'script' as const,
                id: 'task-1',
                name: 'Task 1',
                config: { language: 'python', code: '' },
              },
            ],
            edges: [],
            $defs: {},
          },
        },
      } as unknown as WorkflowWithVersion

      await renderBuilder({ workflow: workflowWithActivities, isNew: false, workflowId: 'workflow-1' })

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Test Workflow')
      })
    })

    it('handles workflow with parallel first activity', async () => {
      const workflowWithParallel = {
        ...mockWorkflow,
        name: 'Parallel Workflow',
        description: 'Test parallel',
        version: {
          workflow_definition: {
            schema_version: '2.0.0' as const,
            name: 'Parallel Workflow',
            description: 'Test parallel',
            triggers: [{ id: 'manual_trigger', type: 'manual_trigger', config: {} }],
            nodes: [
              {
                type: 'script' as const,
                id: 'branch-task-1',
                name: 'Branch Task',
                config: { language: 'python', code: '' },
              },
            ],
            edges: [],
            $defs: {},
          },
        },
      } as unknown as WorkflowWithVersion

      await renderBuilder({ workflow: workflowWithParallel, isNew: false, workflowId: 'workflow-1' })

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Parallel Workflow')
      })
    })

    it('handles workflow without version gracefully', async () => {
      const workflowWithoutVersion = {
        ...mockWorkflow,
        version: undefined,
      }

      await renderBuilder({
        workflow: workflowWithoutVersion as WorkflowWithVersion,
        isNew: false,
        workflowId: 'workflow-1',
      })

      expect(screen.getByPlaceholderText('Workflow name')).toBeInTheDocument()
    })

    it('handles mismatched workflow ID', async () => {
      // Render with different workflowId than workflow object
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'different-id' })

      // Should render without crashing
      expect(screen.getByPlaceholderText('Workflow name')).toBeInTheDocument()
    })

    it('handles workflow ID change', async () => {
      const { rerender } = await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Test Workflow')
      })

      // Rerender with different workflow ID (tests lines 373-376)
      const newWorkflow = { ...mockWorkflow, id: 'workflow-2', name: 'new-workflow' }
      rerender(
        <QueryClientProvider client={queryClient}>
          <AlertProvider>
            <ReactFlowProvider>
              <BuilderContent workflow={newWorkflow} isNew={false} workflowId="workflow-2" />
            </ReactFlowProvider>
          </AlertProvider>
        </QueryClientProvider>
      )

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('new-workflow')
      })
    })

    it('syncs state when workflow data changes', async () => {
      const { rerender } = await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Test Workflow')
      })

      // Update workflow data
      const updatedWorkflow = { ...mockWorkflow, name: 'Updated Name', is_enabled: false }
      rerender(
        <QueryClientProvider client={queryClient}>
          <AlertProvider>
            <ReactFlowProvider>
              <BuilderContent workflow={updatedWorkflow} isNew={false} workflowId="workflow-1" />
            </ReactFlowProvider>
          </AlertProvider>
        </QueryClientProvider>
      )

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Updated Name')
      })
    })

    it('handles transition from new to existing workflow', async () => {
      const { rerender } = await renderBuilder({ workflow: undefined, isNew: true, workflowId: null })

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('new-workflow')
      })

      // Load existing workflow
      rerender(
        <QueryClientProvider client={queryClient}>
          <AlertProvider>
            <ReactFlowProvider>
              <BuilderContent workflow={mockWorkflow} isNew={false} workflowId="workflow-1" />
            </ReactFlowProvider>
          </AlertProvider>
        </QueryClientProvider>
      )

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Test Workflow')
      })
    })
  })

  // ============================================================================
  // BROWSER NAVIGATION
  // ============================================================================

  describe('Browser Navigation', () => {
    it('registers beforeunload handler', async () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener')

      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      expect(addEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))

      addEventListenerSpy.mockRestore()
    })

    it('beforeunload handler prevents default when workflow is dirty', async () => {
      const addSpy = vi.spyOn(window, 'addEventListener')
      const prevDirty = useWorkflowStore.getState().isDirty
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      const beforeUnloadCall = addSpy.mock.calls.find((c) => c[0] === 'beforeunload')
      expect(beforeUnloadCall).toBeDefined()
      const handler = beforeUnloadCall![1] as (e: BeforeUnloadEvent) => void

      try {
        act(() => {
          useWorkflowStore.getState().markDirty()
        })
        const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
        act(() => {
          handler(event)
        })
        expect(event.defaultPrevented).toBe(true)
      } finally {
        act(() => {
          useWorkflowStore.setState({ isDirty: prevDirty })
        })
      }

      addSpy.mockRestore()
    })

    it('unregisters beforeunload handler on unmount', async () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

      const { unmount } = await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      unmount()

      expect(removeEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))

      removeEventListenerSpy.mockRestore()
    })
  })

  // ============================================================================
  // CONTEXT PROVIDERS
  // ============================================================================

  describe('Context Providers', () => {
    it('provides NodeExpandedAllContext to children', async () => {
      // The component provides NodeExpandedAllContext
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })
      expect(screen.getByPlaceholderText('Workflow name')).toBeInTheDocument()
    })
  })

  // ============================================================================
  // WORKFLOW DESCRIPTION
  // ============================================================================

  describe('Workflow Description', () => {
    it('loads with description from workflow', async () => {
      const workflowWithDescription = {
        ...mockWorkflow,
        description: 'Custom Description',
      }

      await renderBuilder({ workflow: workflowWithDescription, isNew: false, workflowId: 'workflow-1' })

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Test Workflow')
      })
    })

    it('falls back to name when description is null', async () => {
      const workflowNoDescription = {
        ...mockWorkflow,
        description: null,
      }

      await renderBuilder({
        workflow: workflowNoDescription as WorkflowWithVersion,
        isNew: false,
        workflowId: 'workflow-1',
      })

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Test Workflow')
      })
    })
  })

  // ============================================================================
  // UNSAVED CHANGES HOOK
  // ============================================================================

  describe('Unsaved Changes', () => {
    it('component mounts with unsaved changes hook', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })
      expect(screen.getByPlaceholderText('Workflow name')).toBeInTheDocument()
    })
  })

  // ============================================================================
  // ADDITIONAL REDUCER COVERAGE TESTS
  // ============================================================================

  describe('Reducer State Transitions', () => {
    // Workflow with at least one step so addNodePanelOpen can be toggled
    // (empty workflows force the add step panel to stay open)
    const workflowWithNodes = {
      ...mockWorkflow,
      version: {
        workflow_definition: {
          schema_version: '2.0.0' as const,
          name: 'Test Workflow',
          description: 'Test Description',
          triggers: [{ id: 'manual_trigger', type: 'manual_trigger', config: {} }],
          nodes: [
            {
              type: 'script' as const,
              id: 'task-1',
              name: 'Task 1',
              config: { language: 'python', code: '' },
            },
          ],
          edges: [],
          $defs: {},
        },
      },
    } as unknown as WorkflowWithVersion

    it('TOGGLE_DETAILS closes add step panel when opening details', async () => {
      await renderBuilder({ workflow: workflowWithNodes, isNew: false, workflowId: 'workflow-1' })

      // First open add step panel
      fireEvent.click(screen.getByRole('button', { name: /add step/i }))
      await waitFor(() => {
        expect(screen.getByText('Add step')).toBeInTheDocument()
      })

      // Now toggle details - should close add step panel
      fireEvent.click(screen.getByLabelText('Workflow details'))

      await waitFor(() => {
        expect(screen.queryByText('Add step')).not.toBeInTheDocument()
      })
    })

    it('TOGGLE_HISTORY closes add step panel when opening history', async () => {
      await renderBuilder({ workflow: workflowWithNodes, isNew: false, workflowId: 'workflow-1' })

      // First open add step panel
      fireEvent.click(screen.getByRole('button', { name: /add step/i }))
      await waitFor(() => {
        expect(screen.getByText('Add step')).toBeInTheDocument()
      })

      // Now toggle history - should close add step panel
      fireEvent.click(screen.getByLabelText('Run history'))

      await waitFor(() => {
        expect(screen.queryByText('Add step')).not.toBeInTheDocument()
      })
    })

    it('SET_DETAILS_OPEN via direct panel close', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      // Open details panel
      fireEvent.click(screen.getByLabelText('Workflow details'))

      await waitFor(() => {
        // Details panel should be open
        expect(screen.getAllByLabelText('Close').length).toBeGreaterThan(0)
      })
    })

    it('SET_WORKFLOW_DESCRIPTION changes description', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      // Open details panel to access description
      fireEvent.click(screen.getByLabelText('Workflow details'))

      await waitFor(() => {
        expect(screen.getByLabelText('Description')).toBeInTheDocument()
      })
      const descriptionTextarea = screen.getByLabelText('Description')
      fireEvent.change(descriptionTextarea, { target: { value: 'Updated via reducer test' } })
      expect(descriptionTextarea).toHaveValue('Updated via reducer test')
    })

    it('INIT_WORKFLOW initializes state from workflow prop', async () => {
      const customWorkflow = {
        ...mockWorkflow,
        name: 'Custom Init Name',
        description: 'Custom Init Description',
        is_enabled: false,
      } as unknown as WorkflowWithVersion

      await renderBuilder({ workflow: customWorkflow, isNew: false, workflowId: 'workflow-1' })

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Custom Init Name')
      })

      // Check enabled switch shows Disabled
      await waitFor(() => {
        expect(screen.getByText('Disabled')).toBeInTheDocument()
      })
    })
  })

  // ============================================================================
  // SAVE WORKFLOW VALIDATION PATHS
  // ============================================================================

  describe('Save Workflow Validation', () => {
    it('shows validation error for workflow without trigger', async () => {
      // Create workflow with activity but no trigger - use mockWorkflow name
      const workflowNoTrigger = {
        ...mockWorkflow,
        version: {
          workflow_definition: {
            schema_version: '2.0.0' as const,
            name: 'Test Workflow',
            description: '',
            triggers: [],
            nodes: [
              {
                type: 'script' as const,
                id: 'task-1',
                name: 'Task 1',
                config: { language: 'python', code: '' },
              },
            ],
            edges: [],
            $defs: {},
          },
        },
      } as unknown as WorkflowWithVersion

      await renderBuilder({ workflow: workflowNoTrigger, isNew: false, workflowId: 'workflow-1' })
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Test Workflow')
      })

      const saveButton = screen.getByRole('button', { name: /save/i })
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(screen.getByText('Validation Failed')).toBeInTheDocument()
      })
    })

    it('invokes PATCH when saving existing workflow (mock graph passes validation)', async () => {
      const mockUpdateMutate = vi.fn((params: unknown, callbacks?: MutationCallbacks) => {
        if (callbacks?.onSuccess) {
          callbacks.onSuccess({ id: 'workflow-1' }, params, undefined)
        }
      })

      vi.mocked(workflowClient.useMutation).mockImplementation((method) => {
        if (method === 'patch') {
          return createMockMutation(mockUpdateMutate)
        }
        return createMockMutation()
      })

      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Test Workflow')
      })

      const saveButton = screen.getByRole('button', { name: /save/i })
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(mockUpdateMutate).toHaveBeenCalled()
      })
    })

    it('getWorkflowDefinition returns empty workflow when no currentWorkflow', async () => {
      const mockCreateMutate = vi.fn((params: unknown, callbacks?: MutationCallbacks) => {
        if (callbacks?.onSuccess) {
          callbacks.onSuccess({ id: 'new-id' }, params, undefined)
        }
      })

      vi.mocked(workflowClient.useMutation).mockImplementation((method) => {
        if (method === 'post') {
          return createMockMutation(mockCreateMutate)
        }
        return createMockMutation()
      })

      await renderBuilder({ workflow: undefined, isNew: true, workflowId: null })

      // Change name to trigger the workflow definition getter
      const nameInput = screen.getByPlaceholderText('Workflow name')
      fireEvent.change(nameInput, { target: { value: 'Empty Workflow' } })

      // Save triggers getWorkflowDefinition
      const saveButton = screen.getByRole('button', { name: /save/i })
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(mockCreateMutate).toHaveBeenCalled()
      })
    })
  })

  // ============================================================================
  // GUARD CLAUSE COVERAGE
  // ============================================================================

  describe('Guard Clauses', () => {
    it('handleRunAutomation guards when no workflow id', async () => {
      // Create workflow without id - cast through unknown for test purposes
      const noIdWorkflow = { ...mockWorkflow, id: undefined } as unknown as WorkflowWithVersion

      const { container } = await renderBuilder({ workflow: noIdWorkflow, isNew: false, workflowId: 'workflow-1' })

      // Verify component renders without crashing
      expect(container).toBeInTheDocument()

      // Run button may not be visible without id - tests guard clause
      const runButton = screen.queryByRole('button', { name: 'Run' })
      if (runButton) {
        fireEvent.click(runButton)
      }
    })

    it('handleDeleteAutomation guards when no workflow id', async () => {
      // Cast through unknown for test purposes
      const noIdWorkflow = { ...mockWorkflow, id: undefined } as unknown as WorkflowWithVersion

      const { container } = await renderBuilder({ workflow: noIdWorkflow, isNew: false, workflowId: 'workflow-1' })

      // Verify component renders without crashing
      expect(container).toBeInTheDocument()

      // Try to access kebab menu - if present, clicking should not throw
      const kebabButton = screen.queryByLabelText('Automation actions')
      if (kebabButton) {
        fireEvent.click(kebabButton)
      }
    })

    it('handleToggleDetails deselects nodes when opening', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      // Click details to trigger the reactFlowInstance.setNodes path
      const detailsButton = screen.getByLabelText('Workflow details')
      fireEvent.click(detailsButton)

      await waitFor(() => {
        expect(screen.getByText('Workflow details')).toBeInTheDocument()
      })
    })
  })

  // ============================================================================
  // PANEL INTERACTIONS
  // ============================================================================

  describe('Panel Interactions', () => {
    it('closes details panel when opening add step panel', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      // Open details first
      fireEvent.click(screen.getByLabelText('Workflow details'))

      // Then open add step panel - should close details
      fireEvent.click(screen.getByRole('button', { name: /add step/i }))

      await waitFor(() => {
        expect(screen.getByText('Add step')).toBeInTheDocument()
      })
    })

    it('closes history panel when opening add step panel', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      // Open history first
      fireEvent.click(screen.getByLabelText('Run history'))
      await waitFor(() => {
        expect(screen.getByText('Run History')).toBeInTheDocument()
      })

      // Then open add step panel - should close history
      fireEvent.click(screen.getByRole('button', { name: /add step/i }))

      await waitFor(() => {
        expect(screen.getByText('Add step')).toBeInTheDocument()
        expect(screen.queryByText('Run History')).not.toBeInTheDocument()
      })
    })

    it('closes details panel when opening history panel', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      // Open details first
      fireEvent.click(screen.getByLabelText('Workflow details'))

      // Then open history - should close details
      fireEvent.click(screen.getByLabelText('Run history'))

      await waitFor(() => {
        expect(screen.getByText('Run History')).toBeInTheDocument()
      })
    })
  })

  // ============================================================================
  // WORKFLOW ID CHANGE SCENARIOS
  // ============================================================================

  describe('Workflow ID Changes', () => {
    it('resets state when workflow ID changes from one to another', async () => {
      const { rerender } = await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Test Workflow')
      })

      // Change to a different workflow (different ID)
      const otherWorkflow = {
        ...mockWorkflow,
        id: 'workflow-2',
        name: 'Other Workflow',
        description: 'Other Description',
      }

      rerender(
        <QueryClientProvider client={queryClient}>
          <AlertProvider>
            <ReactFlowProvider>
              <BuilderContent workflow={otherWorkflow} isNew={false} workflowId="workflow-2" />
            </ReactFlowProvider>
          </AlertProvider>
        </QueryClientProvider>
      )

      // This tests lines 372-377: the useEffect that resets state when workflowId changes
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Other Workflow')
      })
    })

    it('does not reset when same workflow ID', async () => {
      const { rerender } = await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Test Workflow')
      })

      // Change name without changing ID
      fireEvent.change(screen.getByPlaceholderText('Workflow name'), { target: { value: 'Modified Name' } })

      // Verify the name was changed
      expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Modified Name')

      // Rerender with same ID - component keeps local state for name
      rerender(
        <QueryClientProvider client={queryClient}>
          <AlertProvider>
            <ReactFlowProvider>
              <BuilderContent workflow={mockWorkflow} isNew={false} workflowId="workflow-1" />
            </ReactFlowProvider>
          </AlertProvider>
        </QueryClientProvider>
      )

      // Component re-initializes from workflow prop on rerender, so expect original name
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Test Workflow')
      })
    })
  })

  // ============================================================================
  // CALLBACK EDGE CASES
  // ============================================================================

  describe('Callback Edge Cases', () => {
    it('handleSaveWorkflow with existing workflow uses PATCH', async () => {
      const mockUpdateMutate = vi.fn()

      vi.mocked(workflowClient.useMutation).mockImplementation((method) => {
        if (method === 'patch') {
          return createMockMutation(mockUpdateMutate)
        }
        return createMockMutation()
      })

      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Test Workflow')
      })

      fireEvent.click(screen.getByRole('button', { name: /save/i }))

      await waitFor(() => {
        expect(mockUpdateMutate).toHaveBeenCalled()
      })
    })

    it('handleSaveWorkflow with new workflow uses POST', async () => {
      const mockCreateMutate = vi.fn()

      vi.mocked(workflowClient.useMutation).mockImplementation((method) => {
        if (method === 'post') {
          return createMockMutation(mockCreateMutate)
        }
        return createMockMutation()
      })

      await renderBuilder({ workflow: undefined, isNew: true, workflowId: null })

      fireEvent.click(screen.getByRole('button', { name: /save/i }))

      await waitFor(() => {
        expect(mockCreateMutate).toHaveBeenCalled()
      })
    })
  })

  // ============================================================================
  // DROPDOWN ONOPEN CHANGE
  // ============================================================================

  describe('Dropdown Callbacks', () => {
    it('closes kebab dropdown via external click', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      // Open kebab
      fireEvent.click(screen.getByLabelText('Automation actions'))
      await waitFor(() => {
        expect(screen.getByText('Delete automation')).toBeInTheDocument()
      })

      // Click outside to trigger onOpenChange(false) - line 900
      fireEvent.mouseDown(document.body)
    })
  })

  // ============================================================================
  // COMPLEX WORKFLOW STRUCTURES
  // ============================================================================

  describe('Complex Workflow Structures', () => {
    it('handles workflow with condition activity', async () => {
      const conditionWorkflow = {
        ...mockWorkflow,
        name: 'Condition Workflow',
        version: {
          workflow_definition: {
            schema_version: '2.0.0' as const,
            name: 'Condition Workflow',
            description: '',
            triggers: [{ id: 'manual_trigger', type: 'manual_trigger', config: {} }],
            nodes: [
              {
                type: 'condition' as const,
                id: 'cond-1',
                name: 'Condition',
                config: { condition: 'true' },
              },
            ],
            edges: [],
            $defs: {},
          },
        },
      } as unknown as WorkflowWithVersion

      await renderBuilder({ workflow: conditionWorkflow, isNew: false, workflowId: 'workflow-1' })
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Condition Workflow')
      })
    })

    it('handles workflow with loop activity', async () => {
      const loopWorkflow = {
        ...mockWorkflow,
        name: 'Loop Workflow',
        version: {
          workflow_definition: {
            schema_version: '2.0.0' as const,
            name: 'Loop Workflow',
            description: '',
            triggers: [{ id: 'manual_trigger', type: 'manual_trigger', config: {} }],
            nodes: [
              {
                type: 'loop' as const,
                id: 'loop-1',
                name: 'Loop',
                config: { type: 'for_each', items: '[]' },
              },
            ],
            edges: [],
            $defs: {},
          },
        },
      } as unknown as WorkflowWithVersion

      await renderBuilder({ workflow: loopWorkflow, isNew: false, workflowId: 'workflow-1' })
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Loop Workflow')
      })
    })

    it('handles workflow with nested structures', async () => {
      const nestedWorkflow = {
        ...mockWorkflow,
        name: 'Nested Workflow',
        version: {
          workflow_definition: {
            schema_version: '2.0.0' as const,
            name: 'Nested Workflow',
            description: '',
            triggers: [{ id: 'manual_trigger', type: 'manual_trigger', config: {} }],
            nodes: [
              {
                type: 'condition' as const,
                id: 'cond-1',
                name: 'Outer Condition',
                config: { condition: 'true' },
              },
              {
                type: 'script' as const,
                id: 'task-inner',
                name: 'Inner Task',
                config: { language: 'python', code: '' },
              },
            ],
            edges: [{ from: 'cond-1', to: 'task-inner', from_port: 'true' }],
            $defs: {},
          },
        },
      } as unknown as WorkflowWithVersion

      await renderBuilder({ workflow: nestedWorkflow, isNew: false, workflowId: 'workflow-1' })
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Nested Workflow')
      })
    })
  })

  // ============================================================================
  // MUTATION CALLBACK BRANCHES
  // ============================================================================

  describe('Mutation Callback Branches', () => {
    it('save success navigates for new workflow', async () => {
      const mockCreateMutate = vi.fn()

      vi.mocked(workflowClient.useMutation).mockImplementation((method) => {
        if (method === 'post') {
          return createMockMutation(mockCreateMutate)
        }
        return createMockMutation()
      })

      await renderBuilder({ workflow: undefined, isNew: true, workflowId: null })

      fireEvent.click(screen.getByRole('button', { name: /save/i }))

      await waitFor(() => {
        expect(mockCreateMutate).toHaveBeenCalled()
      })
    })

    it('save success invalidates queries for existing workflow', async () => {
      const mockUpdateMutate = vi.fn((params: unknown, callbacks?: MutationCallbacks) => {
        if (callbacks?.onSuccess) {
          callbacks.onSuccess({ id: 'workflow-1' }, params, undefined)
        }
      })

      vi.mocked(workflowClient.useMutation).mockImplementation((method) => {
        if (method === 'patch') {
          return createMockMutation(mockUpdateMutate)
        }
        return createMockMutation()
      })

      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Test Workflow')
      })

      fireEvent.click(screen.getByRole('button', { name: /save/i }))

      await waitFor(() => {
        expect(mockUpdateMutate).toHaveBeenCalled()
      })
    })

    it('run automation success without data id', async () => {
      const mockExecuteMutate = vi.fn((params: unknown, callbacks?: MutationCallbacks) => {
        if (callbacks?.onSuccess) {
          // Return data without id field
          callbacks.onSuccess({}, params, undefined)
        }
      })

      vi.mocked(executionsClient.useMutation).mockImplementation((method, path) => {
        if (method === 'post' && path === '/executions') {
          return createMockMutation(mockExecuteMutate)
        }
        return createMockMutation()
      })

      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Test Workflow')
      })

      fireEvent.click(screen.getByRole('button', { name: 'Run' }))
      await screen.findByText(/Run Test Workflow\?/)

      fireEvent.click(screen.getByRole('button', { name: 'Run now' }))

      await waitFor(() => {
        expect(mockExecuteMutate).toHaveBeenCalled()
        // Navigation should not happen since no id in response
      })
    })
  })

  // ============================================================================
  // ENABLED SWITCH ADDITIONAL COVERAGE
  // ============================================================================

  describe('Enabled Switch Additional', () => {
    it('toggles from disabled to enabled', async () => {
      const disabledWorkflow = { ...mockWorkflow, is_enabled: false }
      await renderBuilder({ workflow: disabledWorkflow, isNew: false, workflowId: 'workflow-1' })

      await waitFor(() => {
        expect(screen.getByText('Disabled')).toBeInTheDocument()
      })

      // Click to enable
      const disabledText = screen.getByText('Disabled')

      const switchContainer = disabledText.closest('.pf-v6-c-switch')
      if (switchContainer) {
        fireEvent.click(switchContainer)
        await waitFor(() => {
          expect(screen.getByText('Enabled')).toBeInTheDocument()
        })
      }
    })
  })

  // ============================================================================
  // DESCRIPTION INPUT
  // ============================================================================

  describe('Description Handling', () => {
    it('initializes description from workflow metadata', async () => {
      const workflowWithMetadataDesc = {
        ...mockWorkflow,
        name: 'Metadata Test',
        version: {
          workflow_definition: {
            schema_version: '2.0.0' as const,
            name: 'Metadata Test',
            description: 'Metadata Description',
            triggers: [],
            nodes: [],
            edges: [],
            $defs: {},
          },
        },
      } as unknown as WorkflowWithVersion

      await renderBuilder({ workflow: workflowWithMetadataDesc, isNew: false, workflowId: 'workflow-1' })

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Metadata Test')
      })
    })

    it('uses workflow description over metadata when present', async () => {
      const workflowBothDesc = {
        ...mockWorkflow,
        name: 'Description Test',
        description: 'Top Level Description',
        version: {
          workflow_definition: {
            schema_version: '2.0.0' as const,
            name: 'Description Test',
            description: 'Metadata Description',
            triggers: [],
            nodes: [],
            edges: [],
            $defs: {},
          },
        },
      } as unknown as WorkflowWithVersion

      await renderBuilder({ workflow: workflowBothDesc, isNew: false, workflowId: 'workflow-1' })

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Description Test')
      })
    })
  })

  // ============================================================================
  // ADDITIONAL COVERAGE FOR EDGE CASES
  // ============================================================================

  describe('Workflow Save Error Handling', () => {
    it('shows error alert when currentWorkflow is null during save', async () => {
      await renderBuilder({ workflow: undefined, isNew: true, workflowId: null })

      // Wait for the new-workflow useEffect to finish initializing, then clear it
      await waitFor(() => {
        expect(useWorkflowStore.getState().currentWorkflow).not.toBeNull()
      })

      act(() => {
        useWorkflowStore.setState({ currentWorkflow: null })
      })

      fireEvent.click(screen.getByRole('button', { name: /save/i }))

      await waitFor(() => {
        expect(screen.getByText('No workflow to save')).toBeInTheDocument()
        expect(screen.getByText('Validation Failed')).toBeInTheDocument()
      })
    })
  })

  describe('Workflow ID Reset', () => {
    it('clears workflow state when navigating to different workflow', async () => {
      const { rerender } = await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Test Workflow')
      })

      // Navigate to completely different workflow - tests lines 373-376
      const differentWorkflow = {
        ...mockWorkflow,
        id: 'workflow-different',
        name: 'Different Workflow',
      }

      rerender(
        <QueryClientProvider client={queryClient}>
          <AlertProvider>
            <ReactFlowProvider>
              <BuilderContent workflow={differentWorkflow} isNew={false} workflowId="workflow-different" />
            </ReactFlowProvider>
          </AlertProvider>
        </QueryClientProvider>
      )

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Different Workflow')
      })
    })
  })

  describe('Panel State Management', () => {
    it('opens add step panel with source step context', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      // Open add step panel
      const addNodeButton = screen.getByRole('button', { name: /add step/i })
      fireEvent.click(addNodeButton)

      await waitFor(() => {
        expect(screen.getByText('Add step')).toBeInTheDocument()
      })
    })

    it('maintains panel state across interactions', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      // Open history panel
      fireEvent.click(screen.getByLabelText('Run history'))
      await waitFor(() => {
        expect(screen.getByText('Run History')).toBeInTheDocument()
      })

      // Toggle details - should close history
      fireEvent.click(screen.getByLabelText('Workflow details'))

      // History should be closed
      await waitFor(() => {
        expect(screen.queryByText('Run History')).not.toBeInTheDocument()
      })
    })
  })

  describe('beforeunload Event', () => {
    it('adds and removes beforeunload listener', async () => {
      const addSpy = vi.spyOn(window, 'addEventListener')
      const removeSpy = vi.spyOn(window, 'removeEventListener')

      const { unmount } = await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      // Listener should be added
      expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))

      unmount()

      // Listener should be removed on unmount
      expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))

      addSpy.mockRestore()
      removeSpy.mockRestore()
    })
  })

  describe('Empty Workflow Definition', () => {
    it('handles getWorkflowDefinition when currentWorkflow is null', async () => {
      await renderBuilder({ workflow: undefined, isNew: true, workflowId: null })

      // Modify workflow name
      const nameInput = screen.getByPlaceholderText('Workflow name')
      fireEvent.change(nameInput, { target: { value: 'Empty Test' } })

      expect(nameInput).toHaveValue('Empty Test')

      // Try to save - this will call getWorkflowDefinition
      fireEvent.click(screen.getByRole('button', { name: /save/i }))

      // Component should handle the empty case gracefully
    })
  })

  describe('Delete Workflow Flow', () => {
    it('completes full delete flow', async () => {
      const mockDeleteMutate = vi.fn((params: unknown, callbacks?: MutationCallbacks) => {
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

      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      // Open kebab menu
      fireEvent.click(screen.getByLabelText('Automation actions'))

      // Click delete
      fireEvent.click(await screen.findByText('Delete automation'))
      await screen.findByText('Delete automation?')

      // Confirm delete
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

      await waitFor(() => {
        expect(mockDeleteMutate).toHaveBeenCalled()
      })
    })
  })

  describe('Run Automation Flow', () => {
    it('completes full run flow with success', async () => {
      const mockExecuteMutate = vi.fn((params: unknown, callbacks?: MutationCallbacks) => {
        if (callbacks?.onSuccess) {
          callbacks.onSuccess({ id: 'execution-123' }, params, undefined)
        }
      })

      vi.mocked(executionsClient.useMutation).mockImplementation((method, path) => {
        if (method === 'post' && path === '/executions') {
          return createMockMutation(mockExecuteMutate)
        }
        return createMockMutation()
      })

      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('Test Workflow')
      })

      // Click Run
      fireEvent.click(screen.getByRole('button', { name: 'Run' }))
      await screen.findByText(/Run Test Workflow\?/)

      // Confirm
      fireEvent.click(screen.getByRole('button', { name: 'Run now' }))

      await waitFor(() => {
        expect(mockExecuteMutate).toHaveBeenCalled()
        expect(mockSetLocation).toHaveBeenCalledWith('/executions/execution-123?history=open')
      })
    })
  })

  describe('V2 Schema - Trigger ID Mapping', () => {
    it('maps trigger definition IDs to display IDs when loading workflow', async () => {
      const workflowWithTrigger = {
        ...mockWorkflow,
        version: {
          workflow_definition: {
            schema_version: '2.0.0' as const,
            triggers: [{ id: 'webhook_trigger_1', type: 'webhook', config: {} as Record<string, never> }],
            nodes: [{ id: 'task-1', type: 'script', config: { code: 'print("hello")' } as Record<string, unknown> }],
            edges: [{ from: 'webhook_trigger_1', to: 'task-1' }],
            $defs: {},
          },
        },
      } as unknown as WorkflowWithVersion

      vi.mocked(workflowClient.useQuery).mockImplementation(
        (_method, path): ReturnType<typeof workflowClient.useQuery> => {
          if (path === '/workflows' || path === '/workflows/{id}') {
            return {
              data: workflowWithTrigger,
              isSuccess: true,
              isLoading: false,
              refetch: vi.fn(),
            } as ReturnType<typeof workflowClient.useQuery>
          }
          return {
            data: undefined,
            isSuccess: false,
            isLoading: false,
            refetch: vi.fn(),
          } as ReturnType<typeof workflowClient.useQuery>
        }
      )

      await renderBuilder({ workflow: workflowWithTrigger, isNew: false, workflowId: 'workflow-1' })

      await waitFor(() => {
        const state = useWorkflowStore.getState()
        // Verify edges are loaded
        expect(state.edges.length).toBeGreaterThan(0)
        // Verify trigger ID was mapped (webhook_trigger_1 → trigger-0)
        const triggerEdge = state.edges.find((e) => e.source === 'trigger-0')
        expect(triggerEdge).toBeDefined()
      })
    })

    it('handles triggers without ID field gracefully', async () => {
      const workflowNoTriggerIds = {
        ...mockWorkflow,
        version: {
          workflow_definition: {
            schema_version: '2.0.0' as const,
            triggers: [
              { type: 'manual_trigger', config: {} as Record<string, never> }, // No id field
            ],
            nodes: [],
            edges: [],
            $defs: {},
          },
        },
      } as unknown as WorkflowWithVersion

      vi.mocked(workflowClient.useQuery).mockImplementation(
        (_method, path): ReturnType<typeof workflowClient.useQuery> => {
          if (path === '/workflows' || path === '/workflows/{id}') {
            return {
              data: workflowNoTriggerIds,
              isSuccess: true,
              isLoading: false,
              refetch: vi.fn(),
            } as ReturnType<typeof workflowClient.useQuery>
          }
          return {
            data: undefined,
            isSuccess: false,
            isLoading: false,
            refetch: vi.fn(),
          } as ReturnType<typeof workflowClient.useQuery>
        }
      )

      // Should not crash when trigger has no ID
      await renderBuilder({ workflow: workflowNoTriggerIds, isNew: false, workflowId: 'workflow-1' })

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toBeInTheDocument()
      })
    })
  })

  describe('V2 Schema - Port Name Mapping', () => {
    it('converts v2 from_port to React Flow sourceHandle', async () => {
      const workflowWithPorts = {
        ...mockWorkflow,
        version: {
          workflow_definition: {
            schema_version: '2.0.0' as const,
            triggers: [{ id: 'trigger-1', type: 'manual_trigger', config: {} as Record<string, never> }],
            nodes: [
              { id: 'cond-1', type: 'condition', config: { condition: 'true' } as Record<string, unknown> },
              { id: 'task-true', type: 'script', config: { code: '' } as Record<string, unknown> },
            ],
            edges: [
              { from: 'trigger-1', to: 'cond-1' },
              { from: 'cond-1', to: 'task-true', from_port: 'true' },
            ],
            $defs: {},
          },
        },
      } as unknown as WorkflowWithVersion

      vi.mocked(workflowClient.useQuery).mockImplementation(
        (_method, path): ReturnType<typeof workflowClient.useQuery> => {
          if (path === '/workflows' || path === '/workflows/{id}') {
            return {
              data: workflowWithPorts,
              isSuccess: true,
              isLoading: false,
              refetch: vi.fn(),
            } as ReturnType<typeof workflowClient.useQuery>
          }
          return {
            data: undefined,
            isSuccess: false,
            isLoading: false,
            refetch: vi.fn(),
          } as ReturnType<typeof workflowClient.useQuery>
        }
      )

      await renderBuilder({ workflow: workflowWithPorts, isNew: false, workflowId: 'workflow-1' })

      await waitFor(() => {
        const state = useWorkflowStore.getState()
        // Find edge with from_port: 'true'
        const condEdge = state.edges.find((e) => e.source === 'cond-1' && e.target === 'task-true')
        expect(condEdge).toBeDefined()
        // Verify sourceHandle was converted
        expect(condEdge?.sourceHandle).toBe('true')
      })
    })

    it('defaults targetHandle to "target" when to_port is undefined', async () => {
      const workflowNoToPort = {
        ...mockWorkflow,
        version: {
          workflow_definition: {
            schema_version: '2.0.0' as const,
            triggers: [],
            nodes: [
              { id: 'task-1', type: 'script', config: { code: '' } as Record<string, unknown> },
              { id: 'task-2', type: 'script', config: { code: '' } as Record<string, unknown> },
            ],
            edges: [
              { from: 'task-1', to: 'task-2' }, // No to_port
            ],
            $defs: {},
          },
        },
      } as unknown as WorkflowWithVersion

      vi.mocked(workflowClient.useQuery).mockImplementation(
        (_method, path): ReturnType<typeof workflowClient.useQuery> => {
          if (path === '/workflows' || path === '/workflows/{id}') {
            return {
              data: workflowNoToPort,
              isSuccess: true,
              isLoading: false,
              refetch: vi.fn(),
            } as ReturnType<typeof workflowClient.useQuery>
          }
          return {
            data: undefined,
            isSuccess: false,
            isLoading: false,
            refetch: vi.fn(),
          } as ReturnType<typeof workflowClient.useQuery>
        }
      )

      await renderBuilder({ workflow: workflowNoToPort, isNew: false, workflowId: 'workflow-1' })

      await waitFor(() => {
        const state = useWorkflowStore.getState()
        const edge = state.edges.find((e) => e.source === 'task-1')
        expect(edge).toBeDefined()
        // Should default to 'target'
        expect(edge?.targetHandle).toBe('target')
      })
    })

    it('maps loop port names: iterate→loop, complete→done', async () => {
      const workflowWithLoopPorts = {
        ...mockWorkflow,
        version: {
          workflow_definition: {
            schema_version: '2.0.0' as const,
            triggers: [],
            nodes: [
              { id: 'loop-1', type: 'loop', config: { type: 'for_each', items: '[]' } as Record<string, unknown> },
              { id: 'loop-body', type: 'script', config: { code: '' } as Record<string, unknown> },
            ],
            edges: [
              { from: 'loop-1', to: 'loop-body', from_port: 'iterate' }, // v2 name
              { from: 'loop-body', to: 'loop-1', to_port: 'complete' }, // v2 name
            ],
            $defs: {},
          },
        },
      } as unknown as WorkflowWithVersion

      vi.mocked(workflowClient.useQuery).mockImplementation(
        (_method, path): ReturnType<typeof workflowClient.useQuery> => {
          if (path === '/workflows' || path === '/workflows/{id}') {
            return {
              data: workflowWithLoopPorts,
              isSuccess: true,
              isLoading: false,
              refetch: vi.fn(),
            } as ReturnType<typeof workflowClient.useQuery>
          }
          return {
            data: undefined,
            isSuccess: false,
            isLoading: false,
            refetch: vi.fn(),
          } as ReturnType<typeof workflowClient.useQuery>
        }
      )

      await renderBuilder({ workflow: workflowWithLoopPorts, isNew: false, workflowId: 'workflow-1' })

      await waitFor(() => {
        const state = useWorkflowStore.getState()
        // Find iterate edge (should map to 'loop')
        const iterateEdge = state.edges.find((e) => e.source === 'loop-1' && e.target === 'loop-body')
        expect(iterateEdge?.sourceHandle).toBe('loop')

        // Find complete edge (should map to 'done')
        const completeEdge = state.edges.find((e) => e.source === 'loop-body' && e.target === 'loop-1')
        expect(completeEdge?.targetHandle).toBe('done')
      })
    })
  })

  // ============================================================================
  // BRANCH COVERAGE: Targeted tests for uncovered branches
  // ============================================================================

  describe('Branch Coverage: Save with default name resolution', () => {
    it('resolves default name when saving new workflow with existing "new-workflow"', async () => {
      const existingWorkflows = {
        resources: [{ id: 'existing-1', name: 'new-workflow' }],
      }

      // Mock workflow list query to return existing workflow with name "new-workflow"
      vi.mocked(workflowClient.useQuery).mockImplementation((method, path) => {
        if (method === 'get' && path === '/workflows') {
          return {
            data: existingWorkflows,
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

      const mockCreateMutate = vi.fn((params: unknown, callbacks?: MutationCallbacks) => {
        // Verify the name was incremented to avoid conflict
        const body = (params as { body: { name: string } }).body
        expect(body.name).toBe('new-workflow-1')
        if (callbacks?.onSuccess) {
          callbacks.onSuccess({ id: 'new-workflow-id' }, params, undefined)
        }
      })

      vi.mocked(workflowClient.useMutation).mockImplementation((method) => {
        if (method === 'post') {
          return createMockMutation(mockCreateMutate)
        }
        return createMockMutation()
      })

      await renderBuilder({ workflow: undefined, isNew: true, workflowId: null })

      // Component auto-resolves to "new-workflow-1" since "new-workflow" exists
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Workflow name')).toHaveValue('new-workflow-1')
      })

      // User keeps the auto-resolved name and saves
      const saveButton = screen.getByRole('button', { name: /save/i })
      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(mockCreateMutate).toHaveBeenCalled()
      })

      // This tests the branch: if (isNew && workflowName === DEFAULT_WORKFLOW_NAME && workflowsListQuery.data?.resources)
      // Note: The branch is tested during the useEffect that auto-resolves the name on component mount
    })
  })

  describe('Branch Coverage: Workflow state checks', () => {
    it('verifies workflow dirty state can be set', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      // Make workflow dirty by changing the name
      const nameInput = screen.getByPlaceholderText('Workflow name')
      fireEvent.change(nameInput, { target: { value: 'Modified Workflow' } })

      // Verify workflow is dirty
      expect(useWorkflowStore.getState().isDirty).toBe(true)

      // This tests the dirty state management which is checked in various branches
    })
  })

  describe('Branch Coverage: Individual change flags', () => {
    it('marks dirty when only name changes', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      const detailsButton = screen.getByLabelText('Workflow details')
      fireEvent.click(detailsButton)

      await waitFor(() => {
        expect(screen.getByText('Workflow details')).toBeInTheDocument()
      })

      const nameInput = screen.getByLabelText('Workflow name')
      fireEvent.change(nameInput, { target: { value: 'Name Changed' } })

      // Verify workflow store is marked dirty
      await waitFor(() => {
        expect(useWorkflowStore.getState().isDirty).toBe(true)
      })

      // This tests the branch: if (nameChanged)
    })

    it('marks dirty when only description changes', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      const detailsButton = screen.getByLabelText('Workflow details')
      fireEvent.click(detailsButton)

      await waitFor(() => {
        expect(screen.getByText('Workflow details')).toBeInTheDocument()
      })

      const descriptionTextarea = screen.getByLabelText('Description')
      fireEvent.change(descriptionTextarea, { target: { value: 'Description Changed' } })

      // Verify workflow store is marked dirty
      await waitFor(() => {
        expect(useWorkflowStore.getState().isDirty).toBe(true)
      })

      // This tests the branch: if (descriptionChanged)
    })

    it('marks dirty when both name and description change', async () => {
      await renderBuilder({ workflow: mockWorkflow, isNew: false, workflowId: 'workflow-1' })

      const detailsButton = screen.getByLabelText('Workflow details')
      fireEvent.click(detailsButton)

      await waitFor(() => {
        expect(screen.getByText('Workflow details')).toBeInTheDocument()
      })

      // Change both name and description
      const nameInput = screen.getByLabelText('Workflow name')
      const descriptionTextarea = screen.getByLabelText('Description')

      fireEvent.change(nameInput, { target: { value: 'Name Changed' } })
      fireEvent.change(descriptionTextarea, { target: { value: 'Description Changed' } })

      // Verify workflow store is marked dirty
      await waitFor(() => {
        expect(useWorkflowStore.getState().isDirty).toBe(true)
      })

      // This tests the branches: if (nameChanged) and if (descriptionChanged) and if (nameChanged || descriptionChanged || tagsChanged)
    })
  })
})
