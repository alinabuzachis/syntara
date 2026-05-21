import type { Activity } from '@ansible/nexus-contracts'
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, type MockedFunction } from 'vitest'

import { useWorkflowStore } from '../../../stores/useWorkflowStore'
import type { WorkflowDefinition } from '../../../stores/workflowStoreTypes'

import type { UseBuilderToolbarHandlersOptions } from './useBuilderToolbarHandlers'
import { useBuilderToolbarHandlers } from './useBuilderToolbarHandlers'

vi.mock('../../../stores/useWorkflowStore', () => ({
  useWorkflowStore: {
    getState: vi.fn(),
    temporal: { getState: vi.fn(() => ({ clear: vi.fn() })) },
  },
}))

type ExecuteWorkflow = UseBuilderToolbarHandlersOptions['executeWorkflow']
type DeleteWorkflow = UseBuilderToolbarHandlersOptions['deleteWorkflow']
type ReactFlowInstanceParam = UseBuilderToolbarHandlersOptions['reactFlowInstance']

/** Minimal `@xyflow/react` instance for tests — full type is large; only `setNodes` is used by the hook. */
function createMockReactFlowInstance(overrides: { setNodes?: ReturnType<typeof vi.fn> } = {}): ReactFlowInstanceParam {
  return {
    setNodes: overrides.setNodes ?? vi.fn(),
  } as unknown as ReactFlowInstanceParam
}

function minimalWorkflow(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    schema_version: '2.0.0',
    name: 'test-wf',
    description: 'd',
    workflow: {
      activities: [
        { type: 'script', id: 'task-1', name: 'Task 1', config: { language: 'python', code: 'print("hello")' } },
      ] as Activity[],
    },
    triggers: [{ type: 'manual', id: 'trigger-1', config: {} }],
    ...overrides,
  }
}

function buildOptions(overrides: Partial<UseBuilderToolbarHandlersOptions> = {}): UseBuilderToolbarHandlersOptions {
  return {
    workflow: { id: 'wf-1' },
    workflowName: 'My workflow',
    detailsOpen: false,
    historyCardOpen: false,
    reactFlowInstance: createMockReactFlowInstance(),
    executionsQuery: { refetch: vi.fn().mockResolvedValue({}) },
    dispatch: vi.fn(),
    executeWorkflow: vi.fn(),
    deleteWorkflow: vi.fn(),
    showSuccess: vi.fn(),
    showError: vi.fn(),
    setLocation: vi.fn(),
    handleSaveWorkflow: vi.fn().mockResolvedValue(true),
    currentWorkflow: minimalWorkflow(),
    ...overrides,
  }
}

