import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BuilderFlow } from './BuilderFlow'
import { ExecutionViewContext } from './ExecutionViewContext'

// Capture ReactFlow props for assertions
let latestReactFlowProps: Record<string, unknown> | null = null

const workflowStoreState = {
  currentWorkflow: null as Record<string, unknown> | null,
  workflowVersion: 1,
  edges: [] as Array<Record<string, unknown>>,
  triggers: [] as Array<Record<string, unknown>>,
  activities: [] as Array<Record<string, unknown>>,
}

const executionStoreState = {
  activityStates: new Map<string, { status: string }>(),
}

vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as Record<string, unknown>),
    ReactFlow: (props: Record<string, unknown>) => {
      latestReactFlowProps = props
      return <div data-testid="reactflow" />
    },
    Background: () => null,
    BackgroundVariant: { Dots: 'dots' },
    applyEdgeChanges: (_changes: unknown, edges: Array<Record<string, unknown>>) => edges,
    applyNodeChanges: (_changes: unknown, nodes: Array<Record<string, unknown>>) => nodes,
    useReactFlow: () => ({
      fitView: vi.fn(),
      screenToFlowPosition: vi.fn(() => ({ x: 0, y: 0 })),
      updateNode: vi.fn(),
      getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
      getNode: vi.fn(),
    }),
  }
})

vi.mock('../automations/canvas/CanvasControls', () => ({
  CanvasControls: ({ onLayout }: { onLayout: () => void }) => {
    onLayout()
    return null
  },
}))

vi.mock('./edges/edgeMarkers', () => ({
  EdgeMarkers: () => null,
}))

vi.mock('./utils/layoutEngine', () => ({
  getLayoutedElements: (nodes: Array<Record<string, unknown>>, edges: Array<Record<string, unknown>>) => ({
    nodes,
    edges,
  }),
}))

vi.mock('./utils/validateConnection', () => ({
  validateConnection: () => true,
}))

vi.mock('./utils/detectLoopBackNodes', () => ({
  detectLoopBackNodes: () => new Set(['task-1', 'task-generic']),
}))

vi.mock('./hooks/useWorkflowInitialization', () => ({
  useWorkflowInitialization: () => ({
    isInitialized: true,
    hasRunInitialLayoutRef: { current: true },
    workflowVersionRef: { current: 1 },
  }),
}))

vi.mock('./hooks/useNodeUpdates', () => ({
  useNodeUpdates: () => ({
    newlyAddedNodeIdsRef: { current: new Set() },
  }),
}))

vi.mock('./hooks/useNodePositioning', () => ({
  useNodePositioning: () => {},
}))

vi.mock('./hooks/useEdgeSynchronization', () => ({
  useEdgeSynchronization: () => ({}),
}))

vi.mock('./hooks/useEdgeActiveState', () => ({
  useEdgeActiveState: () => {},
}))

vi.mock('./hooks/useButtonEdgeMaintenance', () => ({
  useButtonEdgeMaintenance: () => {},
}))

vi.mock('./hooks/usePendingEdgeManagement', () => ({
  usePendingEdgeManagement: () => {},
}))

vi.mock('./hooks/useConnectionHandlers', () => ({
  useConnectionHandlers: () => ({
    onConnect: vi.fn(),
    onConnectStart: vi.fn(),
    onConnectEnd: vi.fn(),
  }),
}))

vi.mock('./hooks/useNodeDeletion', () => ({
  useNodeDeletion: () => ({
    onNodesDelete: vi.fn(),
  }),
}))

