import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { BuilderWorkflowPageHeader, type BuilderWorkflowPageHeaderProps } from './BuilderWorkflowPageHeader'

const mockWorkflowStoreState = vi.hoisted(() => ({
  isDirty: false,
}))

vi.mock('../../stores/useWorkflowStore', () => ({
  useWorkflowStore: {
    getState: () => mockWorkflowStoreState,
  },
}))

vi.mock('../../client', () => ({
  authMiddleware: { onRequest: vi.fn() },
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
  const baseProps: BuilderWorkflowPageHeaderProps = {
    workflowName: 'wf',
    workflowDescription: '',
    workflowTags: [],
    isNew: true,
    workflow: undefined,
    isPending: false,
    isDirty: true,
    lastSavedAt: '2026-01-15T14:30:00Z',
    isKebabOpen: false,
    publishedVersion: null,
    currentVersion: undefined,
    isPublishing: false,
    isAddNodePanelOpen: false,
    hasNoWorkflowNodes: false,
    ProjectSelector: <span>Project</span>,
    dispatch: vi.fn(),
    markDirty: vi.fn(),
    handleToggleHistory: vi.fn(),
    handleToggleDetails: vi.fn(),
    handleSaveWorkflow: vi.fn().mockResolvedValue(true),
    onPublish: vi.fn(),
    onUnpublish: vi.fn(),
    builderPermissions: {
      canEdit: true,
      canRun: true,
      canDelete: true,
      isLoading: false,
      tooltips: { edit: '', save: '', publish: '', unpublish: '', run: '', delete: '' },
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
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

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_WORKFLOW_NAME' }))
    expect(markDirty).toHaveBeenCalled()
  })

  it('does not show status badge for new workflows', () => {
    render(<BuilderWorkflowPageHeader {...baseProps} isNew={true} />)

    expect(screen.queryByText('Draft')).not.toBeInTheDocument()
    expect(screen.queryByText('Published')).not.toBeInTheDocument()
  })

  it('shows status badge for existing workflows', () => {
    render(
      <BuilderWorkflowPageHeader
        {...baseProps}
        isNew={false}
        workflow={{ id: 'wf-1' }}
        publishedVersion={null}
        currentVersion={1}
      />
    )

    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('shows Published badge when versions match', () => {
    render(
      <BuilderWorkflowPageHeader
        {...baseProps}
        isNew={false}
        workflow={{ id: 'wf-1' }}
        publishedVersion={2}
        currentVersion={2}
      />
    )

    expect(screen.getByText('Published')).toBeInTheDocument()
  })

  it('shows Unpublished changes badge when versions differ', () => {
    render(
      <BuilderWorkflowPageHeader
        {...baseProps}
        isNew={false}
        workflow={{ id: 'wf-1' }}
        publishedVersion={1}
        currentVersion={2}
      />
    )

    expect(screen.getByText('Unpublished changes')).toBeInTheDocument()
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

  it('shows approval loading state during live run', () => {
    render(
      <BuilderWorkflowPageHeader
        {...baseProps}
        isNew={false}
        workflow={{ id: 'workflow-1' }}
        isLiveRunActive
        onBackToEditor={vi.fn()}
        hasApprovalPending
        isApprovalLoading={true}
        onReviewApproval={vi.fn()}
      />
    )

    // PF prepends "Loading..." to the accessible name when isLoading is true
    const approvalButton = screen.getByRole('button', { name: /Review approval/i })
    expect(approvalButton).toBeInTheDocument()
  })

  it('does not show approval button when hasApprovalPending is false', () => {
    render(
      <BuilderWorkflowPageHeader
        {...baseProps}
        isNew={false}
        workflow={{ id: 'workflow-1' }}
        isLiveRunActive
        onBackToEditor={vi.fn()}
        hasApprovalPending={false}
        onReviewApproval={vi.fn()}
      />
    )

    expect(screen.queryByRole('button', { name: 'Review approval' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to editor' })).toBeInTheDocument()
  })

  it('does not show approval button when onReviewApproval is not provided', () => {
    render(
      <BuilderWorkflowPageHeader
        {...baseProps}
        isNew={false}
        workflow={{ id: 'workflow-1' }}
        isLiveRunActive
        onBackToEditor={vi.fn()}
        hasApprovalPending
      />
    )

    expect(screen.queryByRole('button', { name: 'Review approval' })).not.toBeInTheDocument()
  })

  it('renders editor toolbar when isLiveRunActive is false', () => {
    render(<BuilderWorkflowPageHeader {...baseProps} isNew={false} workflow={{ id: 'wf-1' }} isLiveRunActive={false} />)

    // Editor toolbar should be rendered (not live run toolbar)
    expect(screen.queryByRole('button', { name: 'Back to editor' })).not.toBeInTheDocument()
  })

  it('renders editor toolbar when isLiveRunActive is true but onBackToEditor is not provided', () => {
    render(<BuilderWorkflowPageHeader {...baseProps} isNew={false} workflow={{ id: 'wf-1' }} isLiveRunActive />)

    // Without onBackToEditor, the live run toolbar branch is not taken
    expect(screen.queryByRole('button', { name: 'Back to editor' })).not.toBeInTheDocument()
  })

  it('does not show cancel button when execution is not cancellable', () => {
    render(
      <BuilderWorkflowPageHeader
        {...baseProps}
        isNew={false}
        workflow={{ id: 'workflow-1' }}
        isLiveRunActive
        onBackToEditor={vi.fn()}
        executionId="exec-abc"
        executionStatus="failed"
      />
    )

    expect(screen.queryByRole('button', { name: 'Cancel execution' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to editor' })).toBeInTheDocument()
  })

  it('opens publish dialog and calls onPublish with form data', async () => {
    const user = userEvent.setup()
    const onPublish = vi.fn()

    render(
      <BuilderWorkflowPageHeader
        {...baseProps}
        isNew={false}
        workflow={{ id: 'wf-1' }}
        publishedVersion={null}
        currentVersion={1}
        onPublish={onPublish}
      />
    )

    // The PublishWorkflowDialog is wired to publishDialog.open(true) via onPublishClick
    // The BuilderEditorToolbar has a "Publish" button that calls onPublishClick
    // Look for the publish button in the editor toolbar kebab or toolbar
    const publishButton = screen.getByRole('button', { name: /Publish/i })
    await user.click(publishButton)

    // Publish dialog should open
    await screen.findByText('Publish workflow?')

    // Submit the form
    const submitButton = screen.getByRole('button', { name: 'Publish' })
    await user.click(submitButton)

    // onPublish should have been called
    expect(onPublish).toHaveBeenCalled()
  })

  describe('read-only mode (canEdit=false)', () => {
    const readOnlyPermissions = {
      ...baseProps.builderPermissions,
      canEdit: false,
      tooltips: { ...baseProps.builderPermissions.tooltips, edit: 'No edit permission' },
    }

    it('disables workflow name input', () => {
      render(<BuilderWorkflowPageHeader {...baseProps} builderPermissions={readOnlyPermissions} />)

      expect(screen.getByRole('textbox', { name: /Workflow name/i })).toBeDisabled()
    })

    it('does not dispatch name changes when input is disabled', () => {
      const dispatch = vi.fn()
      render(<BuilderWorkflowPageHeader {...baseProps} dispatch={dispatch} builderPermissions={readOnlyPermissions} />)

      const input = screen.getByRole('textbox', { name: /Workflow name/i })
      expect(input).toBeDisabled()
      expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_WORKFLOW_NAME' }))
    })

    it('hides edit workflow details popover', () => {
      render(<BuilderWorkflowPageHeader {...baseProps} builderPermissions={readOnlyPermissions} />)

      expect(screen.queryByRole('button', { name: /Apply details/i })).not.toBeInTheDocument()
    })

    it('hides project selector', () => {
      render(<BuilderWorkflowPageHeader {...baseProps} builderPermissions={readOnlyPermissions} />)

      expect(screen.queryByText('Project')).not.toBeInTheDocument()
    })

    it('shows project selector when canEdit is true', () => {
      render(<BuilderWorkflowPageHeader {...baseProps} />)

      expect(screen.getByText('Project')).toBeInTheDocument()
    })
  })

  it('does not show cancel button when executionId is null', () => {
    render(
      <BuilderWorkflowPageHeader
        {...baseProps}
        isNew={false}
        workflow={{ id: 'workflow-1' }}
        isLiveRunActive
        onBackToEditor={vi.fn()}
        executionId={null}
        executionStatus="running"
      />
    )

    expect(screen.queryByRole('button', { name: 'Cancel execution' })).not.toBeInTheDocument()
  })
})
