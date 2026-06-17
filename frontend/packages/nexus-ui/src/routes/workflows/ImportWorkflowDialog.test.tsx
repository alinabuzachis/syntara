import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { axe } from 'vitest-axe'

import { ImportWorkflowDialog } from './ImportWorkflowDialog'

const mockShowAlert = vi.fn()
const mockShowError = vi.fn()
const mockPost = vi.fn<(...args: unknown[]) => Promise<{ data?: unknown; error?: unknown }>>()
const mockSetLocation = vi.fn()

vi.mock('../../providers/alerts', () => ({
  useAlerts: () => ({ showAlert: mockShowAlert, showError: mockShowError }),
}))

vi.mock('../../hooks/routing/useLocation', () => ({
  useLocation: () => '/',
}))
vi.mock('../../hooks/routing/useNavigate', () => ({
  useNavigate: () => mockSetLocation,
}))

vi.mock('../../client', () => ({
  workflowFetchClient: { POST: (...args: unknown[]) => mockPost(...args) },
}))

const defaultProjects = [
  { id: 'p1', name: 'Project 1', description: 'First project' },
  { id: 'p2', name: 'Project 2', description: 'Second project' },
]
let mockProjects = [...defaultProjects]
let mockSelectedProjectId: string | null = 'p1'
const mockOnProjectSelect = vi.fn()

vi.mock('../../hooks/useProjectSelector', () => ({
  useProjectSelector: (options?: { onProjectSelect?: (project: unknown) => void }) => {
    if (options?.onProjectSelect) {
      mockOnProjectSelect.mockImplementation(options.onProjectSelect)
    }
    return {
      selectedProject: mockProjects.find((p) => p.id === mockSelectedProjectId) ?? null,
      selectedProjectId: mockSelectedProjectId,
      stableProjectId: mockSelectedProjectId ?? undefined,
      isAllProjects: mockSelectedProjectId === null,
      projects: mockProjects,
      ProjectSelector: <div data-testid="project-selector">Project Selector</div>,
    }
  },
}))

describe('ImportWorkflowDialog', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  }

  function getFileInput(): HTMLInputElement {
    // eslint-disable-next-line testing-library/no-node-access -- PatternFly FileUpload renders a hidden file input; no accessible role or label is available by design
    return document.querySelector('input[type="file"]') as HTMLInputElement
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectedProjectId = 'p1'
    mockProjects = [...defaultProjects]
  })

  it('renders the dialog with required fields', () => {
    render(<ImportWorkflowDialog {...defaultProps} />)

    expect(screen.getByText('Import workflow')).toBeInTheDocument()
    expect(screen.getByText('Workflow file')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Upload/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/Workflow name/i)).toBeInTheDocument()
    expect(screen.getByTestId('project-selector')).toBeInTheDocument()
  })

  it('disables Import button when no file is selected', () => {
    render(<ImportWorkflowDialog {...defaultProps} />)

    expect(screen.getByRole('button', { name: /^Import$/i })).toBeDisabled()
  })

  it('shows validation error when submitting with empty name', async () => {
    const user = userEvent.setup()
    render(<ImportWorkflowDialog {...defaultProps} />)

    const file = new File(['{}'], 'test.json', { type: 'application/json' })
    await user.upload(getFileInput(), file)
    await user.click(screen.getByRole('button', { name: /^Import$/i }))

    await waitFor(() => {
      expect(screen.getByText('Workflow name is required')).toBeInTheDocument()
    })
  })

  it('enables Import button when file is provided', async () => {
    const user = userEvent.setup()
    render(<ImportWorkflowDialog {...defaultProps} />)

    const file = new File(['{}'], 'test.json', { type: 'application/json' })
    await user.upload(getFileInput(), file)

    expect(screen.getByRole('button', { name: /^Import$/i })).toBeEnabled()
  })

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(<ImportWorkflowDialog {...defaultProps} onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: /Cancel/i }))

    expect(onClose).toHaveBeenCalledTimes(1)
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

    const file = new File([validContent], 'workflow.json', { type: 'application/json' })
    await user.upload(getFileInput(), file)
    await user.type(screen.getByLabelText(/Workflow name/i), 'Imported WF')
    await user.click(screen.getByRole('button', { name: /^Import$/i }))

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalled()
    })
    const callArgs = mockPost.mock.calls[0] as [string, { body: Record<string, unknown> }]
    expect(callArgs[1].body).toEqual(expect.objectContaining({ project_id: 'p1' }))
    expect(mockShowAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'success',
        title: 'Workflow imported',
      })
    )
    expect(onSuccess).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('shows error when no project is selected on submit', async () => {
    mockSelectedProjectId = null
    const user = userEvent.setup()

    const validContent = JSON.stringify({
      triggers: [],
      nodes: [{ id: 'n1', type: 'action' }],
      edges: [],
    })

    render(<ImportWorkflowDialog {...defaultProps} />)

    await user.upload(getFileInput(), new File([validContent], 'wf.json'))
    await user.type(screen.getByLabelText(/Workflow name/i), 'Test')
    await user.click(screen.getByRole('button', { name: /^Import$/i }))

    await waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith({
        title: 'Project required',
        description: 'Please select a project to import this workflow.',
      })
    })
    expect(mockPost).not.toHaveBeenCalled()
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

    const file = new File([validContent], 'wf.json', { type: 'application/json' })
    await user.upload(getFileInput(), file)
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

    const file = new File(['not valid json'], 'bad.json', { type: 'application/json' })
    await user.upload(getFileInput(), file)
    await user.type(screen.getByLabelText(/Workflow name/i), 'Test')
    await user.click(screen.getByRole('button', { name: /^Import$/i }))

    await waitFor(() => {
      expect(screen.getByText(/Unexpected token/i)).toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('has no accessibility violations', async () => {
      const { container } = render(<ImportWorkflowDialog {...defaultProps} />)

      // Wait for PF FileUpload (react-dropzone) to finish initializing
      await screen.findByRole('button', { name: /Upload/i })
      expect(await axe(container)).toHaveNoViolations()
    })

    it('has no accessibility violations when closed', async () => {
      const { container } = render(<ImportWorkflowDialog {...defaultProps} isOpen={false} />)

      expect(await axe(container)).toHaveNoViolations()
    })
  })
})
