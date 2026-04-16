import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi, type MockedFunction } from 'vitest'

import type { UseBuilderToolbarHandlersOptions } from './useBuilderToolbarHandlers'
import { useBuilderToolbarHandlers } from './useBuilderToolbarHandlers'

type ExecuteAutomation = UseBuilderToolbarHandlersOptions['executeAutomation']
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
    executeAutomation: vi.fn(),
    deleteWorkflow: vi.fn(),
    showSuccess: vi.fn(),
    showError: vi.fn(),
    setLocation: vi.fn(),
    ...overrides,
  }
}

describe('useBuilderToolbarHandlers', () => {
  it('handleRunAutomation does not call executeAutomation when workflow is missing', () => {
    const executeAutomation = vi.fn() as MockedFunction<ExecuteAutomation>
    const { result } = renderHook(() =>
      useBuilderToolbarHandlers(buildOptions({ workflow: undefined, executeAutomation }))
    )

    result.current.handleRunAutomation()

    expect(executeAutomation).not.toHaveBeenCalled()
  })

  it('handleRunAutomation invokes executeAutomation and navigates on success', () => {
    const executeAutomation = vi.fn((...args: Parameters<ExecuteAutomation>) => {
      const options = args[1]
      options?.onSuccess?.({ id: 'exec-99' })
    }) as MockedFunction<ExecuteAutomation>
    const setLocation = vi.fn()
    const dispatch = vi.fn()
    const showSuccess = vi.fn()
    const { result } = renderHook(() =>
      useBuilderToolbarHandlers(buildOptions({ executeAutomation, setLocation, dispatch, showSuccess }))
    )

    result.current.handleRunAutomation()

    expect(executeAutomation).toHaveBeenCalledTimes(1)
    const [variables, options] = executeAutomation.mock.calls[0]
    expect(variables).toEqual({ body: { workflow_id: 'wf-1', input_data: {} } })
    expect(options?.onSuccess).toEqual(expect.any(Function))
    expect(options?.onError).toEqual(expect.any(Function))
    expect(showSuccess).toHaveBeenCalledWith('Successfully started automation "My workflow"', 'Automation Started')
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CONFIRM_DIALOG', payload: false })
    expect(setLocation).toHaveBeenCalledWith('/executions/exec-99?history=open')
  })

  it('handleRunAutomation shows error and closes dialog on failure', () => {
    const executeAutomation = vi.fn((...args: Parameters<ExecuteAutomation>) => {
      const options = args[1]
      options?.onError?.(new Error('boom'))
    }) as MockedFunction<ExecuteAutomation>
    const showError = vi.fn()
    const dispatch = vi.fn()
    const { result } = renderHook(() =>
      useBuilderToolbarHandlers(buildOptions({ executeAutomation, showError, dispatch }))
    )

    result.current.handleRunAutomation()

    expect(showError).toHaveBeenCalledWith('Failed to start automation "My workflow": boom', 'Automation Failed')
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_CONFIRM_DIALOG', payload: false })
  })

  it('handleDeleteAutomation does not call deleteWorkflow when workflow is missing', () => {
    const deleteWorkflow = vi.fn() as MockedFunction<DeleteWorkflow>
    const { result } = renderHook(() =>
      useBuilderToolbarHandlers(buildOptions({ workflow: undefined, deleteWorkflow }))
    )

    result.current.handleDeleteAutomation()

    expect(deleteWorkflow).not.toHaveBeenCalled()
  })

  it('handleDeleteAutomation invokes deleteWorkflow on success', () => {
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

    result.current.handleDeleteAutomation()

    expect(deleteWorkflow).toHaveBeenCalledTimes(1)
    const [variables, options] = deleteWorkflow.mock.calls[0]
    expect(variables).toEqual({ params: { path: { workflow_id: 'wf-1' } } })
    expect(options?.onSuccess).toEqual(expect.any(Function))
    expect(options?.onError).toEqual(expect.any(Function))
    expect(showSuccess).toHaveBeenCalledWith('Successfully deleted automation "My workflow"', 'Automation Deleted')
    expect(setLocation).toHaveBeenCalledWith('/automation-builder/new')
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
})