vi.mock('../../stores/useWorkflowStore', () => {
  const useWorkflowStore = (selector: (state: Record<string, unknown>) => unknown) => selector(workflowStoreState)
  useWorkflowStore.getState = () => workflowStoreState

  return {
    useWorkflowStore,
    useWorkflowStoreActions: () => ({
      setWorkflow: vi.fn(),
      setEdges: vi.fn(),
      loadWorkflowWithEdges: vi.fn(),
    }),
    selectCurrentWorkflow: (state: Record<string, unknown>) => state.currentWorkflow,
    selectWorkflowVersion: (state: Record<string, unknown>) => state.workflowVersion,
    selectEdges: (state: Record<string, unknown>) => state.edges,
    selectTriggers: (state: Record<string, unknown>) => state.triggers,
    selectActivities: (state: Record<string, unknown>) => state.activities,
  }
})

vi.mock('../automations/stores/useExecutionStore', () => ({
  useExecutionStore: (selector: (state: { activityStates: Map<string, { status: string }> }) => unknown) =>
    selector(executionStoreState),
}))

function setWorkflowState(overrides: Partial<typeof workflowStoreState>) {
  Object.assign(workflowStoreState, overrides)
}

function setExecutionState(activityStates: Map<string, { status: string }>) {
  executionStoreState.activityStates = activityStates
}

