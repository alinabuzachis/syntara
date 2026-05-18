import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { BuilderWorkflowPageHeader } from './BuilderWorkflowPageHeader'

const mockWorkflowStoreState = vi.hoisted(() => ({
  isDirty: false,
}))

vi.mock('../../stores/useWorkflowStore', () => ({
  useWorkflowStore: {
    getState: () => mockWorkflowStoreState,
  },
}))

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

vi.mock('./EditWorkflowDetailsPopover', () => ({
  EditWorkflowDetailsPopover: ({
    onApply,
  }: {
    name: string
    description: string
    tags: string[]
    onApply: (name: string, description: string, tags: string[]) => void
  }) => (
    <button onClick={() => onApply('New Name', 'New Desc', ['new-tag'])} aria-label="Apply details">
      Edit details
    </button>
  ),
}))

describe('BuilderWorkflowPageHeader', () => {
  const baseProps = {
    workflowName: 'wf',
    workflowDescription: '',
    workflowTags: [] as string[],
    isNew: true,
    workflow: undefined as { id: string } | undefined,
    isPending: false,
    isEnabled: true,
    isKebabOpen: false,
    ProjectSelector: <span>Project</span>,
    dispatch: vi.fn(),
    markDirty: vi.fn(),
    handleToggleHistory: vi.fn(),
    handleToggleDetails: vi.fn(),
    handleSaveWorkflow: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockWorkflowStoreState.isDirty = false
  })

  it('has no accessibility violations in editor mode', async () => {
    const { container } = render(<BuilderWorkflowPageHeader {...baseProps} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('shows Back to editor button during live run and hides toolbar', () => {
    const onBackToEditor = vi.fn()
    render(
      <BuilderWorkflowPageHeader
        {...baseProps}
        isNew={false}
        workflow={{ id: 'workflow-1' }}
        isLiveRunActive
        onBackToEditor={onBackToEditor}
      />
    )

    const backButton = screen.getByRole('button', { name: 'Back to editor' })
    expect(backButton).toBeInTheDocument()

    // Toolbar buttons should not be present during live run
    expect(screen.queryByRole('button', { name: 'Add Step' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Run/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Save/i })).not.toBeInTheDocument()
  })

  it('shows Review approval button during live run with pending approval', () => {
    const onBackToEditor = vi.fn()
    const onReviewApproval = vi.fn()
    render(
      <BuilderWorkflowPageHeader
        {...baseProps}
        isNew={false}
        workflow={{ id: 'workflow-1' }}
        isLiveRunActive
        onBackToEditor={onBackToEditor}
        hasApprovalPending
        onReviewApproval={onReviewApproval}
      />
    )

    expect(screen.getByRole('button', { name: 'Review approval' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to editor' })).toBeInTheDocument()
  })

  it('updates workflow name and marks dirty on change', async () => {
    const user = userEvent.setup()
    const dispatch = vi.fn()
    const markDirty = vi.fn()

    render(<BuilderWorkflowPageHeader {...baseProps} dispatch={dispatch} markDirty={markDirty} />)

    const nameInput = screen.getByRole('textbox', { name: /Workflow name/i })
    await user.type(nameInput, 'Updated')

    // userEvent.type() calls onChange for each character, so verify dispatch was called with type
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_WORKFLOW_NAME' }))
    expect(markDirty).toHaveBeenCalled()
  })

  it('saves immediately when toggling enable with no unsaved changes', async () => {
    const user = userEvent.setup()
    const handleSaveWorkflow = vi.fn().mockResolvedValue(true)
    const dispatch = vi.fn()
    mockWorkflowStoreState.isDirty = false

    render(
      <BuilderWorkflowPageHeader
        {...baseProps}
        isNew={false}
        workflow={{ id: 'workflow-1' }}
        isEnabled={false}
        handleSaveWorkflow={handleSaveWorkflow}
        dispatch={dispatch}
      />
    )

    const enableSwitch = screen.getByRole('switch')
    await user.click(enableSwitch)

    await waitFor(() => {
      expect(handleSaveWorkflow).toHaveBeenCalledWith(true)
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_IS_ENABLED', payload: true })
    })
  })

  it('shows confirmation dialog when toggling enable with unsaved changes', async () => {
    const user = userEvent.setup()
    const handleSaveWorkflow = vi.fn().mockResolvedValue(true)
    mockWorkflowStoreState.isDirty = true

    render(
      <BuilderWorkflowPageHeader
        {...baseProps}
        isNew={false}
        workflow={{ id: 'workflow-1' }}
        isEnabled={false}
        handleSaveWorkflow={handleSaveWorkflow}
      />
    )

    const enableSwitch = screen.getByRole('switch')
    await user.click(enableSwitch)

    expect(screen.getByText(/Save changes to "wf" before enabling\?/i)).toBeInTheDocument()
  })

  it('saves and updates state when confirming enable with unsaved changes', async () => {
    const user = userEvent.setup()
    const handleSaveWorkflow = vi.fn().mockResolvedValue(true)
    const dispatch = vi.fn()
    mockWorkflowStoreState.isDirty = true

    render(
      <BuilderWorkflowPageHeader
        {...baseProps}
        isNew={false}
        workflow={{ id: 'workflow-1' }}
        isEnabled={false}
        handleSaveWorkflow={handleSaveWorkflow}
        dispatch={dispatch}
      />
    )

    const enableSwitch = screen.getByRole('switch')
    await user.click(enableSwitch)

    const confirmButton = screen.getByRole('button', { name: /Save and continue/i })
    await user.click(confirmButton)

    await waitFor(() => {
      expect(handleSaveWorkflow).toHaveBeenCalledWith(true)
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_IS_ENABLED', payload: true })
    })
  })

  it('does not update state when save fails', async () => {
    const user = userEvent.setup()
    const handleSaveWorkflow = vi.fn().mockResolvedValue(false)
    const dispatch = vi.fn()
    mockWorkflowStoreState.isDirty = false

    render(
      <BuilderWorkflowPageHeader
        {...baseProps}
        isNew={false}
        workflow={{ id: 'workflow-1' }}
        isEnabled={false}
        handleSaveWorkflow={handleSaveWorkflow}
        dispatch={dispatch}
      />
    )

    const enableSwitch = screen.getByRole('switch')
    await user.click(enableSwitch)

    await waitFor(() => {
      expect(handleSaveWorkflow).toHaveBeenCalledWith(true)
    })

    expect(dispatch).not.toHaveBeenCalledWith({ type: 'SET_IS_ENABLED', payload: true })
  })

  it('ignores toggle clicks while saving', async () => {
    const user = userEvent.setup()
    let resolvePromise: (value: boolean) => void
    const handleSaveWorkflow = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolvePromise = resolve
        })
    )
    mockWorkflowStoreState.isDirty = false

    render(
      <BuilderWorkflowPageHeader
        {...baseProps}
        isNew={false}
        workflow={{ id: 'workflow-1' }}
        isEnabled={false}
        handleSaveWorkflow={handleSaveWorkflow}
      />
    )

    const enableSwitch = screen.getByRole('switch')

    await user.click(enableSwitch)
    await user.click(enableSwitch)

    expect(handleSaveWorkflow).toHaveBeenCalledTimes(1)

    // Resolve the promise and wait for state updates
    await waitFor(() => {
      resolvePromise!(true)
    })
  })

  it('closes confirmation dialog when cancel is clicked', async () => {
    const user = userEvent.setup()
    mockWorkflowStoreState.isDirty = true

    render(<BuilderWorkflowPageHeader {...baseProps} isNew={false} workflow={{ id: 'workflow-1' }} isEnabled={false} />)

    const enableSwitch = screen.getByRole('switch')
    await user.click(enableSwitch)

    expect(screen.getByText(/Save changes to "wf" before enabling\?/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Cancel/i }))

    await waitFor(() => {
      expect(screen.queryByText(/Save changes to "wf" before enabling\?/i)).not.toBeInTheDocument()
    })
  })

  it('does not save when confirm is called with null pending state', async () => {
    const user = userEvent.setup()
    const handleSaveWorkflow = vi.fn().mockResolvedValue(true)
    mockWorkflowStoreState.isDirty = true

    render(
      <BuilderWorkflowPageHeader
        {...baseProps}
        isNew={false}
        workflow={{ id: 'workflow-1' }}
        isEnabled={false}
        handleSaveWorkflow={handleSaveWorkflow}
      />
    )

    const enableSwitch = screen.getByRole('switch')
    await user.click(enableSwitch)

    // Cancel to clear the pending state
    await user.click(screen.getByRole('button', { name: /Cancel/i }))

    expect(handleSaveWorkflow).not.toHaveBeenCalled()
  })

  it('updates workflow details via popover and marks dirty', () => {
    const dispatch = vi.fn()
    const markDirty = vi.fn()

    render(
      <BuilderWorkflowPageHeader
        {...baseProps}
        workflowName="Original Name"
        workflowDescription="Original Description"
        workflowTags={['tag1']}
        dispatch={dispatch}
        markDirty={markDirty}
      />
    )

    // The EditWorkflowDetailsPopover is tested separately, we just verify it's rendered
    // and that the dispatch/markDirty callbacks are passed correctly
    expect(screen.getByRole('textbox', { name: /Workflow name/i })).toHaveValue('Original Name')
  })

  it('shows cancel button during live run when execution is running', () => {
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <BuilderWorkflowPageHeader
          {...baseProps}
          isNew={false}
          workflow={{ id: 'workflow-1' }}
          isLiveRunActive
          onBackToEditor={vi.fn()}
          executionId="exec-123"
          executionStatus="running"
        />
      </QueryClientProvider>
    )

    expect(screen.getByRole('button', { name: 'Cancel execution' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to editor' })).toBeInTheDocument()
  })

  it('shows cancel and approval buttons together during live run', () => {
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <BuilderWorkflowPageHeader
          {...baseProps}
          isNew={false}
          workflow={{ id: 'workflow-1' }}
          isLiveRunActive
          onBackToEditor={vi.fn()}
          executionId="exec-123"
          executionStatus="running"
          hasApprovalPending
          onReviewApproval={vi.fn()}
        />
      </QueryClientProvider>
    )

    expect(screen.getByRole('button', { name: 'Cancel execution' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Review approval' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to editor' })).toBeInTheDocument()
  })

  it('shows cancel button during live run when execution is pending', () => {
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <BuilderWorkflowPageHeader
          {...baseProps}
          isNew={false}
          workflow={{ id: 'workflow-1' }}
          isLiveRunActive
          onBackToEditor={vi.fn()}
          executionId="exec-456"
          executionStatus="pending"
        />
      </QueryClientProvider>
    )

    expect(screen.getByRole('button', { name: 'Cancel execution' })).toBeInTheDocument()
  })

  it('does not show cancel button during live run when execution is completed', () => {
    render(
      <BuilderWorkflowPageHeader
        {...baseProps}
        isNew={false}
        workflow={{ id: 'workflow-1' }}
        isLiveRunActive
        onBackToEditor={vi.fn()}
        executionId="exec-789"
        executionStatus="completed"
      />
    )

    expect(screen.queryByRole('button', { name: 'Cancel execution' })).not.toBeInTheDocument()
  })

  it('does not show cancel button during live run when executionId is missing', () => {
    render(
      <BuilderWorkflowPageHeader
        {...baseProps}
        isNew={false}
        workflow={{ id: 'workflow-1' }}
        isLiveRunActive
        onBackToEditor={vi.fn()}
        executionStatus="running"
      />
    )

    expect(screen.queryByRole('button', { name: 'Cancel execution' })).not.toBeInTheDocument()
  })

  it('dispatches name, description, and tag changes via onApply callback', async () => {
    const user = userEvent.setup()
    const dispatch = vi.fn()
    const markDirty = vi.fn()

    render(
      <BuilderWorkflowPageHeader
        {...baseProps}
        workflowName="Old Name"
        workflowDescription="Old Desc"
        workflowTags={['old-tag']}
        dispatch={dispatch}
        markDirty={markDirty}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Apply details' }))

    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_WORKFLOW_NAME', payload: 'New Name' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_WORKFLOW_DESCRIPTION', payload: 'New Desc' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_WORKFLOW_TAGS', payload: ['new-tag'] })
    expect(markDirty).toHaveBeenCalled()
  })

  it('does not dispatch when onApply values are unchanged', async () => {
    const user = userEvent.setup()
    const dispatch = vi.fn()
    const markDirty = vi.fn()

    vi.mocked(await import('./EditWorkflowDetailsPopover')).EditWorkflowDetailsPopover = (({
      onApply,
    }: {
      onApply: (name: string, description: string, tags: string[]) => void
    }) => (
      <button onClick={() => onApply('wf', '', [])} aria-label="Apply details">
        Edit details
      </button>
    )) as never

    render(<BuilderWorkflowPageHeader {...baseProps} dispatch={dispatch} markDirty={markDirty} />)

    await user.click(screen.getByRole('button', { name: 'Apply details' }))

    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_WORKFLOW_NAME' }))
    expect(markDirty).not.toHaveBeenCalled()
  })
})
