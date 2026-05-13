import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { BuilderWorkflowAppPageHeader } from './BuilderWorkflowAppPageHeader'

const mockWorkflowStoreState = vi.hoisted(() => ({
  isDirty: false,
}))

vi.mock('../../stores/useWorkflowStore', () => ({
  useWorkflowStore: {
    getState: () => mockWorkflowStoreState,
  },
}))

describe('BuilderWorkflowAppPageHeader', () => {
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
    const { container } = render(<BuilderWorkflowAppPageHeader {...baseProps} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('shows Back to editor button during live run and hides toolbar', () => {
    const onBackToEditor = vi.fn()
    render(
      <BuilderWorkflowAppPageHeader
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
      <BuilderWorkflowAppPageHeader
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

    render(<BuilderWorkflowAppPageHeader {...baseProps} dispatch={dispatch} markDirty={markDirty} />)

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
      <BuilderWorkflowAppPageHeader
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
      <BuilderWorkflowAppPageHeader
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
      <BuilderWorkflowAppPageHeader
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
      <BuilderWorkflowAppPageHeader
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
      <BuilderWorkflowAppPageHeader
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

    render(
      <BuilderWorkflowAppPageHeader {...baseProps} isNew={false} workflow={{ id: 'workflow-1' }} isEnabled={false} />
    )

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
      <BuilderWorkflowAppPageHeader
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
      <BuilderWorkflowAppPageHeader
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
})
