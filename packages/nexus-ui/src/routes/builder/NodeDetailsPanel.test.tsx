import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Node } from '@xyflow/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useNodeMenuActions } from '../workflows/canvas/nodes/hooks/useNodeMenuActions'
import type { NodeType } from '../workflows/canvas/nodes/NodeType'

import { NodeDetailsPanel } from './NodeDetailsPanel'

const mockMoveActivityAfter = vi.fn()
const mockUpdateActivity = vi.fn()
const mockReplaceActivity = vi.fn()
const mockRemoveActivity = vi.fn()
const mockShowError = vi.fn()

const mockStoreState = vi.hoisted(() => ({
  currentWorkflow: { triggers: [], workflow: { activities: [] } },
}))

const mockUseWorkflowStore = vi.hoisted(() => {
  const store = vi.fn((selector?: (state: { currentWorkflow: unknown }) => unknown) => {
    const state = { currentWorkflow: mockStoreState.currentWorkflow }
    return selector ? selector(state) : state
  }) as unknown as { (selector?: (state: { currentWorkflow: unknown }) => unknown): unknown; getState: () => unknown }

  store.getState = () => ({ currentWorkflow: mockStoreState.currentWorkflow })
  return store
})

vi.mock('../../stores/useWorkflowStore', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../stores/useWorkflowStore')>()
  return {
    ...original,
    useWorkflowStore: mockUseWorkflowStore,
    useWorkflowStoreActions: vi.fn(() => ({
      moveActivityAfter: mockMoveActivityAfter,
      updateActivity: mockUpdateActivity,
      replaceActivity: mockReplaceActivity,
      removeActivity: mockRemoveActivity,
    })),
    selectCurrentWorkflow: (state: { currentWorkflow: unknown }) => state.currentWorkflow,
  }
})

vi.mock('../../components/alerts', () => ({
  useAlerts: vi.fn(() => ({
    showError: mockShowError,
  })),
}))

const { mockNodeRegistryGetAll, mockNodeRegistryGet } = vi.hoisted(() => ({
  mockNodeRegistryGetAll: vi.fn(),
  mockNodeRegistryGet: vi.fn(),
}))

vi.mock('./registry/NodeRegistry', () => ({
  NodeRegistry: {
    getAll: mockNodeRegistryGetAll,
    get: mockNodeRegistryGet,
  },
}))

vi.mock('./node-details', () => ({
  TaskNodeDetails: () => <div data-testid="task-details" />,
  ApprovalNodeDetails: () => <div data-testid="approval-details" />,
  ConditionNodeDetails: () => <div data-testid="condition-details" />,
  LoopNodeDetails: () => <div data-testid="loop-details" />,
  ConvergeNodeDetails: () => <div data-testid="converge-details" />,
  TriggerNodeDetails: () => <div data-testid="trigger-details" />,
}))

vi.mock('./NodeRawDataView', () => ({
  NodeRawDataView: () => <div data-testid="raw-node-view" />,
}))

vi.mock('./panels/hooks/useNodeExecutionData', () => ({
  useNodeExecutionData: vi.fn(() => ({ inputData: null, outputData: null, isLoading: false })),
}))

vi.mock('./panels/InputPanel', () => ({
  InputPanel: () => <div data-testid="input-panel">Input</div>,
}))

vi.mock('./panels/OutputPanel', () => ({
  OutputPanel: () => <div data-testid="output-panel">Output</div>,
}))

vi.mock('../workflows/canvas/nodes/hooks/useNodeMenuActions', () => ({
  useNodeMenuActions: vi.fn(() => []),
  MenuNodeType: { ACTIVITY: 'activity', TRIGGER: 'trigger' },
}))

vi.mock('../workflows/canvas/nodes/common/NodeMenu', () => ({
  NodeMenu: ({ menuActions }: { menuActions: Array<{ onClick: () => void }> }) => (
    <button onClick={() => menuActions[0]?.onClick()} type="button">
      Menu
    </button>
  ),
}))