describe('useBuilderToolbarHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default to clean state with edges for validation
    vi.mocked(useWorkflowStore.getState).mockReturnValue({
      isDirty: false,
      edges: [
        {
          id: 'trigger-1-task-1',
          source: 'trigger-1',
          target: 'task-1',
          sourceHandle: 'source',
          targetHandle: 'target',
        },
      ],
    } as ReturnType<typeof useWorkflowStore.getState>)
  })

  it('handleRunWorkflow does not call executeWorkflow when workflow is missing', async () => {
    const executeWorkflow = vi.fn() as MockedFunction<ExecuteWorkflow>
    const { result } = renderHook(() =>
      useBuilderToolbarHandlers(buildOptions({ workflow: undefined, executeWorkflow }))
    )

    await result.current.handleRunWorkflow()

    expect(executeWorkflow).not.toHaveBeenCalled()
  })

  it('handleRunWorkflow saves workflow but shows error when workflow has no triggers', async () => {
    const executeWorkflow = vi.fn()
    const showError = vi.fn()
    const dispatch = vi.fn()
    const handleSaveWorkflow = vi.fn().mockResolvedValue(true)
    const currentWorkflow = minimalWorkflow({ triggers: undefined })

    // Mock dirty state so save is called
    vi.mocked(useWorkflowStore.getState).mockReturnValue({
      isDirty: true,
      edges: [
        {
          id: 'trigger-1-task-1',
          source: 'trigger-1',
          target: 'task-1',
          sourceHandle: 'source',
          targetHandle: 'target',
        },
      ],
    } as ReturnType<typeof useWorkflowStore.getState>)

    const { result } = renderHook(() =>
      useBuilderToolbarHandlers(
        buildOptions({ executeWorkflow, showError, dispatch, currentWorkflow, handleSaveWorkflow })
      )
    )

    await result.current.handleRunWorkflow()

    // Save should be called first
    expect(handleSaveWorkflow).toHaveBeenCalled()
    // Then validation error shown
    expect(showError).toHaveBeenCalledWith({
      title: 'Cannot run workflow',
      description: expect.stringContaining('at least one trigger') as unknown as string,
    })
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CONFIRM_DIALOG', payload: false })
    // But execution should not happen
    expect(executeWorkflow).not.toHaveBeenCalled()
  })

  it('handleRunWorkflow saves workflow but shows error when workflow has no activities', async () => {
    const executeWorkflow = vi.fn()
    const showError = vi.fn()
    const dispatch = vi.fn()
    const handleSaveWorkflow = vi.fn().mockResolvedValue(true)
    const currentWorkflow = minimalWorkflow({ workflow: { activities: [] } })

    // Mock dirty state so save is called
    vi.mocked(useWorkflowStore.getState).mockReturnValue({
      isDirty: true,
      edges: [
        {
          id: 'trigger-1-task-1',
          source: 'trigger-1',
          target: 'task-1',
          sourceHandle: 'source',
          targetHandle: 'target',
        },
      ],
    } as ReturnType<typeof useWorkflowStore.getState>)

    const { result } = renderHook(() =>
      useBuilderToolbarHandlers(
        buildOptions({ executeWorkflow, showError, dispatch, currentWorkflow, handleSaveWorkflow })
      )
    )

    await result.current.handleRunWorkflow()

    // Save should be called first
    expect(handleSaveWorkflow).toHaveBeenCalled()
    // Then validation error shown
    expect(showError).toHaveBeenCalledWith({
      title: 'Cannot run workflow',
      description: expect.stringContaining('at least one step') as unknown as string,
    })
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CONFIRM_DIALOG', payload: false })
    // But execution should not happen
    expect(executeWorkflow).not.toHaveBeenCalled()
  })

  it('handleRunWorkflow saves workflow but shows error when workflow has no connections', async () => {
    const executeWorkflow = vi.fn()
    const showError = vi.fn()
    const dispatch = vi.fn()
    const handleSaveWorkflow = vi.fn().mockResolvedValue(true)

    // Mock dirty state with no edges
    vi.mocked(useWorkflowStore.getState).mockReturnValue({
      isDirty: true,
      edges: [],
    } as unknown as ReturnType<typeof useWorkflowStore.getState>)

    const { result } = renderHook(() =>
      useBuilderToolbarHandlers(buildOptions({ executeWorkflow, showError, dispatch, handleSaveWorkflow }))
    )

    await result.current.handleRunWorkflow()

    // Save should be called first
    expect(handleSaveWorkflow).toHaveBeenCalled()
    // Then validation error shown
    expect(showError).toHaveBeenCalledWith({
      title: 'Cannot run workflow',
      description: expect.stringContaining('at least one connection') as unknown as string,
    })
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CONFIRM_DIALOG', payload: false })
    // But execution should not happen
    expect(executeWorkflow).not.toHaveBeenCalled()
  })

  it('handleRunWorkflow invokes executeWorkflow and dispatches SET_MOST_RECENT_EXECUTION on success', async () => {
    const executeWorkflow = vi.fn((...args: Parameters<ExecuteWorkflow>) => {
      const options = args[1]
      options?.onSuccess?.({ id: 'exec-99' })
    }) as MockedFunction<ExecuteWorkflow>
    const setLocation = vi.fn()
    const dispatch = vi.fn()
    const showSuccess = vi.fn()
    const { result } = renderHook(() =>
      useBuilderToolbarHandlers(buildOptions({ executeWorkflow, setLocation, dispatch, showSuccess }))
    )

    await result.current.handleRunWorkflow()

    expect(executeWorkflow).toHaveBeenCalledTimes(1)
    const [variables, options] = executeWorkflow.mock.calls[0]
    expect(variables).toEqual({ body: { workflow_id: 'wf-1', input_data: {} } })
    expect(options?.onSuccess).toEqual(expect.any(Function))
    expect(options?.onError).toEqual(expect.any(Function))
    expect(showSuccess).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CONFIRM_DIALOG', payload: false })
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_MOST_RECENT_EXECUTION', payload: 'exec-99' })
    expect(setLocation).not.toHaveBeenCalled()
  })

  it('handleRunWorkflow shows error on failure', async () => {
    const executeWorkflow = vi.fn((...args: Parameters<ExecuteWorkflow>) => {
      const options = args[1]
      options?.onError?.(new Error('boom'))
    }) as MockedFunction<ExecuteWorkflow>
    const showError = vi.fn()
    const { result } = renderHook(() => useBuilderToolbarHandlers(buildOptions({ executeWorkflow, showError })))

    await result.current.handleRunWorkflow()

    expect(showError).toHaveBeenCalledWith({
      title: 'Workflow failed',
      description: 'Failed to start workflow "My workflow": boom',
    })
  })

  it('handleRunWorkflow saves workflow first when isDirty', async () => {
    const handleSaveWorkflow = vi.fn().mockResolvedValue(true)
    const executeWorkflow = vi.fn((...args: Parameters<ExecuteWorkflow>) => {
      args[1]?.onSuccess?.({ id: 'exec-1' })
    }) as MockedFunction<ExecuteWorkflow>
    const dispatch = vi.fn()
    vi.mocked(useWorkflowStore.getState).mockReturnValue({
      isDirty: true,
      edges: [
        {
          id: 'trigger-1-task-1',
          source: 'trigger-1',
          target: 'task-1',
          sourceHandle: 'source',
          targetHandle: 'target',
        },
      ],
    } as ReturnType<typeof useWorkflowStore.getState>)

    const { result } = renderHook(() =>
      useBuilderToolbarHandlers(buildOptions({ handleSaveWorkflow, executeWorkflow, dispatch }))
    )

    await result.current.handleRunWorkflow()

    expect(handleSaveWorkflow).toHaveBeenCalledTimes(1)
    expect(executeWorkflow).toHaveBeenCalledTimes(1)
    expect(handleSaveWorkflow.mock.invocationCallOrder[0]).toBeLessThan(executeWorkflow.mock.invocationCallOrder[0])
  })

  it('handleRunWorkflow does not execute when save fails and isDirty', async () => {
    const handleSaveWorkflow = vi.fn().mockResolvedValue(false)
    const executeWorkflow = vi.fn()
    vi.mocked(useWorkflowStore.getState).mockReturnValue({
      isDirty: true,
      edges: [
        {
          id: 'trigger-1-task-1',
          source: 'trigger-1',
          target: 'task-1',
          sourceHandle: 'source',
          targetHandle: 'target',
        },
      ],
    } as ReturnType<typeof useWorkflowStore.getState>)

    const { result } = renderHook(() =>
      useBuilderToolbarHandlers(buildOptions({ handleSaveWorkflow, executeWorkflow }))
    )

    await result.current.handleRunWorkflow()

    expect(handleSaveWorkflow).toHaveBeenCalledTimes(1)
    expect(executeWorkflow).not.toHaveBeenCalled()
  })

  it('handleRunWorkflow skips save when not isDirty', async () => {
    const handleSaveWorkflow = vi.fn()
    const executeWorkflow = vi.fn((...args: Parameters<ExecuteWorkflow>) => {
      args[1]?.onSuccess?.({ id: 'exec-99' })
    }) as MockedFunction<ExecuteWorkflow>

    const { result } = renderHook(() =>
      useBuilderToolbarHandlers(buildOptions({ handleSaveWorkflow, executeWorkflow }))
    )

    await result.current.handleRunWorkflow()

    expect(handleSaveWorkflow).not.toHaveBeenCalled()
    expect(executeWorkflow).toHaveBeenCalledTimes(1)
  })

  it('handleDeleteWorkflow does not call deleteWorkflow when workflow is missing', () => {
    const deleteWorkflow = vi.fn() as MockedFunction<DeleteWorkflow>
    const { result } = renderHook(() =>
      useBuilderToolbarHandlers(buildOptions({ workflow: undefined, deleteWorkflow }))
    )

    result.current.handleDeleteWorkflow()

    expect(deleteWorkflow).not.toHaveBeenCalled()
  })

  it('handleDeleteWorkflow invokes deleteWorkflow on success', () => {
    const deleteWorkflow = vi.fn((...args: Parameters<DeleteWorkflow>) => {
      const options = args[1]
      options?.onSuccess?.()
    }) as MockedFunction<DeleteWorkflow>
    const setLocation = vi.fn()
    const showSuccess = vi.fn()
    const dispatch = vi.fn()
    const { result } = renderHook(() =>
      useBuilderToolbarHandlers(buildOptions({ deleteWorkflow, setLocation, showSuccess, dispatch }))
    )

    result.current.handleDeleteWorkflow()

    expect(deleteWorkflow).toHaveBeenCalledTimes(1)
    const [variables, options] = deleteWorkflow.mock.calls[0]
    expect(variables).toEqual({ params: { path: { workflow_id: 'wf-1' } } })
    expect(options?.onSuccess).toEqual(expect.any(Function))
    expect(options?.onError).toEqual(expect.any(Function))
    expect(showSuccess).toHaveBeenCalledWith({
      title: 'Workflow deleted',
      description: 'Successfully deleted workflow "My workflow"',
    })
    expect(setLocation).toHaveBeenCalledWith('/workflow-builder/new')
  })

  it('handleToggleDetails dispatches and clears node selection when opening', () => {
    const setNodes = vi.fn()
    const dispatch = vi.fn()
    const reactFlowInstance = createMockReactFlowInstance({ setNodes })
    const { result } = renderHook(() =>
      useBuilderToolbarHandlers(buildOptions({ detailsOpen: false, dispatch, reactFlowInstance }))
    )

    result.current.handleToggleDetails()

    expect(dispatch).toHaveBeenCalledWith({ type: 'TOGGLE_DETAILS' })
    expect(setNodes).toHaveBeenCalled()
  })

  it('handleToggleDetails only dispatches when panel already open', () => {
    const setNodes = vi.fn()
    const reactFlowInstance = createMockReactFlowInstance({ setNodes })
    const { result } = renderHook(() =>
      useBuilderToolbarHandlers(buildOptions({ detailsOpen: true, reactFlowInstance }))
    )

    result.current.handleToggleDetails()

    expect(setNodes).not.toHaveBeenCalled()
  })

  it('handleToggleHistory refetches when opening history', () => {
    const refetch = vi.fn().mockResolvedValue({})
    const dispatch = vi.fn()
    const { result } = renderHook(() =>
      useBuilderToolbarHandlers(buildOptions({ historyCardOpen: false, executionsQuery: { refetch }, dispatch }))
    )

    result.current.handleToggleHistory()

    expect(dispatch).toHaveBeenCalledWith({ type: 'TOGGLE_HISTORY' })
    expect(refetch).toHaveBeenCalled()
  })

  it('handleToggleHistory does not refetch when history already open', () => {
    const refetch = vi.fn()
    const { result } = renderHook(() =>
      useBuilderToolbarHandlers(buildOptions({ historyCardOpen: true, executionsQuery: { refetch } }))
    )

    result.current.handleToggleHistory()

    expect(refetch).not.toHaveBeenCalled()
  })

  it('handleRunWorkflow dispatches SET_CONFIRM_DIALOG:false when save throws', async () => {
    const handleSaveWorkflow = vi.fn().mockRejectedValue(new Error('network'))
    const executeWorkflow = vi.fn() as MockedFunction<ExecuteWorkflow>
    const dispatch = vi.fn()

    // Mock isDirty state with edges for validation
    vi.mocked(useWorkflowStore.getState).mockReturnValue({
      isDirty: true,
      edges: [
        {
          id: 'trigger-1-task-1',
          source: 'trigger-1',
          target: 'task-1',
          sourceHandle: 'source',
          targetHandle: 'target',
        },
      ],
    } as ReturnType<typeof useWorkflowStore.getState>)

    const { result } = renderHook(() =>
      useBuilderToolbarHandlers(buildOptions({ handleSaveWorkflow, executeWorkflow, dispatch }))
    )
    await result.current.handleRunWorkflow()

    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CONFIRM_DIALOG', payload: false })
    expect(executeWorkflow).not.toHaveBeenCalled()
  })

  it('handleRunWorkflow saves and executes when isDirty', async () => {
    const handleSaveWorkflow = vi.fn().mockResolvedValue(true)
    const executeWorkflow = vi.fn((...args: Parameters<ExecuteWorkflow>) => {
      args[1]?.onSuccess?.({ id: 'exec-1' })
    }) as MockedFunction<ExecuteWorkflow>

    // Mock isDirty state with edges for validation
    vi.mocked(useWorkflowStore.getState).mockReturnValue({
      isDirty: true,
      edges: [
        {
          id: 'trigger-1-task-1',
          source: 'trigger-1',
          target: 'task-1',
          sourceHandle: 'source',
          targetHandle: 'target',
        },
      ],
    } as ReturnType<typeof useWorkflowStore.getState>)

    const { result } = renderHook(() =>
      useBuilderToolbarHandlers(buildOptions({ handleSaveWorkflow, executeWorkflow }))
    )

    await result.current.handleRunWorkflow()

    // Verify save was called before execute
    expect(handleSaveWorkflow).toHaveBeenCalledTimes(1)
    expect(executeWorkflow).toHaveBeenCalledTimes(1)

    // Verify order: handleSaveWorkflow should be called before executeWorkflow
    const saveCallOrder = handleSaveWorkflow.mock.invocationCallOrder[0]
    const executeCallOrder = executeWorkflow.mock.invocationCallOrder[0]
    expect(saveCallOrder).toBeLessThan(executeCallOrder)
  })

  it('handleRunWorkflow handles onSuccess without data.id', async () => {
    const executeWorkflow = vi.fn((...args: Parameters<ExecuteWorkflow>) => {
      args[1]?.onSuccess?.({})
    }) as MockedFunction<ExecuteWorkflow>
    const dispatch = vi.fn()

    // Clean state already set in beforeEach with edges
    vi.mocked(useWorkflowStore.getState).mockReturnValue({
      isDirty: false,
      edges: [
        {
          id: 'trigger-1-task-1',
          source: 'trigger-1',
          target: 'task-1',
          sourceHandle: 'source',
          targetHandle: 'target',
        },
      ],
    } as ReturnType<typeof useWorkflowStore.getState>)

    const { result } = renderHook(() => useBuilderToolbarHandlers(buildOptions({ executeWorkflow, dispatch })))

    await result.current.handleRunWorkflow()

    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CONFIRM_DIALOG', payload: false })
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_MOST_RECENT_EXECUTION' }))
  })

  it('handleRunWorkflow passes triggerNodeId in the execution body', async () => {
    const executeWorkflow = vi.fn() as MockedFunction<ExecuteWorkflow>

    const { result } = renderHook(() => useBuilderToolbarHandlers(buildOptions({ executeWorkflow })))
    await result.current.handleRunWorkflow({ key: 'val' }, 'trigger-node-1')

    const [variables] = executeWorkflow.mock.calls[0]
    expect(variables.body.trigger_node_id).toBe('trigger-node-1')
    expect(variables.body.input_data).toEqual({ key: 'val' })
  })

  it('handleRunWorkflow omits trigger_node_id from body when not provided', async () => {
    const executeWorkflow = vi.fn() as MockedFunction<ExecuteWorkflow>

    const { result } = renderHook(() => useBuilderToolbarHandlers(buildOptions({ executeWorkflow })))
    await result.current.handleRunWorkflow()

    const [variables] = executeWorkflow.mock.calls[0]
    expect(variables.body).not.toHaveProperty('trigger_node_id')
    expect(variables.body.input_data).toEqual({})
  })

  it('handleDeleteWorkflow shows error and dispatches SET_DELETE_DIALOG on failure', () => {
    const deleteWorkflow = vi.fn((...args: Parameters<DeleteWorkflow>) => {
      args[1]?.onError?.(new Error('delete failed'))
    }) as MockedFunction<DeleteWorkflow>
    const showError = vi.fn()
    const dispatch = vi.fn()
    const { result } = renderHook(() =>
      useBuilderToolbarHandlers(buildOptions({ deleteWorkflow, showError, dispatch }))
    )

    result.current.handleDeleteWorkflow()

    expect(showError).toHaveBeenCalledWith({
      title: 'Delete failed',
      description: 'Failed to delete workflow "My workflow": delete failed',
    })
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_DELETE_DIALOG', payload: false })
  })
})
