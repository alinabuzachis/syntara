import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AddNodePanel, AddNodePanelHeader } from './AddNodePanel'
import { NodeRegistry } from './registry/NodeRegistry'

vi.mock('./registry/NodeRegistry', () => ({
  NodeRegistry: {
    getAll: vi.fn(),
    get: vi.fn(),
  },
}))

const mockNodeTypes = [
  {
    id: 'action',
    label: 'Action',
    icon: () => <div>ActionIcon</div>,
    category: 'task',
    description: 'Execute scripts or make API calls',
    order: 30,
    formComponent: () => null,
    onSubmit: vi.fn(),
  },
  {
    id: 'trigger',
    label: 'Trigger',
    icon: () => <div>TriggerIcon</div>,
    category: 'trigger',
    description: 'Start the workflow',
    order: 10,
    formComponent: () => null,
    onSubmit: vi.fn(),
    subtypes: [
      {
        id: 'trigger-manual',
        label: 'Manual',
        icon: () => <div>ManualIcon</div>,
      },
    ],
  },
]

describe('AddNodePanelHeader', () => {
  const mockOnBack = vi.fn()
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the panel title', () => {
    render(
      <AddNodePanelHeader
        panelTitle="Add node"
        isShowingSubtypeList={false}
        hasNoWorkflowNodes={false}
        onBack={mockOnBack}
        onClose={mockOnClose}
      />
    )

    expect(screen.getByText('Add node')).toBeInTheDocument()
  })

  it('shows back button when showing subtypes and not hasNoWorkflowNodes', () => {
    render(
      <AddNodePanelHeader
        panelTitle="Select a node"
        isShowingSubtypeList
        hasNoWorkflowNodes={false}
        onBack={mockOnBack}
        onClose={mockOnClose}
      />
    )

    expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument()
  })

  it('does not show back button when hasNoWorkflowNodes', () => {
    render(
      <AddNodePanelHeader
        panelTitle="Select a node"
        isShowingSubtypeList
        hasNoWorkflowNodes
        onBack={mockOnBack}
        onClose={mockOnClose}
      />
    )

    expect(screen.queryByRole('button', { name: /Back/i })).not.toBeInTheDocument()
  })

  it('shows close button when not hasNoWorkflowNodes', () => {
    render(
      <AddNodePanelHeader
        panelTitle="Add node"
        isShowingSubtypeList={false}
        hasNoWorkflowNodes={false}
        onBack={mockOnBack}
        onClose={mockOnClose}
      />
    )

    expect(screen.getByRole('button', { name: /Close/i })).toBeInTheDocument()
  })

  it('hides close button when hasNoWorkflowNodes', () => {
    render(
      <AddNodePanelHeader
        panelTitle="Add node"
        isShowingSubtypeList={false}
        hasNoWorkflowNodes
        onBack={mockOnBack}
        onClose={mockOnClose}
      />
    )

    expect(screen.queryByRole('button', { name: /Close/i })).not.toBeInTheDocument()
  })

  it('calls onBack when back button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <AddNodePanelHeader
        panelTitle="Select a node"
        isShowingSubtypeList
        hasNoWorkflowNodes={false}
        onBack={mockOnBack}
        onClose={mockOnClose}
      />
    )

    await user.click(screen.getByRole('button', { name: /Back/i }))

    expect(mockOnBack).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <AddNodePanelHeader
        panelTitle="Add node"
        isShowingSubtypeList={false}
        hasNoWorkflowNodes={false}
        onBack={mockOnBack}
        onClose={mockOnClose}
      />
    )

    await user.click(screen.getByRole('button', { name: /Close/i }))

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })
})

describe('AddNodePanel Component', () => {
  const mockOnClose = vi.fn()
  const mockOnSelectNode = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(NodeRegistry.getAll).mockReturnValue(mockNodeTypes as never[])
    vi.mocked(NodeRegistry.get).mockImplementation(
      (id: string) => mockNodeTypes.find((node) => node.id === id) as never
    )
  })

  it('renders the panel with title and close button', () => {
    render(<AddNodePanel onClose={mockOnClose} onSelectNode={mockOnSelectNode} />)

    expect(screen.getByText('Add node')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Close/i })).toBeInTheDocument()
  })

  it('calls onSelectNode when a base node is selected', async () => {
    const user = userEvent.setup()
    render(<AddNodePanel onClose={mockOnClose} onSelectNode={mockOnSelectNode} />)

    await user.click(screen.getByRole('button', { name: 'Action' }))

    expect(mockOnSelectNode).toHaveBeenCalledWith('action', null)
  })

  it('shows subtypes and calls onSelectNode with subtype', async () => {
    const user = userEvent.setup()
    render(<AddNodePanel onClose={mockOnClose} onSelectNode={mockOnSelectNode} />)

    await user.click(screen.getByRole('button', { name: 'Trigger' }))
    await user.click(screen.getByRole('button', { name: 'Manual' }))

    expect(mockOnSelectNode).toHaveBeenCalledWith('trigger', 'trigger-manual')
  })

  it('shows back button for subtype list and returns to main list', async () => {
    const user = userEvent.setup()
    render(<AddNodePanel onClose={mockOnClose} onSelectNode={mockOnSelectNode} />)

    await user.click(screen.getByRole('button', { name: 'Trigger' }))

    expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Back/i }))

    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument()
  })

  it('filters to trigger nodes when no workflow nodes exist', () => {
    render(<AddNodePanel onClose={mockOnClose} onSelectNode={mockOnSelectNode} hasNoWorkflowNodes />)

    expect(screen.getByRole('button', { name: 'Manual' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Action' })).not.toBeInTheDocument()
  })

  it('hides close and back buttons when no workflow nodes exist', () => {
    render(<AddNodePanel onClose={mockOnClose} onSelectNode={mockOnSelectNode} hasNoWorkflowNodes />)

    expect(screen.queryByRole('button', { name: /Close/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Back/i })).not.toBeInTheDocument()
  })

  it('filters out triggers when adding from edge', () => {
    render(<AddNodePanel onClose={mockOnClose} onSelectNode={mockOnSelectNode} sourceNodeId="node-123" />)

    expect(screen.queryByRole('button', { name: 'Trigger' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument()
  })

  it('filters out triggers when replacing a generic node', () => {
    render(<AddNodePanel onClose={mockOnClose} onSelectNode={mockOnSelectNode} replacementNodeId="node-456" />)

    expect(screen.queryByRole('button', { name: 'Trigger' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument()
  })
})