describe('BuilderFlow execution view', () => {
  it('disables destructive interactions but keeps measurement updates', () => {
    setWorkflowState({
      currentWorkflow: {
        id: 'workflow-1',
        inputs: {},
        triggers: [{ type: 'manual', name: 'Manual Trigger' }],
        workflow: {
          activities: [
            { id: 'converge-1', type: 'converge' },
            { id: 'condition-1', type: 'condition', then: [], else: [] },
            { id: 'loop-1', type: 'loop', loop: { do: [] } },
            {
              id: 'task-1',
              type: 'task',
              name: 'Task 1',
              task: { executor: 'script', config: { language: 'bash', code: 'echo 1' } },
            },
            {
              id: 'task-generic',
              type: 'task',
              name: 'Generic Task',
              metadata: { __isGeneric: true },
              task: { executor: 'script', config: { language: 'bash', code: 'echo generic' } },
            },
            {
              id: 'task-approval',
              type: 'task',
              name: 'Approval Task',
              requiresApproval: true,
              approval: { approvers: ['admin'], prompt: 'Approve' },
              task: { executor: 'script', config: { language: 'bash', code: 'echo approve' } },
            },
            {
              id: 'task-loop-body',
              type: 'task',
              name: 'Loop Body',
              task: { executor: 'script', config: { language: 'bash', code: 'echo loop' } },
            },
          ],
        },
      },
      triggers: [{ type: 'manual', name: 'Manual Trigger' }],
      edges: [
        { id: 'edge-trigger-task', source: 'trigger-0', target: 'task-1' },
        { id: 'edge-task-loop', source: 'task-1', target: 'loop-1' },
        { id: 'edge-loop-body', source: 'loop-1', target: 'task-loop-body', sourceHandle: 'loop' },
        { id: 'edge-loop-back', source: 'task-loop-body', target: 'loop-1', targetHandle: 'end' },
        { id: 'edge-task-condition', source: 'task-1', target: 'condition-1' },
        { id: 'edge-condition-converge', source: 'condition-1', target: 'converge-1' },
      ],
    })

    setExecutionState(
      new Map([
        ['task-1', { status: 'completed' }],
        ['task-loop-body', { status: 'pending' }],
      ])
    )

    const { container } = render(
      <ExecutionViewContext.Provider value={true}>
        <BuilderFlow workflowId="workflow-1" panelOpen={false} executionStatus="running" />
      </ExecutionViewContext.Provider>
    )

    expect(screen.getByTestId('reactflow')).toBeInTheDocument()
    expect(latestReactFlowProps).not.toBeNull()

    const props = latestReactFlowProps as Record<string, unknown>
    expect(props.deleteKeyCode).toBeNull()
    expect(props.nodesDraggable).toBe(false)
    expect(props.nodesConnectable).toBe(false)
    expect(props.onNodesDelete).toBeUndefined()

    const nodes = props.nodes as Array<Record<string, unknown>>
    const edges = props.edges as Array<Record<string, unknown>>
    expect(nodes.some((node) => node.type === 'condition')).toBe(true)
    expect(nodes.some((node) => node.type === 'loop')).toBe(true)
    expect(nodes.some((node) => node.type === 'converge')).toBe(true)
    expect(nodes.some((node) => node.type === 'task-reversed')).toBe(true)
    expect(nodes.some((node) => node.type === 'generic')).toBe(true)
    expect(edges.some((edge) => edge.type === 'loopBack')).toBe(true)
    expect(edges.some((edge) => edge.type === 'loopOutgoing')).toBe(true)
    expect(edges.some((edge) => edge.data?.executionStatus === 'passed')).toBe(true)

    expect(container.querySelector('.pf-v6-c-spinner')).toBeInTheDocument()
  })

  it('keeps edit interactions enabled outside execution view', () => {
    render(<BuilderFlow workflowId="workflow-1" panelOpen={false} executionStatus={null} />)

    expect(screen.getByTestId('reactflow')).toBeInTheDocument()
    const props = latestReactFlowProps as Record<string, unknown>
    expect(props.deleteKeyCode).toEqual(['Delete', 'Backspace'])
    expect(props.nodesDraggable).toBe(true)
    expect(props.nodesConnectable).toBe(true)
  })

  it('marks loop node as running when loop body node has started', () => {
    setWorkflowState({
      currentWorkflow: {
        id: 'workflow-loop',
        inputs: {},
        triggers: [{ type: 'manual', name: 'Manual Trigger' }],
        workflow: {
          activities: [
            { id: 'loop-1', type: 'loop', name: 'My Loop', loop: { do: [] } },
            {
              id: 'task-loop-body',
              type: 'task',
              name: 'Loop Body Task',
              task: { executor: 'script', config: { language: 'bash', code: 'echo loop' } },
            },
            {
              id: 'task-done',
              type: 'task',
              name: 'Done Task',
              task: { executor: 'script', config: { language: 'bash', code: 'echo done' } },
            },
          ],
        },
      },
      triggers: [{ type: 'manual', name: 'Manual Trigger' }],
      edges: [
        { id: 'edge-trigger-loop', source: 'trigger-0', target: 'loop-1' },
        { id: 'edge-loop-body', source: 'loop-1', target: 'task-loop-body', sourceHandle: 'loop' },
        { id: 'edge-loop-done', source: 'loop-1', target: 'task-done', sourceHandle: 'done' },
      ],
    })

    // Loop body task is running, done task is still pending
    setExecutionState(
      new Map([
        ['task-loop-body', { status: 'running' }],
        ['task-done', { status: 'pending' }],
      ])
    )

    render(
      <ExecutionViewContext.Provider value={true}>
        <BuilderFlow workflowId="workflow-loop" panelOpen={false} executionStatus="running" />
      </ExecutionViewContext.Provider>
    )

    const props = latestReactFlowProps as Record<string, unknown>
    const nodes = props.nodes as Array<Record<string, unknown>>
    const loopNode = nodes.find((node) => node.id === 'loop-1')

    expect(loopNode).toBeDefined()
    expect((loopNode?.data as Record<string, unknown>)?.__executionState).toEqual({
      status: 'running',
      started_at: undefined,
      completed_at: undefined,
      error_details: undefined,
    })
  })

  it('marks loop node as completed when done path node has started', () => {
    setWorkflowState({
      currentWorkflow: {
        id: 'workflow-loop',
        inputs: {},
        triggers: [{ type: 'manual', name: 'Manual Trigger' }],
        workflow: {
          activities: [
            { id: 'loop-1', type: 'loop', name: 'My Loop', loop: { do: [] } },
            {
              id: 'task-loop-body',
              type: 'task',
              name: 'Loop Body Task',
              task: { executor: 'script', config: { language: 'bash', code: 'echo loop' } },
            },
            {
              id: 'task-done',
              type: 'task',
              name: 'Done Task',
              task: { executor: 'script', config: { language: 'bash', code: 'echo done' } },
            },
          ],
        },
      },
      triggers: [{ type: 'manual', name: 'Manual Trigger' }],
      edges: [
        { id: 'edge-trigger-loop', source: 'trigger-0', target: 'loop-1' },
        { id: 'edge-loop-body', source: 'loop-1', target: 'task-loop-body', sourceHandle: 'loop' },
        { id: 'edge-loop-done', source: 'loop-1', target: 'task-done', sourceHandle: 'done' },
      ],
    })

    // Loop completed, done task has started
    setExecutionState(
      new Map([
        ['task-loop-body', { status: 'completed' }],
        ['task-done', { status: 'running' }],
      ])
    )

    render(
      <ExecutionViewContext.Provider value={true}>
        <BuilderFlow workflowId="workflow-loop" panelOpen={false} executionStatus="running" />
      </ExecutionViewContext.Provider>
    )

    const props = latestReactFlowProps as Record<string, unknown>
    const nodes = props.nodes as Array<Record<string, unknown>>
    const loopNode = nodes.find((node) => node.id === 'loop-1')

    expect(loopNode).toBeDefined()
    expect((loopNode?.data as Record<string, unknown>)?.__executionState).toEqual({
      status: 'completed',
      started_at: undefined,
      completed_at: undefined,
      error_details: undefined,
    })
  })

  it('marks loop node as pending when neither loop body nor done path has started', () => {
    setWorkflowState({
      currentWorkflow: {
        id: 'workflow-loop',
        inputs: {},
        triggers: [{ type: 'manual', name: 'Manual Trigger' }],
        workflow: {
          activities: [
            { id: 'loop-1', type: 'loop', name: 'My Loop', loop: { do: [] } },
            {
              id: 'task-loop-body',
              type: 'task',
              name: 'Loop Body Task',
              task: { executor: 'script', config: { language: 'bash', code: 'echo loop' } },
            },
            {
              id: 'task-done',
              type: 'task',
              name: 'Done Task',
              task: { executor: 'script', config: { language: 'bash', code: 'echo done' } },
            },
          ],
        },
      },
      triggers: [{ type: 'manual', name: 'Manual Trigger' }],
      edges: [
        { id: 'edge-trigger-loop', source: 'trigger-0', target: 'loop-1' },
        { id: 'edge-loop-body', source: 'loop-1', target: 'task-loop-body', sourceHandle: 'loop' },
        { id: 'edge-loop-done', source: 'loop-1', target: 'task-done', sourceHandle: 'done' },
      ],
    })

    // Both tasks still pending
    setExecutionState(
      new Map([
        ['task-loop-body', { status: 'pending' }],
        ['task-done', { status: 'pending' }],
      ])
    )

    render(
      <ExecutionViewContext.Provider value={true}>
        <BuilderFlow workflowId="workflow-loop" panelOpen={false} executionStatus="running" />
      </ExecutionViewContext.Provider>
    )

    const props = latestReactFlowProps as Record<string, unknown>
    const nodes = props.nodes as Array<Record<string, unknown>>
    const loopNode = nodes.find((node) => node.id === 'loop-1')

    expect(loopNode).toBeDefined()
    expect((loopNode?.data as Record<string, unknown>)?.__executionState).toEqual({
      status: 'pending',
      started_at: undefined,
      completed_at: undefined,
      error_details: undefined,
    })
  })

  it('marks loop edge as passed when loop body node has started', () => {
    setWorkflowState({
      currentWorkflow: {
        id: 'workflow-loop',
        inputs: {},
        triggers: [{ type: 'manual', name: 'Manual Trigger' }],
        workflow: {
          activities: [
            { id: 'loop-1', type: 'loop', name: 'My Loop', loop: { do: [] } },
            {
              id: 'task-loop-body',
              type: 'task',
              name: 'Loop Body Task',
              task: { executor: 'script', config: { language: 'bash', code: 'echo loop' } },
            },
          ],
        },
      },
      triggers: [{ type: 'manual', name: 'Manual Trigger' }],
      edges: [
        { id: 'edge-trigger-loop', source: 'trigger-0', target: 'loop-1' },
        { id: 'edge-loop-body', source: 'loop-1', target: 'task-loop-body', sourceHandle: 'loop' },
      ],
    })

    // Loop body has started
    setExecutionState(new Map([['task-loop-body', { status: 'running' }]]))

    render(
      <ExecutionViewContext.Provider value={true}>
        <BuilderFlow workflowId="workflow-loop" panelOpen={false} executionStatus="running" />
      </ExecutionViewContext.Provider>
    )

    const props = latestReactFlowProps as Record<string, unknown>
    const edges = props.edges as Array<Record<string, unknown>>
    const loopEdge = edges.find((edge) => edge.sourceHandle === 'loop' && edge.source === 'loop-1')

    expect(loopEdge).toBeDefined()
    expect(loopEdge?.data).toHaveProperty('executionStatus', 'passed')
  })

  it('marks done edge as passed when done path node has started', () => {
    setWorkflowState({
      currentWorkflow: {
        id: 'workflow-loop',
        inputs: {},
        triggers: [{ type: 'manual', name: 'Manual Trigger' }],
        workflow: {
          activities: [
            { id: 'loop-1', type: 'loop', name: 'My Loop', loop: { do: [] } },
            {
              id: 'task-done',
              type: 'task',
              name: 'Done Task',
              task: { executor: 'script', config: { language: 'bash', code: 'echo done' } },
            },
          ],
        },
      },
      triggers: [{ type: 'manual', name: 'Manual Trigger' }],
      edges: [
        { id: 'edge-trigger-loop', source: 'trigger-0', target: 'loop-1' },
        { id: 'edge-loop-done', source: 'loop-1', target: 'task-done', sourceHandle: 'done' },
      ],
    })

    // Done task has started
    setExecutionState(new Map([['task-done', { status: 'completed' }]]))

    render(
      <ExecutionViewContext.Provider value={true}>
        <BuilderFlow workflowId="workflow-loop" panelOpen={false} executionStatus="running" />
      </ExecutionViewContext.Provider>
    )

    const props = latestReactFlowProps as Record<string, unknown>
    const edges = props.edges as Array<Record<string, unknown>>
    const doneEdge = edges.find((edge) => edge.sourceHandle === 'done' && edge.source === 'loop-1')

    expect(doneEdge).toBeDefined()
    expect(doneEdge?.data).toHaveProperty('executionStatus', 'passed')
  })

  it('marks loop edges as pending when target nodes are pending', () => {
    setWorkflowState({
      currentWorkflow: {
        id: 'workflow-loop',
        inputs: {},
        triggers: [{ type: 'manual', name: 'Manual Trigger' }],
        workflow: {
          activities: [
            { id: 'loop-1', type: 'loop', name: 'My Loop', loop: { do: [] } },
            {
              id: 'task-loop-body',
              type: 'task',
              name: 'Loop Body Task',
              task: { executor: 'script', config: { language: 'bash', code: 'echo loop' } },
            },
            {
              id: 'task-done',
              type: 'task',
              name: 'Done Task',
              task: { executor: 'script', config: { language: 'bash', code: 'echo done' } },
            },
          ],
        },
      },
      triggers: [{ type: 'manual', name: 'Manual Trigger' }],
      edges: [
        { id: 'edge-trigger-loop', source: 'trigger-0', target: 'loop-1' },
        { id: 'edge-loop-body', source: 'loop-1', target: 'task-loop-body', sourceHandle: 'loop' },
        { id: 'edge-loop-done', source: 'loop-1', target: 'task-done', sourceHandle: 'done' },
      ],
    })

    // Both tasks still pending
    setExecutionState(
      new Map([
        ['task-loop-body', { status: 'pending' }],
        ['task-done', { status: 'pending' }],
      ])
    )

    render(
      <ExecutionViewContext.Provider value={true}>
        <BuilderFlow workflowId="workflow-loop" panelOpen={false} executionStatus="running" />
      </ExecutionViewContext.Provider>
    )

    const props = latestReactFlowProps as Record<string, unknown>
    const edges = props.edges as Array<Record<string, unknown>>
    const loopEdge = edges.find((edge) => edge.sourceHandle === 'loop' && edge.source === 'loop-1')
    const doneEdge = edges.find((edge) => edge.sourceHandle === 'done' && edge.source === 'loop-1')

    expect(loopEdge).toBeDefined()
    expect(loopEdge?.data).toHaveProperty('executionStatus', 'pending')

    expect(doneEdge).toBeDefined()
    expect(doneEdge?.data).toHaveProperty('executionStatus', 'pending')
  })

  it('marks converge node as running when any incoming node is completed or failed', () => {
    setWorkflowState({
      currentWorkflow: {
        id: 'workflow-converge',
        inputs: {},
        triggers: [{ type: 'manual', name: 'Manual Trigger' }],
        workflow: {
          activities: [
            {
              id: 'task-1',
              type: 'task',
              name: 'Task 1',
              task: { executor: 'script', config: { language: 'bash', code: 'echo task1' } },
            },
            {
              id: 'task-2',
              type: 'task',
              name: 'Task 2',
              task: { executor: 'script', config: { language: 'bash', code: 'echo task2' } },
            },
            { id: 'converge-1', type: 'converge', name: 'Converge', converge: { strategy: 'all', branches: [] } },
          ],
        },
      },
      triggers: [{ type: 'manual', name: 'Manual Trigger' }],
      edges: [
        { id: 'edge-trigger-task1', source: 'trigger-0', target: 'task-1' },
        { id: 'edge-trigger-task2', source: 'trigger-0', target: 'task-2' },
        { id: 'edge-task1-converge', source: 'task-1', target: 'converge-1' },
        { id: 'edge-task2-converge', source: 'task-2', target: 'converge-1' },
      ],
    })

    // Task 1 completed, Task 2 still pending
    setExecutionState(
      new Map([
        ['task-1', { status: 'completed' }],
        ['task-2', { status: 'pending' }],
      ])
    )

    render(
      <ExecutionViewContext.Provider value={true}>
        <BuilderFlow workflowId="workflow-converge" panelOpen={false} executionStatus="running" />
      </ExecutionViewContext.Provider>
    )

    const props = latestReactFlowProps as Record<string, unknown>
    const nodes = props.nodes as Array<Record<string, unknown>>
    const convergeNode = nodes.find((node) => node.id === 'converge-1')

    expect(convergeNode).toBeDefined()
    expect((convergeNode?.data as Record<string, unknown>)?.__executionState).toEqual({
      status: 'running',
      started_at: undefined,
      completed_at: undefined,
      error_details: undefined,
    })
  })

  it('marks converge node as completed when all incoming nodes are completed or failed', () => {
    setWorkflowState({
      currentWorkflow: {
        id: 'workflow-converge',
        inputs: {},
        triggers: [{ type: 'manual', name: 'Manual Trigger' }],
        workflow: {
          activities: [
            {
              id: 'task-1',
              type: 'task',
              name: 'Task 1',
              task: { executor: 'script', config: { language: 'bash', code: 'echo task1' } },
            },
            {
              id: 'task-2',
              type: 'task',
              name: 'Task 2',
              task: { executor: 'script', config: { language: 'bash', code: 'echo task2' } },
            },
            { id: 'converge-1', type: 'converge', name: 'Converge', converge: { strategy: 'all', branches: [] } },
          ],
        },
      },
      triggers: [{ type: 'manual', name: 'Manual Trigger' }],
      edges: [
        { id: 'edge-trigger-task1', source: 'trigger-0', target: 'task-1' },
        { id: 'edge-trigger-task2', source: 'trigger-0', target: 'task-2' },
        { id: 'edge-task1-converge', source: 'task-1', target: 'converge-1' },
        { id: 'edge-task2-converge', source: 'task-2', target: 'converge-1' },
      ],
    })

    // Both tasks completed
    setExecutionState(
      new Map([
        ['task-1', { status: 'completed' }],
        ['task-2', { status: 'completed' }],
      ])
    )

    render(
      <ExecutionViewContext.Provider value={true}>
        <BuilderFlow workflowId="workflow-converge" panelOpen={false} executionStatus="running" />
      </ExecutionViewContext.Provider>
    )

    const props = latestReactFlowProps as Record<string, unknown>
    const nodes = props.nodes as Array<Record<string, unknown>>
    const convergeNode = nodes.find((node) => node.id === 'converge-1')

    expect(convergeNode).toBeDefined()
    expect((convergeNode?.data as Record<string, unknown>)?.__executionState).toEqual({
      status: 'completed',
      started_at: undefined,
      completed_at: undefined,
      error_details: undefined,
    })
  })

  it('marks converge node as completed when outgoing node has started', () => {
    setWorkflowState({
      currentWorkflow: {
        id: 'workflow-converge',
        inputs: {},
        triggers: [{ type: 'manual', name: 'Manual Trigger' }],
        workflow: {
          activities: [
            {
              id: 'task-1',
              type: 'task',
              name: 'Task 1',
              task: { executor: 'script', config: { language: 'bash', code: 'echo task1' } },
            },
            {
              id: 'task-2',
              type: 'task',
              name: 'Task 2',
              task: { executor: 'script', config: { language: 'bash', code: 'echo task2' } },
            },
            { id: 'converge-1', type: 'converge', name: 'Converge', converge: { strategy: 'all', branches: [] } },
            {
              id: 'task-after',
              type: 'task',
              name: 'Task After',
              task: { executor: 'script', config: { language: 'bash', code: 'echo after' } },
            },
          ],
        },
      },
      triggers: [{ type: 'manual', name: 'Manual Trigger' }],
      edges: [
        { id: 'edge-trigger-task1', source: 'trigger-0', target: 'task-1' },
        { id: 'edge-trigger-task2', source: 'trigger-0', target: 'task-2' },
        { id: 'edge-task1-converge', source: 'task-1', target: 'converge-1' },
        { id: 'edge-task2-converge', source: 'task-2', target: 'converge-1' },
        { id: 'edge-converge-after', source: 'converge-1', target: 'task-after' },
      ],
    })

    // Task after converge has started (so converge must be completed)
    setExecutionState(
      new Map([
        ['task-1', { status: 'completed' }],
        ['task-2', { status: 'pending' }],
        ['task-after', { status: 'running' }],
      ])
    )

    render(
      <ExecutionViewContext.Provider value={true}>
        <BuilderFlow workflowId="workflow-converge" panelOpen={false} executionStatus="running" />
      </ExecutionViewContext.Provider>
    )

    const props = latestReactFlowProps as Record<string, unknown>
    const nodes = props.nodes as Array<Record<string, unknown>>
    const convergeNode = nodes.find((node) => node.id === 'converge-1')

    expect(convergeNode).toBeDefined()
    expect((convergeNode?.data as Record<string, unknown>)?.__executionState).toEqual({
      status: 'completed',
      started_at: undefined,
      completed_at: undefined,
      error_details: undefined,
    })
  })

  it('marks converge node as running when one incoming is failed and others are pending', () => {
    setWorkflowState({
      currentWorkflow: {
        id: 'workflow-converge',
        inputs: {},
        triggers: [{ type: 'manual', name: 'Manual Trigger' }],
        workflow: {
          activities: [
            {
              id: 'task-1',
              type: 'task',
              name: 'Task 1',
              task: { executor: 'script', config: { language: 'bash', code: 'echo task1' } },
            },
            {
              id: 'task-2',
              type: 'task',
              name: 'Task 2',
              task: { executor: 'script', config: { language: 'bash', code: 'echo task2' } },
            },
            { id: 'converge-1', type: 'converge', name: 'Converge', converge: { strategy: 'all', branches: [] } },
          ],
        },
      },
      triggers: [{ type: 'manual', name: 'Manual Trigger' }],
      edges: [
        { id: 'edge-trigger-task1', source: 'trigger-0', target: 'task-1' },
        { id: 'edge-trigger-task2', source: 'trigger-0', target: 'task-2' },
        { id: 'edge-task1-converge', source: 'task-1', target: 'converge-1' },
        { id: 'edge-task2-converge', source: 'task-2', target: 'converge-1' },
      ],
    })

    // Task 1 failed, Task 2 still pending
    setExecutionState(
      new Map([
        ['task-1', { status: 'failed' }],
        ['task-2', { status: 'pending' }],
      ])
    )

    render(
      <ExecutionViewContext.Provider value={true}>
        <BuilderFlow workflowId="workflow-converge" panelOpen={false} executionStatus="running" />
      </ExecutionViewContext.Provider>
    )

    const props = latestReactFlowProps as Record<string, unknown>
    const nodes = props.nodes as Array<Record<string, unknown>>
    const convergeNode = nodes.find((node) => node.id === 'converge-1')

    expect(convergeNode).toBeDefined()
    expect((convergeNode?.data as Record<string, unknown>)?.__executionState).toEqual({
      status: 'running',
      started_at: undefined,
      completed_at: undefined,
      error_details: undefined,
    })
  })

  it('marks converge node as pending when all incoming nodes are pending', () => {
    setWorkflowState({
      currentWorkflow: {
        id: 'workflow-converge',
        inputs: {},
        triggers: [{ type: 'manual', name: 'Manual Trigger' }],
        workflow: {
          activities: [
            {
              id: 'task-1',
              type: 'task',
              name: 'Task 1',
              task: { executor: 'script', config: { language: 'bash', code: 'echo task1' } },
            },
            {
              id: 'task-2',
              type: 'task',
              name: 'Task 2',
              task: { executor: 'script', config: { language: 'bash', code: 'echo task2' } },
            },
            { id: 'converge-1', type: 'converge', name: 'Converge', converge: { strategy: 'all', branches: [] } },
          ],
        },
      },
      triggers: [{ type: 'manual', name: 'Manual Trigger' }],
      edges: [
        { id: 'edge-trigger-task1', source: 'trigger-0', target: 'task-1' },
        { id: 'edge-trigger-task2', source: 'trigger-0', target: 'task-2' },
        { id: 'edge-task1-converge', source: 'task-1', target: 'converge-1' },
        { id: 'edge-task2-converge', source: 'task-2', target: 'converge-1' },
      ],
    })

    // All tasks still pending
    setExecutionState(
      new Map([
        ['task-1', { status: 'pending' }],
        ['task-2', { status: 'pending' }],
      ])
    )

    render(
      <ExecutionViewContext.Provider value={true}>
        <BuilderFlow workflowId="workflow-converge" panelOpen={false} executionStatus="running" />
      </ExecutionViewContext.Provider>
    )

    const props = latestReactFlowProps as Record<string, unknown>
    const nodes = props.nodes as Array<Record<string, unknown>>
    const convergeNode = nodes.find((node) => node.id === 'converge-1')

    expect(convergeNode).toBeDefined()
    expect((convergeNode?.data as Record<string, unknown>)?.__executionState).toEqual({
      status: 'pending',
      started_at: undefined,
      completed_at: undefined,
      error_details: undefined,
    })
  })
})
