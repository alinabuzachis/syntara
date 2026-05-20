import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { BuilderEditorToolbar } from './BuilderEditorToolbar'

describe('BuilderEditorToolbar', () => {
  const defaultProps = {
    isNew: false,
    workflow: { id: 'wf-1' },
    isPending: false,
    isKebabOpen: false,
    publishedVersion: null as number | null,
    dispatch: vi.fn(),
    markDirty: vi.fn(),
    handleToggleHistory: vi.fn(),
    handleToggleDetails: vi.fn(),
    handleSaveWorkflow: vi.fn().mockResolvedValue(true),
    onPublishClick: vi.fn(),
    onUnpublish: vi.fn(),
  }

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders Add Step button', () => {
    render(<BuilderEditorToolbar {...defaultProps} />)

    expect(screen.getByRole('button', { name: /Add Step/i })).toBeInTheDocument()
  })

  it('opens add node panel when Add Step is clicked', async () => {
    const user = userEvent.setup()
    const dispatch = vi.fn()

    render(<BuilderEditorToolbar {...defaultProps} dispatch={dispatch} />)

    await user.click(screen.getByRole('button', { name: /Add Step/i }))

    expect(dispatch).toHaveBeenCalledWith({
      type: 'OPEN_ADD_NODE_PANEL',
      payload: { sourceNodeId: null, replacementNodeId: null },
    })
  })

  it('renders Run button for existing workflows', () => {
    render(<BuilderEditorToolbar {...defaultProps} />)

    expect(screen.getByRole('button', { name: /^Run$/i })).toBeInTheDocument()
  })

  it('does not render Run button for new workflows', () => {
    render(<BuilderEditorToolbar {...defaultProps} isNew={true} workflow={undefined} />)

    expect(screen.queryByRole('button', { name: /^Run$/i })).not.toBeInTheDocument()
  })

  it('opens run confirmation dialog when Run is clicked', async () => {
    const user = userEvent.setup()
    const dispatch = vi.fn()

    render(<BuilderEditorToolbar {...defaultProps} dispatch={dispatch} />)

    await user.click(screen.getByRole('button', { name: /^Run$/i }))

    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CONFIRM_DIALOG', payload: true })
  })

  it('renders workflow details in kebab menu', () => {
    render(<BuilderEditorToolbar {...defaultProps} isKebabOpen={true} />)

    expect(screen.getByRole('menuitem', { name: /Workflow details/i })).toBeInTheDocument()
  })

  it('toggles workflow details when kebab menu item is clicked', async () => {
    const user = userEvent.setup()
    const handleToggleDetails = vi.fn()
    const dispatch = vi.fn()

    render(
      <BuilderEditorToolbar
        {...defaultProps}
        isKebabOpen={true}
        handleToggleDetails={handleToggleDetails}
        dispatch={dispatch}
      />
    )

    await user.click(screen.getByRole('menuitem', { name: /Workflow details/i }))

    expect(handleToggleDetails).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_KEBAB_OPEN', payload: false })
  })

  it('renders run history in kebab menu for existing workflows', () => {
    render(<BuilderEditorToolbar {...defaultProps} isKebabOpen={true} />)

    expect(screen.getByRole('menuitem', { name: /Run history/i })).toBeInTheDocument()
  })

  it('toggles run history when kebab menu item is clicked', async () => {
    const user = userEvent.setup()
    const handleToggleHistory = vi.fn()
    const dispatch = vi.fn()

    render(
      <BuilderEditorToolbar
        {...defaultProps}
        isKebabOpen={true}
        handleToggleHistory={handleToggleHistory}
        dispatch={dispatch}
      />
    )

    await user.click(screen.getByRole('menuitem', { name: /Run history/i }))

    expect(handleToggleHistory).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_KEBAB_OPEN', payload: false })
  })

  it('renders Save button', () => {
    render(<BuilderEditorToolbar {...defaultProps} />)

    expect(screen.getByRole('button', { name: /^Save$/i })).toBeInTheDocument()
  })

  it('calls handleSaveWorkflow when Save is clicked', async () => {
    const user = userEvent.setup()
    const handleSaveWorkflow = vi.fn().mockResolvedValue(true)

    render(<BuilderEditorToolbar {...defaultProps} handleSaveWorkflow={handleSaveWorkflow} />)

    await user.click(screen.getByRole('button', { name: /^Save$/i }))

    expect(handleSaveWorkflow).toHaveBeenCalledTimes(1)
  })

  it('shows Saving... text when save is pending', () => {
    render(<BuilderEditorToolbar {...defaultProps} isPending={true} />)

    expect(screen.getByRole('button', { name: /Saving\.\.\./i })).toBeInTheDocument()
  })

  it('disables Save button when pending', () => {
    render(<BuilderEditorToolbar {...defaultProps} isPending={true} />)

    const saveButton = screen.getByRole('button', { name: /Saving\.\.\./i })
    expect(saveButton).toHaveAttribute('aria-disabled', 'true')
  })

  it('Save button is always clickable for new workflows (validation happens on save, not before)', () => {
    render(<BuilderEditorToolbar {...defaultProps} isNew={true} workflow={undefined} />)

    const saveButton = screen.getByRole('button', { name: /^Save$/i })
    expect(saveButton).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('renders Publish button for existing workflows', () => {
    render(<BuilderEditorToolbar {...defaultProps} />)

    expect(screen.getByRole('button', { name: /Publish/i })).toBeInTheDocument()
  })

  it('does not render Publish button for new workflows', () => {
    render(<BuilderEditorToolbar {...defaultProps} isNew={true} workflow={undefined} />)

    expect(screen.queryByRole('button', { name: /Publish/i })).not.toBeInTheDocument()
  })

  it('calls onPublishClick when Publish button is clicked', async () => {
    const user = userEvent.setup()
    const onPublishClick = vi.fn()

    render(<BuilderEditorToolbar {...defaultProps} onPublishClick={onPublishClick} />)

    await user.click(screen.getByRole('button', { name: /Publish/i }))

    expect(onPublishClick).toHaveBeenCalledTimes(1)
  })

  it('renders Unpublish in kebab menu when workflow is published', () => {
    render(<BuilderEditorToolbar {...defaultProps} isKebabOpen={true} publishedVersion={2} />)

    expect(screen.getByRole('menuitem', { name: /Unpublish workflow/i })).toBeInTheDocument()
  })

  it('does not render Unpublish when workflow is not published', () => {
    render(<BuilderEditorToolbar {...defaultProps} isKebabOpen={true} publishedVersion={null} />)

    expect(screen.queryByRole('menuitem', { name: /Unpublish workflow/i })).not.toBeInTheDocument()
  })

  it('renders delete workflow menu when kebab is open', () => {
    render(<BuilderEditorToolbar {...defaultProps} isKebabOpen={true} />)

    expect(screen.getByRole('menuitem', { name: /Delete workflow/i })).toBeInTheDocument()
  })

  it('opens delete dialog when delete menu item is clicked', async () => {
    const user = userEvent.setup()
    const dispatch = vi.fn()

    render(<BuilderEditorToolbar {...defaultProps} isKebabOpen={true} dispatch={dispatch} />)

    const deleteMenuItem = screen.getByRole('menuitem', { name: /Delete workflow/i })
    await user.click(deleteMenuItem)

    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_DELETE_DIALOG', payload: true })
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_KEBAB_OPEN', payload: false })
  })

  it('renders kebab menu but not delete for new workflows', () => {
    render(<BuilderEditorToolbar {...defaultProps} isNew={true} workflow={undefined} isKebabOpen={true} />)

    expect(screen.getByRole('button', { name: /Workflow actions/i })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /Delete workflow/i })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Export workflow/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Import workflow/i })).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<BuilderEditorToolbar {...defaultProps} />)

    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no accessibility violations for new workflow', async () => {
    const { container } = render(<BuilderEditorToolbar {...defaultProps} isNew={true} workflow={undefined} />)

    expect(await axe(container)).toHaveNoViolations()
  })
})