describe('NodeDetailsPanel', () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockStoreState.currentWorkflow = { triggers: [], workflow: { activities: [] } }
    mockNodeRegistryGetAll.mockReturnValue([] as never)
  })

  it('renders add mode form and closes on submit', async () => {
    const user = userEvent.setup()
    const mockOnSubmit = vi.fn((_data, onSuccess: (nodeId?: string) => void) => onSuccess('node-1'))

    mockNodeRegistryGet.mockReturnValue({
      id: 'action',
      label: 'Action',
      icon: () => <div>ActionIcon</div>,
      category: 'task',
      formComponent: ({ onSubmit }: { onSubmit: (data: Record<string, unknown>) => void }) => (
        <button onClick={() => onSubmit({})} type="button">
          Submit
        </button>
      ),
      onSubmit: mockOnSubmit,
    } as never)

    render(<NodeDetailsPanel mode="add" nodeTypeId="action" nodeSubtypeId={null} onClose={mockOnClose} />)

    await user.click(screen.getByRole('button', { name: /Submit/i }))

    expect(mockOnClose).toHaveBeenCalled()
  })

  it('updates replacement node when new node is created', async () => {
    const user = userEvent.setup()
    const mockOnSubmit = vi.fn((_data, onSuccess: (nodeId?: string) => void) => onSuccess('new-1'))

    mockStoreState.currentWorkflow = {
      triggers: [],
      workflow: {
        activities: [
          {
            id: 'new-1',
            type: 'task',
            name: 'New Task',
            task: { executor: 'script', config: {} },
            metadata: { __isGeneric: true, __customMessage: 'test message' },
          },
        ],
      },
    } as never

    mockNodeRegistryGet.mockReturnValue({
      id: 'action',
      label: 'Action',
      icon: () => <div>ActionIcon</div>,
      category: 'task',
      formComponent: ({ onSubmit }: { onSubmit: (data: Record<string, unknown>) => void }) => (
        <button onClick={() => onSubmit({})} type="button">
          Submit
        </button>
      ),
      onSubmit: mockOnSubmit,
    } as never)

    render(
      <NodeDetailsPanel
        mode="add"
        nodeTypeId="action"
        nodeSubtypeId={null}
        replacementNodeId="replacement-1"
        onClose={mockOnClose}
      />
    )

    await user.click(screen.getByRole('button', { name: /Submit/i }))

    expect(mockRemoveActivity).toHaveBeenCalledWith('new-1')
    expect(mockReplaceActivity).toHaveBeenCalledWith(
      'replacement-1',
      expect.objectContaining({
        id: 'replacement-1',
        // __isGeneric is removed by cleanMetadata before replaceActivity is called
        metadata: { __customMessage: 'test message' },
      })
    )
  })

  it('clears metadata when replacement node update has no new node id', async () => {
    const user = userEvent.setup()
    const mockOnSubmit = vi.fn((_data, onSuccess: (nodeId?: string) => void) => onSuccess())

    mockStoreState.currentWorkflow = {
      triggers: [],
      workflow: {
        activities: [
          {
            id: 'replacement-1',
            type: 'task',
            name: 'Replacement Task',
            task: { executor: 'script', config: {} },
            metadata: { __isGeneric: true },
          },
        ],
      },
    } as never

    mockNodeRegistryGet.mockReturnValue({
      id: 'action',
      label: 'Action',
      icon: () => <div>ActionIcon</div>,
      category: 'task',
      formComponent: ({ onSubmit }: { onSubmit: (data: Record<string, unknown>) => void }) => (
        <button onClick={() => onSubmit({})} type="button">
          Submit
        </button>
      ),
      onSubmit: mockOnSubmit,
    } as never)

    render(
      <NodeDetailsPanel
        mode="add"
        nodeTypeId="action"
        nodeSubtypeId={null}
        replacementNodeId="replacement-1"
        onClose={mockOnClose}
      />
    )

    await user.click(screen.getByRole('button', { name: /Submit/i }))

    expect(mockUpdateActivity).toHaveBeenCalledWith(
      'replacement-1',
      expect.objectContaining({
        metadata: undefined,
      })
    )
  })

  it('shows error when add step fails', async () => {
    const user = userEvent.setup()
    const mockOnSubmit = vi.fn((_data, _onSuccess, onError: (error: string) => void) => onError('boom'))

    mockNodeRegistryGet.mockReturnValue({
      id: 'action',
      label: 'Action',
      icon: () => <div>ActionIcon</div>,
      category: 'task',
      formComponent: ({ onSubmit }: { onSubmit: (data: Record<string, unknown>) => void }) => (
        <button onClick={() => onSubmit({})} type="button">
          Submit
        </button>
      ),
      onSubmit: mockOnSubmit,
    } as never)

    render(<NodeDetailsPanel mode="add" nodeTypeId="action" nodeSubtypeId={null} onClose={mockOnClose} />)

    await user.click(screen.getByRole('button', { name: /Submit/i }))

    expect(mockShowError).toHaveBeenCalledWith({ title: 'Add step failed', description: 'boom' })
  })

  it('moves and connects new node when adding from an edge', async () => {
    const user = userEvent.setup()
    const mockOnSubmit = vi.fn((_data, onSuccess: (nodeId?: string) => void) => onSuccess('node-2'))
    const mockOnConnect = vi.fn()

    mockNodeRegistryGet.mockReturnValue({
      id: 'action',
      label: 'Action',
      icon: () => <div>ActionIcon</div>,
      category: 'task',
      formComponent: ({ onSubmit }: { onSubmit: (data: Record<string, unknown>) => void }) => (
        <button onClick={() => onSubmit({})} type="button">
          Submit
        </button>
      ),
      onSubmit: mockOnSubmit,
    } as never)

    render(
      <NodeDetailsPanel
        mode="add"
        nodeTypeId="action"
        nodeSubtypeId={null}
        sourceNodeId="node-1"
        onConnect={mockOnConnect}
        onClose={mockOnClose}
      />
    )

    await user.click(screen.getByRole('button', { name: /Submit/i }))

    expect(mockMoveActivityAfter).toHaveBeenCalledWith('node-2', 'node-1')
    expect(mockOnConnect).toHaveBeenCalledWith('node-1', 'node-2')
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('closes when the close button is clicked', async () => {
    const user = userEvent.setup()

    mockNodeRegistryGet.mockReturnValue({
      id: 'action',
      label: 'Action',
      icon: () => <div>ActionIcon</div>,
      category: 'task',
      formComponent: () => <div>Form</div>,
      onSubmit: vi.fn(),
    } as never)

    render(<NodeDetailsPanel mode="add" nodeTypeId="action" nodeSubtypeId={null} onClose={mockOnClose} />)

    await user.click(screen.getByRole('button', { name: /Close/i }))

    expect(mockOnClose).toHaveBeenCalled()
  })

  it('renders task details in edit mode', () => {
    const taskNode: Node<NodeType['data']> = {
      id: 'task-1',
      type: 'task',
      position: { x: 0, y: 0 },
      data: { id: 'task-1', type: 'task', name: 'Task', task: { executor: 'script', config: {} } } as never,
    }

    render(<NodeDetailsPanel mode="edit" node={taskNode} onClose={mockOnClose} />)

    expect(screen.getByTestId('task-details')).toBeInTheDocument()
  })

  it('renders trigger details in edit mode when trigger exists', () => {
    mockStoreState.currentWorkflow = { triggers: [{ type: 'manual' }], workflow: { activities: [] } } as never
    const triggerNode: Node<NodeType['data']> = {
      id: 'trigger-0',
      type: 'trigger',
      position: { x: 0, y: 0 },
      data: { id: 'trigger-0', type: 'trigger', name: 'Trigger' } as never,
    }

    render(<NodeDetailsPanel mode="edit" node={triggerNode} onClose={mockOnClose} />)

    expect(screen.getByTestId('trigger-details')).toBeInTheDocument()
    expect(screen.queryByText('Input')).not.toBeInTheDocument()
  })

  it('renders menu actions in edit mode and closes on delete', async () => {
    const user = userEvent.setup()
    const deleteAction = vi.fn()

    vi.mocked(useNodeMenuActions).mockReturnValueOnce([
      { id: 'delete', label: 'Delete', onClick: deleteAction, variant: 'danger' as const },
    ])

    const taskNode: Node<NodeType['data']> = {
      id: 'task-1',
      type: 'task',
      position: { x: 0, y: 0 },
      data: { id: 'task-1', type: 'task', name: 'Task', task: { executor: 'script', config: {} } } as never,
    }

    render(<NodeDetailsPanel mode="edit" node={taskNode} onClose={mockOnClose} />)

    await user.click(screen.getByRole('button', { name: /menu/i }))

    expect(deleteAction).toHaveBeenCalledTimes(1)
    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['condition', 'condition-details'],
    ['loop', 'loop-details'],
    ['converge', 'converge-details'],
    ['approval', 'approval-details'],
  ])('renders %s details in edit mode', (nodeType, testId) => {
    const nodeMap: Record<string, Node<NodeType['data']>> = {
      condition: {
        id: 'condition-1',
        type: 'condition',
        position: { x: 0, y: 0 },
        data: { id: 'condition-1', type: 'condition', name: 'Condition', condition: 'true' } as never,
      },
      loop: {
        id: 'loop-1',
        type: 'loop',
        position: { x: 0, y: 0 },
        data: { id: 'loop-1', type: 'loop', name: 'Loop', loop: { type: 'forEach', items: 'x', do: [] } } as never,
      },
      converge: {
        id: 'converge-1',
        type: 'converge',
        position: { x: 0, y: 0 },
        data: {
          id: 'converge-1',
          type: 'converge',
          name: 'Converge',
          converge: { branches: [], strategy: 'all' },
        } as never,
      },
      approval: {
        id: 'approval-1',
        type: 'approval',
        position: { x: 0, y: 0 },
        data: {
          id: 'approval-1',
          type: 'approval',
          name: 'Approval',
          task: { executor: 'approval', config: {} },
        } as never,
      },
    }

    render(<NodeDetailsPanel mode="edit" node={nodeMap[nodeType]} onClose={mockOnClose} />)
    expect(screen.getByTestId(testId)).toBeInTheDocument()
  })

  it('renders raw data view for unknown step types', () => {
    const unknownNode = {
      id: 'unknown-1',
      type: 'email',
      position: { x: 0, y: 0 },
      data: { id: 'unknown-1', type: 'email', name: 'Email' },
    } as unknown as Node<NodeType['data']>

    render(<NodeDetailsPanel mode="edit" node={unknownNode} onClose={mockOnClose} />)

    expect(screen.getByTestId('raw-node-view')).toBeInTheDocument()
  })

  it('hides input panel when adding a trigger', () => {
    mockNodeRegistryGet.mockReturnValue({
      id: 'trigger',
      label: 'Trigger',
      icon: () => <div>TriggerIcon</div>,
      category: 'trigger',
      formComponent: () => <div>Form</div>,
      onSubmit: vi.fn(),
    } as never)

    render(<NodeDetailsPanel mode="add" nodeTypeId="trigger" nodeSubtypeId={null} onClose={mockOnClose} />)

    expect(screen.queryByText('Input')).not.toBeInTheDocument()
  })
})
