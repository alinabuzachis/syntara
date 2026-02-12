import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AddNodePanel } from './AddNodePanel'
import { NodeRegistry } from './registry/NodeRegistry'

// Mock the NodeRegistryAdd
vi.mock('./registry/NodeRegistry', () => ({
  NodeRegistry: {
    getAll: vi.fn(),
    get: vi.fn(),
  },
}))

// Mock form component that will be used in tests
const MockFormComponent = ({
  onSubmit,
  onCancel,
}: {
  onSubmit: (data: Record<string, unknown>) => void
  onCancel: () => void
}) => (
  <div data-testid="mock-form">
    <button onClick={() => onSubmit({ name: 'Test Node' })} data-testid="form-submit">
      Submit
    </button>
    <button onClick={onCancel} data-testid="form-cancel">
      Cancel
    </button>
  </div>
)

describe('AddNodePanel Component', () => {
  const mockOnClose = vi.fn()
  const mockOnNodeSelect = vi.fn()
  const mockOnNodeError = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('renders the panel with title and close button', () => {
      vi.mocked(NodeRegistry.getAll).mockReturnValue([])

      render(<AddNodePanel onClose={mockOnClose} onNodeSelect={mockOnNodeSelect} onNodeError={mockOnNodeError} />)

      expect(screen.getByText('Add node')).toBeInTheDocument()
      // The close button exists (SidePanel renders it)
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThan(0)
    })

    it('renders all registered node types', () => {
      const mockNodeTypes = [
        {
          id: 'action',
          label: 'Action',
          icon: () => <div>ActionIcon</div>,
          category: 'action',
          description: 'Execute scripts or make API calls',
          keywords: ['script', 'api'],
          order: 30,
          formComponent: MockFormComponent,
          onSubmit: vi.fn(),
        },
        {
          id: 'trigger',
          label: 'Trigger',
          icon: () => <div>TriggerIcon</div>,
          category: 'trigger',
          description: 'Start workflow on an event',
          keywords: ['event', 'manual'],
          order: 10,
          formComponent: MockFormComponent,
          onSubmit: vi.fn(),
        },
      ]

      vi.mocked(NodeRegistry.getAll).mockReturnValue(mockNodeTypes as never)

      render(<AddNodePanel onClose={mockOnClose} onNodeSelect={mockOnNodeSelect} onNodeError={mockOnNodeError} />)

      expect(screen.getByText('Action')).toBeInTheDocument()
      expect(screen.getByText('Execute scripts or make API calls')).toBeInTheDocument()
      expect(screen.getByText('Trigger')).toBeInTheDocument()
      expect(screen.getByText('Start workflow on an event')).toBeInTheDocument()
    })

    it('renders empty panel when no node types are registered', () => {
      vi.mocked(NodeRegistry.getAll).mockReturnValue([])

      render(<AddNodePanel onClose={mockOnClose} onNodeSelect={mockOnNodeSelect} onNodeError={mockOnNodeError} />)

      expect(screen.getByText('Add node')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /action/i })).not.toBeInTheDocument()
    })
  })

  describe('Node Filtering', () => {
    const mockNodes = [
      {
        id: 'action',
        label: 'Action',
        icon: () => <div>ActionIcon</div>,
        category: 'action',
        description: 'Execute scripts or make API calls',
        keywords: ['script'],
        order: 30,
        formComponent: MockFormComponent,
        onSubmit: vi.fn(),
      },
      {
        id: 'trigger',
        label: 'Trigger',
        icon: () => <div>TriggerIcon</div>,
        category: 'trigger',
        description: 'Start workflow on an event',
        keywords: ['event'],
        order: 10,
        formComponent: MockFormComponent,
        onSubmit: vi.fn(),
      },
    ]

    it('forces trigger subtype selection and hides close/back when workflow is empty', () => {
      const triggerNodeWithSubtypes = {
        ...mockNodes[1],
        subtypes: [
          {
            id: 'trigger-manual',
            label: 'Manual trigger',
            icon: () => <div>ManualIcon</div>,
            description: 'Automation will start when run is clicked.',
          },
          {
            id: 'trigger-scheduled',
            label: 'Schedule trigger',
            icon: () => <div>ScheduleIcon</div>,
            description: 'Automation will start based on a schedule.',
          },
        ],
      }

      vi.mocked(NodeRegistry.getAll).mockReturnValue([triggerNodeWithSubtypes] as never)
      vi.mocked(NodeRegistry.get).mockReturnValue(triggerNodeWithSubtypes as never)

      render(<AddNodePanel onClose={mockOnClose} hasNoWorkflowNodes />)

      expect(NodeRegistry.get).toHaveBeenCalledWith('trigger')
      expect(screen.queryByTestId('mock-form')).not.toBeInTheDocument()
      expect(screen.getByText('Manual trigger')).toBeInTheDocument()
      expect(screen.getByText('Schedule trigger')).toBeInTheDocument()
      expect(screen.queryByLabelText('Close')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument()
    })

    it('filters out trigger nodes when sourceNodeId is provided', () => {
      vi.mocked(NodeRegistry.getAll).mockReturnValue(mockNodes as never)

      render(<AddNodePanel onClose={mockOnClose} sourceNodeId="node-123" />)

      expect(screen.getByText('Action')).toBeInTheDocument()
      expect(screen.queryByText('Trigger')).not.toBeInTheDocument()
    })

    it('includes all node types when sourceNodeId is not provided', () => {
      vi.mocked(NodeRegistry.getAll).mockReturnValue(mockNodes as never)

      render(<AddNodePanel onClose={mockOnClose} />)

      expect(screen.getByText('Action')).toBeInTheDocument()
      expect(screen.getByText('Trigger')).toBeInTheDocument()
    })
  })

  describe('Node Selection', () => {
    it('shows form when node type without subtypes is clicked', async () => {
      const user = userEvent.setup()
      const mockNodeTypes = [
        {
          id: 'approval',
          label: 'Approval',
          icon: () => <div>ApprovalIcon</div>,
          category: 'approval',
          description: 'Require approval before continuing',
          keywords: ['approval'],
          order: 30,
          formComponent: MockFormComponent,
          onSubmit: vi.fn(),
        },
      ]

      vi.mocked(NodeRegistry.getAll).mockReturnValue(mockNodeTypes as never)
      vi.mocked(NodeRegistry.get).mockReturnValue(mockNodeTypes[0] as never)

      render(<AddNodePanel onClose={mockOnClose} onNodeSelect={mockOnNodeSelect} onNodeError={mockOnNodeError} />)

      const approvalButton = screen.getByRole('button', { name: /approval/i })
      await user.click(approvalButton)

      expect(screen.getByTestId('mock-form')).toBeInTheDocument()
    })

    it('shows action subtypes and opens form when subtype is selected', async () => {
      const user = userEvent.setup()
      const actionNode = {
        id: 'action',
        label: 'Action',
        icon: () => <div>ActionIcon</div>,
        category: 'action',
        description: 'Execute scripts or make API calls',
        keywords: ['script', 'api'],
        order: 30,
        selectionTitle: 'Select an action node',
        formComponent: MockFormComponent,
        onSubmit: vi.fn(),
        subtypes: [
          {
            id: 'action-script',
            label: 'Script',
            icon: () => <div>ScriptIcon</div>,
            description: 'Execute code to manage complex conditions.',
            formTitle: 'Configure Script Actions',
          },
          {
            id: 'action-api',
            label: 'REST API',
            icon: () => <div>ApiIcon</div>,
            description: 'Trigger an action or retrieve data.',
            formTitle: 'Configure REST API Actions',
          },
        ],
      }

      vi.mocked(NodeRegistry.getAll).mockReturnValue([actionNode] as never)
      vi.mocked(NodeRegistry.get).mockReturnValue(actionNode as never)

      render(<AddNodePanel onClose={mockOnClose} onNodeSelect={mockOnNodeSelect} onNodeError={mockOnNodeError} />)

      await user.click(screen.getByRole('button', { name: /action/i }))

      expect(screen.getByText('Select an action node')).toBeInTheDocument()
      expect(screen.getByText('Script')).toBeInTheDocument()
      expect(screen.getByText('REST API')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /script/i }))

      expect(screen.getByText('Configure Script Actions')).toBeInTheDocument()
      expect(screen.getByTestId('mock-form')).toBeInTheDocument()
    })

    it('shows logic subtypes and opens form when subtype is selected', async () => {
      const user = userEvent.setup()
      const logicNode = {
        id: 'logic',
        label: 'Logic',
        icon: () => <div>LogicIcon</div>,
        category: 'logic',
        description: 'Add conditional logic and branching',
        keywords: ['condition', 'loop', 'converge'],
        order: 20,
        selectionTitle: 'Select a logic node',
        formComponent: MockFormComponent,
        onSubmit: vi.fn(),
        subtypes: [
          {
            id: 'logic-condition',
            label: 'Conditional',
            icon: () => <div>ConditionalIcon</div>,
            description: 'Set parameters to branch the automation.',
            formTitle: 'Configure Conditional Logic',
          },
          {
            id: 'logic-converge',
            label: 'Converge',
            icon: () => <div>ConvergeIcon</div>,
            description: 'Converge automation to single path.',
          },
          {
            id: 'logic-loop',
            label: 'Loop',
            icon: () => <div>LoopIcon</div>,
            description: 'Batch automation to repeat specific actions.',
          },
        ],
      }

      vi.mocked(NodeRegistry.getAll).mockReturnValue([logicNode] as never)
      vi.mocked(NodeRegistry.get).mockReturnValue(logicNode as never)

      render(<AddNodePanel onClose={mockOnClose} onNodeSelect={mockOnNodeSelect} onNodeError={mockOnNodeError} />)

      await user.click(screen.getByRole('button', { name: /logic/i }))

      expect(screen.getByText('Select a logic node')).toBeInTheDocument()
      expect(screen.getByText('Conditional')).toBeInTheDocument()
      expect(screen.getByText('Converge')).toBeInTheDocument()
      expect(screen.getByText('Loop')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /conditional/i }))

      expect(screen.getByText('Configure Conditional Logic')).toBeInTheDocument()
      expect(screen.getByTestId('mock-form')).toBeInTheDocument()
    })

    it('hides form when same node type is clicked again', async () => {
      const user = userEvent.setup()
      const mockNodeTypes = [
        {
          id: 'action',
          label: 'Action',
          icon: () => <div>ActionIcon</div>,
          category: 'action',
          description: 'Execute scripts or make API calls',
          keywords: ['script'],
          order: 30,
          formComponent: MockFormComponent,
          onSubmit: vi.fn(),
        },
      ]

      vi.mocked(NodeRegistry.getAll).mockReturnValue(mockNodeTypes as never)
      vi.mocked(NodeRegistry.get).mockReturnValue(mockNodeTypes[0] as never)

      render(<AddNodePanel onClose={mockOnClose} onNodeSelect={mockOnNodeSelect} onNodeError={mockOnNodeError} />)

      const actionButton = screen.getByRole('button', { name: /action/i })

      // Click to show form
      await user.click(actionButton)
      expect(screen.getByTestId('mock-form')).toBeInTheDocument()

      // Click back button to hide form
      const backButton = screen.getByRole('button', { name: /back/i })
      await user.click(backButton)
      expect(screen.queryByTestId('mock-form')).not.toBeInTheDocument()
    })

    it('switches forms when different node type is clicked', async () => {
      const user = userEvent.setup()
      const mockNodeTypes = [
        {
          id: 'action',
          label: 'Action',
          icon: () => <div>ActionIcon</div>,
          category: 'action',
          description: 'Execute scripts',
          keywords: ['script'],
          order: 30,
          formComponent: MockFormComponent,
          onSubmit: vi.fn(),
        },
        {
          id: 'trigger',
          label: 'Trigger',
          icon: () => <div>TriggerIcon</div>,
          category: 'trigger',
          description: 'Start workflow',
          keywords: ['event'],
          order: 10,
          formComponent: MockFormComponent,
          onSubmit: vi.fn(),
        },
      ]

      vi.mocked(NodeRegistry.getAll).mockReturnValue(mockNodeTypes as never)
      vi.mocked(NodeRegistry.get).mockImplementation((id: string) => mockNodeTypes.find((n) => n.id === id) as never)

      render(<AddNodePanel onClose={mockOnClose} onNodeSelect={mockOnNodeSelect} onNodeError={mockOnNodeError} />)

      // Click first node type
      await user.click(screen.getByRole('button', { name: /action/i }))
      expect(screen.getByTestId('mock-form')).toBeInTheDocument()

      // Click back button to return to node type list
      const backButton = screen.getByRole('button', { name: /back/i })
      await user.click(backButton)

      // Click second node type
      await user.click(screen.getByRole('button', { name: /trigger/i }))
      expect(screen.getByTestId('mock-form')).toBeInTheDocument()
    })
  })

  describe('Form Submission', () => {
    it('calls onSubmit and deselects node on successful form submission', async () => {
      const user = userEvent.setup()
      const mockOnSubmit = vi.fn((_data, onSuccess) => {
        onSuccess()
      })

      const mockNodeTypes = [
        {
          id: 'action',
          label: 'Action',
          icon: () => <div>ActionIcon</div>,
          category: 'action',
          description: 'Execute scripts',
          keywords: ['script'],
          order: 30,
          formComponent: MockFormComponent,
          onSubmit: mockOnSubmit,
        },
      ]

      vi.mocked(NodeRegistry.getAll).mockReturnValue(mockNodeTypes as never)
      vi.mocked(NodeRegistry.get).mockReturnValue(mockNodeTypes[0] as never)

      render(<AddNodePanel onClose={mockOnClose} onNodeSelect={mockOnNodeSelect} onNodeError={mockOnNodeError} />)

      // Open form
      await user.click(screen.getByRole('button', { name: /action/i }))

      // Submit form
      await user.click(screen.getByTestId('form-submit'))

      expect(mockOnSubmit).toHaveBeenCalled()
      // Form should be hidden after successful submission
      expect(screen.queryByTestId('mock-form')).not.toBeInTheDocument()
    })

    it('calls onNodeError callback when submission fails', async () => {
      const user = userEvent.setup()
      const errorMessage = 'Failed to create node'
      const mockOnSubmit = vi.fn((_data, _onSuccess, onError) => {
        onError(errorMessage)
      })

      const mockNodeTypes = [
        {
          id: 'action',
          label: 'Action',
          icon: () => <div>ActionIcon</div>,
          category: 'action',
          description: 'Execute scripts',
          keywords: ['script'],
          order: 30,
          formComponent: MockFormComponent,
          onSubmit: mockOnSubmit,
        },
      ]

      vi.mocked(NodeRegistry.getAll).mockReturnValue(mockNodeTypes as never)
      vi.mocked(NodeRegistry.get).mockReturnValue(mockNodeTypes[0] as never)

      render(<AddNodePanel onClose={mockOnClose} onNodeSelect={mockOnNodeSelect} onNodeError={mockOnNodeError} />)

      // Open form
      await user.click(screen.getByRole('button', { name: /action/i }))

      // Submit form
      await user.click(screen.getByTestId('form-submit'))

      expect(mockOnSubmit).toHaveBeenCalled()
      expect(mockOnNodeError).toHaveBeenCalledWith(errorMessage, 'Failed to add node')
    })

    it('does not call onNodeError when onNodeError prop is not provided', async () => {
      const user = userEvent.setup()
      const mockOnSubmit = vi.fn((_data, _onSuccess, onError) => {
        onError('Error')
      })

      const mockNodeTypes = [
        {
          id: 'action',
          label: 'Action',
          icon: () => <div>ActionIcon</div>,
          category: 'action',
          description: 'Execute scripts',
          keywords: ['script'],
          order: 30,
          formComponent: MockFormComponent,
          onSubmit: mockOnSubmit,
        },
      ]

      vi.mocked(NodeRegistry.getAll).mockReturnValue(mockNodeTypes as never)
      vi.mocked(NodeRegistry.get).mockReturnValue(mockNodeTypes[0] as never)

      // Render without onNodeError prop
      render(<AddNodePanel onClose={mockOnClose} />)

      await user.click(screen.getByRole('button', { name: /action/i }))
      await user.click(screen.getByTestId('form-submit'))

      // Should not throw error even though onNodeError is not provided
      expect(mockOnSubmit).toHaveBeenCalled()
    })
  })

  describe('Form Cancellation', () => {
    it('hides form when cancel button is clicked', async () => {
      const user = userEvent.setup()
      const mockNodeTypes = [
        {
          id: 'action',
          label: 'Action',
          icon: () => <div>ActionIcon</div>,
          category: 'action',
          description: 'Execute scripts',
          keywords: ['script'],
          order: 30,
          formComponent: MockFormComponent,
          onSubmit: vi.fn(),
        },
      ]

      vi.mocked(NodeRegistry.getAll).mockReturnValue(mockNodeTypes as never)
      vi.mocked(NodeRegistry.get).mockReturnValue(mockNodeTypes[0] as never)

      render(<AddNodePanel onClose={mockOnClose} onNodeSelect={mockOnNodeSelect} onNodeError={mockOnNodeError} />)

      // Open form
      await user.click(screen.getByRole('button', { name: /action/i }))
      expect(screen.getByTestId('mock-form')).toBeInTheDocument()

      // Cancel form
      await user.click(screen.getByTestId('form-cancel'))
      expect(screen.queryByTestId('mock-form')).not.toBeInTheDocument()
    })
  })

  describe('Panel Close', () => {
    it('calls onClose when close button is clicked', async () => {
      const user = userEvent.setup()
      vi.mocked(NodeRegistry.getAll).mockReturnValue([])

      render(<AddNodePanel onClose={mockOnClose} onNodeSelect={mockOnNodeSelect} onNodeError={mockOnNodeError} />)

      // The close button is the first button in the header (rendered by SidePanel)
      const buttons = screen.getAllByRole('button')
      const closeButton = buttons[0] // The X button in the header
      await user.click(closeButton)

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('Node Highlighting', () => {
    it('applies selected styling to selected node', async () => {
      const user = userEvent.setup()
      const mockNodeTypes = [
        {
          id: 'action',
          label: 'Action',
          icon: () => <div>ActionIcon</div>,
          category: 'action',
          description: 'Execute scripts',
          keywords: ['script'],
          order: 30,
          formComponent: MockFormComponent,
          onSubmit: vi.fn(),
        },
      ]

      vi.mocked(NodeRegistry.getAll).mockReturnValue(mockNodeTypes as never)
      vi.mocked(NodeRegistry.get).mockReturnValue(mockNodeTypes[0] as never)

      render(<AddNodePanel onClose={mockOnClose} onNodeSelect={mockOnNodeSelect} onNodeError={mockOnNodeError} />)

      const actionButton = screen.getByRole('button', { name: /action/i })

      // Initially not selected (cards are visible, no form)
      expect(actionButton).toBeInTheDocument()
      expect(screen.queryByTestId('mock-form')).not.toBeInTheDocument()

      // Click to select - cards should be hidden, form should show
      await user.click(actionButton)
      expect(screen.queryByRole('button', { name: /action/i })).not.toBeInTheDocument() // Cards hidden
      expect(screen.getByTestId('mock-form')).toBeInTheDocument() // Form shown
    })
  })
})
