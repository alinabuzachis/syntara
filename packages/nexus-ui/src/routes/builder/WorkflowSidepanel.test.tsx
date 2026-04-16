import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { WorkflowSidepanel } from './WorkflowSidepanel'

type WorkflowWithVersion = WorkflowAPI.components['schemas']['WorkflowWithVersion']

// Mock CodeBlock component
vi.mock('../../components/details/CodeBlock', () => ({
  CodeBlock: ({ jsonObject }: { jsonObject: unknown }) => (
    <pre data-testid="code-block">{JSON.stringify(jsonObject)}</pre>
  ),
}))

describe('WorkflowSidepanel', () => {
  const mockOnNameChange = vi.fn()
  const mockOnDescriptionChange = vi.fn()
  const mockOnClose = vi.fn()

  const createMockWorkflow = (overrides?: Record<string, unknown>): WorkflowWithVersion =>
    ({
      id: 'workflow-1',
      name: 'Test Workflow',
      description: 'Test description',
      version: {
        id: 'version-1',
        workflow_id: 'workflow-1',
        workflow_definition: {
          workflow: { activities: [] },
        },
      },
      ...overrides,
    }) as unknown as WorkflowWithVersion

  const defaultProps = {
    workflow: createMockWorkflow(),
    workflowName: 'Test Workflow',
    workflowDescription: 'Test description',
    onNameChange: mockOnNameChange,
    onDescriptionChange: mockOnDescriptionChange,
    onClose: mockOnClose,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the component with title', () => {
    render(<WorkflowSidepanel {...defaultProps} />)

    expect(screen.getByText('Workflow details')).toBeInTheDocument()
  })

  it('renders close button', () => {
    render(<WorkflowSidepanel {...defaultProps} />)

    const closeButton = screen.getByLabelText('Close')
    expect(closeButton).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    render(<WorkflowSidepanel {...defaultProps} />)

    const closeButton = screen.getByLabelText('Close')
    fireEvent.click(closeButton)

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('renders workflow name input with value', () => {
    render(<WorkflowSidepanel {...defaultProps} />)

    const nameInput = screen.getByLabelText('Workflow name in workflow details')
    expect(nameInput).toHaveValue('Test Workflow')
  })

  it('calls onNameChange when name input changes', () => {
    render(<WorkflowSidepanel {...defaultProps} />)

    const nameInput = screen.getByLabelText('Workflow name in workflow details')
    fireEvent.change(nameInput, { target: { value: 'New Name' } })

    expect(mockOnNameChange).toHaveBeenCalledWith('New Name')
  })

  it('renders description textarea with value', () => {
    render(<WorkflowSidepanel {...defaultProps} />)

    const descriptionInput = screen.getByLabelText('Description')
    expect(descriptionInput).toHaveValue('Test description')
  })

  it('calls onDescriptionChange when description changes', () => {
    render(<WorkflowSidepanel {...defaultProps} />)

    const descriptionInput = screen.getByLabelText('Description')
    fireEvent.change(descriptionInput, { target: { value: 'New description' } })

    expect(mockOnDescriptionChange).toHaveBeenCalledWith('New description')
  })

  it('renders workflow definition code block when available', () => {
    const workflow = createMockWorkflow({
      version: {
        id: 'version-1',
        workflow_id: 'workflow-1',
        workflow_definition: {
          workflow: { activities: [{ id: 'activity-1', type: 'task', name: 'Task 1' }] },
        },
      },
    })

    render(<WorkflowSidepanel {...defaultProps} workflow={workflow} />)

    expect(screen.getByText('Workflow definition')).toBeInTheDocument()
    expect(screen.getByTestId('code-block')).toBeInTheDocument()
  })

  it('does not render workflow definition when not available', () => {
    const workflow = createMockWorkflow({
      version: {
        id: 'version-1',
        workflow_id: 'workflow-1',
        // No workflow_definition
      },
    })

    render(<WorkflowSidepanel {...defaultProps} workflow={workflow} />)

    expect(screen.queryByText('Workflow definition')).not.toBeInTheDocument()
  })

  it('does not render workflow definition when version is undefined', () => {
    const workflow = createMockWorkflow({
      version: undefined,
    })

    render(<WorkflowSidepanel {...defaultProps} workflow={workflow} />)

    expect(screen.queryByText('Workflow definition')).not.toBeInTheDocument()
  })

  it('renders form labels correctly', () => {
    render(<WorkflowSidepanel {...defaultProps} />)

    expect(screen.getByText('Workflow name')).toBeInTheDocument()
    expect(screen.getByText('Description')).toBeInTheDocument()
  })

  it('handles empty workflow name', () => {
    render(<WorkflowSidepanel {...defaultProps} workflowName="" />)

    const nameInput = screen.getByLabelText('Workflow name in workflow details')
    expect(nameInput).toHaveValue('')
  })

  it('handles empty workflow description', () => {
    render(<WorkflowSidepanel {...defaultProps} workflowDescription="" />)

    const descriptionInput = screen.getByLabelText('Description')
    expect(descriptionInput).toHaveValue('')
  })
})
