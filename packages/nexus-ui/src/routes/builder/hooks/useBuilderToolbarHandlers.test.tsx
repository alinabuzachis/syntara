import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, type MockedFunction } from 'vitest'

import { useWorkflowStore } from '../../../stores/useWorkflowStore'

import type { UseBuilderToolbarHandlersOptions } from './useBuilderToolbarHandlers'
import { useBuilderToolbarHandlers } from './useBuilderToolbarHandlers'

vi.mock('../../../stores/useWorkflowStore', () => ({
  useWorkflowStore: {
    getState: vi.fn(),
    temporal: {
      getState: vi.fn(() => ({ clear: vi.fn() })),
    },
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
    ...overrides,
  }
}

describe('useBuilderToolbarHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default to clean state
    vi.mocked(useWorkflowStore.getState).mockReturnValue({
      isDirty: false,
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
    expect(showSuccess).toHaveBeenCalledWith({
      title: 'Workflow started',
      description: 'Successfully started workflow "My workflow"',
    })
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

  it('handleRunWorkflow saves workflow first when isDirty', async () => {
    const handleSaveWorkflow = vi.fn().mockResolvedValue(true)
    const executeWorkflow = vi.fn((...args: Parameters<ExecuteWorkflow>) => {
      const options = args[1]
      options?.onSuccess?.({ id: 'exec-1' })
    }) as MockedFunction<ExecuteWorkflow>
    const dispatch = vi.fn()

    // Mock isDirty state
    vi.mocked(useWorkflowStore.getState).mockReturnValue({
      isDirty: true,
    } as ReturnType<typeof useWorkflowStore.getState>)

    const { result } = renderHook(() =>
      useBuilderToolbarHandlers(buildOptions({ handleSaveWorkflow, executeWorkflow, dispatch }))
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

  it('handleRunWorkflow does not execute when save fails and isDirty', async () => {
    const handleSaveWorkflow = vi.fn().mockResolvedValue(false)
    const executeWorkflow = vi.fn()

    // Mock isDirty state
    vi.mocked(useWorkflowStore.getState).mockReturnValue({
      isDirty: true,
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
      const options = args[1]
      options?.onSuccess?.({ id: 'exec-99' })
    }) as MockedFunction<ExecuteWorkflow>

    // Clean state already set in beforeEach
    vi.mocked(useWorkflowStore.getState).mockReturnValue({
      isDirty: false,
    } as ReturnType<typeof useWorkflowStore.getState>)

    const { result } = renderHook(() =>
      useBuilderToolbarHandlers(buildOptions({ handleSaveWorkflow, executeWorkflow }))
    )

    await result.current.handleRunWorkflow()

    expect(handleSaveWorkflow).not.toHaveBeenCalled()
    expect(executeWorkflow).toHaveBeenCalledTimes(1)
  })
})
