import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { ImportWorkflowDialog } from './ImportWorkflowDialog'

const mockShowSuccess = vi.fn()
const mockShowError = vi.fn()
const mockPost = vi.fn<(...args: unknown[]) => Promise<{ data?: unknown; error?: unknown }>>()

vi.mock('../../providers/alerts', () => ({
  useAlerts: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}))

vi.mock('../../client', () => ({
  workflowFetchClient: { POST: (...args: unknown[]) => mockPost(...args) },
}))

describe('ImportWorkflowDialog', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
    projects: [
      { id: 'p1', name: 'Project 1' },
      { id: 'p2', name: 'Project 2' },
    ],
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the dialog with required fields', () => {
    render(<ImportWorkflowDialog {...defaultProps} />)

    expect(screen.getByText('Import workflow')).toBeInTheDocument()
    expect(screen.getByLabelText(/Workflow file/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Workflow name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Project/i)).toBeInTheDocument()
  })

  it('disables Import button when no file is selected', () => {
    render(<ImportWorkflowDialog {...defaultProps} />)

    expect(screen.getByRole('button', { name: /^Import$/i })).toBeDisabled()
  })

  it('shows validation error when submitting with empty name', async () => {
    const user = userEvent.setup()
    render(<ImportWorkflowDialog {...defaultProps} />)

    const fileInput = screen.getByLabelText(/Workflow file/i)
    const file = new File(['{}'], 'test.json', { type: 'application/json' })
    await user.upload(fileInput, file)
    await user.click(screen.getByRole('button', { name: /^Import$/i }))

    await waitFor(() => {
      expect(screen.getByText('Workflow name is required')).toBeInTheDocument()
    })
  })

  it('enables Import button when file is provided', async () => {
    const user = userEvent.setup()
    render(<ImportWorkflowDialog {...defaultProps} />)

    const fileInput = screen.getByLabelText(/Workflow file/i)
    const file = new File(['{}'], 'test.json', { type: 'application/json' })
    await user.upload(fileInput, file)

    expect(screen.getByRole('button', { name: /^Import$/i })).toBeEnabled()
  })

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(<ImportWorkflowDialog {...defaultProps} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: /Cancel/i }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders project options', () => {
    render(<ImportWorkflowDialog {...defaultProps} />)

    expect(screen.getByText('Project 1')).toBeInTheDocument()
    expect(screen.getByText('Project 2')).toBeInTheDocument()
  })

  it('submits successfully with valid file and name', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    const onClose = vi.fn()
    mockPost.mockResolvedValue({ data: { id: 'new-wf' } })

    const validContent = JSON.stringify({
      triggers: [{ id: 't1', type: 'webhook' }],
      nodes: [{ id: 'n1', type: 'action' }],
      edges: [{ from: 't1', to: 'n1' }],
    })

    render(<ImportWorkflowDialog {...defaultProps} onSuccess={onSuccess} onClose={onClose} />)

    const fileInput = screen.getByLabelText(/Workflow file/i)
    const file = new File([validContent], 'workflow.json', { type: 'application/json' })
    await user.upload(fileInput, file)
    await user.type(screen.getByLabelText(/Workflow name/i), 'Imported WF')
    await user.click(screen.getByRole('button', { name: /^Import$/i }))

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalled()
    })
    expect(mockShowSuccess).toHaveBeenCalledWith({
      title: 'Workflow imported',
      description: 'Successfully imported "Imported WF"',
    })
    expect(onSuccess).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('shows API error via alert', async () => {
    const user = userEvent.setup()
    mockPost.mockResolvedValue({ error: { detail: 'Duplicate name' } })

    const validContent = JSON.stringify({
      triggers: [],
      nodes: [{ id: 'n1', type: 'action' }],
      edges: [],
    })

    render(<ImportWorkflowDialog {...defaultProps} />)

    const fileInput = screen.getByLabelText(/Workflow file/i)
    const file = new File([validContent], 'wf.json', { type: 'application/json' })
    await user.upload(fileInput, file)
    await user.type(screen.getByLabelText(/Workflow name/i), 'Test')
    await user.click(screen.getByRole('button', { name: /^Import$/i }))

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith({
        title: 'Import failed',
        description: 'Duplicate name',
      })
    })
  })

  it('shows file validation error inline', async () => {
    const user = userEvent.setup()

    render(<ImportWorkflowDialog {...defaultProps} />)

    const fileInput = screen.getByLabelText(/Workflow file/i)
    const file = new File(['not valid json'], 'bad.json', { type: 'application/json' })
    await user.upload(fileInput, file)
    await user.type(screen.getByLabelText(/Workflow name/i), 'Test')
    await user.click(screen.getByRole('button', { name: /^Import$/i }))

    await waitFor(() => {
      expect(screen.getByText(/Unexpected token/i)).toBeInTheDocument()
    })
  })

  it('passes project ID when selected', async () => {
    const user = userEvent.setup()
    mockPost.mockResolvedValue({ data: { id: 'new-wf' } })

    const validContent = JSON.stringify({
      triggers: [],
      nodes: [{ id: 'n1', type: 'action' }],
      edges: [],
    })

    render(<ImportWorkflowDialog {...defaultProps} defaultProjectId="p1" />)

    const fileInput = screen.getByLabelText(/Workflow file/i)
    const file = new File([validContent], 'wf.json', { type: 'application/json' })
    await user.upload(fileInput, file)
    await user.type(screen.getByLabelText(/Workflow name/i), 'Test')
    await user.click(screen.getByRole('button', { name: /^Import$/i }))

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalled()
    })
    const callArgs = mockPost.mock.calls[0] as [string, { body: Record<string, unknown> }]
    expect(callArgs[1].body).toEqual(expect.objectContaining({ project_id: 'p1' }))
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<ImportWorkflowDialog {...defaultProps} />)

    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no accessibility violations when closed', async () => {
    const { container } = render(<ImportWorkflowDialog {...defaultProps} isOpen={false} />)

    expect(await axe(container)).toHaveNoViolations()
  })
})
