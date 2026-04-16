import type { Execution } from '@ansible/nexus-contracts'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useBuilderExecutionCanvasState } from './useBuilderExecutionCanvasState'

/** Minimal valid Execution (BaseResource) for test fixtures; merge with `partial` for each case. */
const defaultExecution: Execution = {
  id: '00000000-0000-4000-8000-000000000001',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
}

function exec(partial: Partial<Execution>): Execution {
  return { ...defaultExecution, ...partial } as Execution
}

describe('useBuilderExecutionCanvasState', () => {
  it('dispatches first execution id when history opens with no selection', async () => {
    const dispatch = vi.fn()
    const executionsQuery = { data: { resources: [{ id: 'ex-1' }, { id: 'ex-2' }] } }
    const selectedExecutionQuery = { data: undefined }

    renderHook(() => useBuilderExecutionCanvasState(true, null, executionsQuery, selectedExecutionQuery, dispatch))

    await waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_SELECTED_EXECUTION_ID', payload: 'ex-1' })
    })
  })

  it('does not auto-select when an execution is already selected', () => {
    const dispatch = vi.fn()
    renderHook(() =>
      useBuilderExecutionCanvasState(
        true,
        'ex-2',
        { data: { resources: [{ id: 'ex-1' }] } },
        { data: undefined },
        dispatch
      )
    )
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('does not auto-select when history is closed', () => {
    const dispatch = vi.fn()
    renderHook(() =>
      useBuilderExecutionCanvasState(
        false,
        null,
        { data: { resources: [{ id: 'ex-1' }] } },
        { data: undefined },
        dispatch
      )
    )
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('returns undefined executionWorkflow when workflow_definition is missing', () => {
    const { result } = renderHook(() =>
      useBuilderExecutionCanvasState(
        false,
        'id',
        { data: { resources: [] } },
        { data: exec({ workflow_id: 'w1' }) },
        vi.fn()
      )
    )
    expect(result.current.executionWorkflow).toBeUndefined()
  })

  it('returns executionWorkflow when definition and workflow_id exist', () => {
    const def = { metadata: { name: 'My WF' } } as unknown as Execution['workflow_definition']
    const { result } = renderHook(() =>
      useBuilderExecutionCanvasState(
        false,
        'ex',
        { data: { resources: [] } },
        {
          data: exec({
            workflow_id: 'w1',
            workflow_definition: def,
            activities: [],
          }),
        },
        vi.fn()
      )
    )
    expect(result.current.executionWorkflow).toEqual({
      id: 'w1',
      name: 'My WF',
      version: { workflow_definition: def },
    })
  })

  it('defaults workflow name when metadata name is missing', () => {
    const def = { nodes: [] } as unknown as Execution['workflow_definition']
    const { result } = renderHook(() =>
      useBuilderExecutionCanvasState(
        false,
        'ex',
        { data: { resources: [] } },
        { data: exec({ workflow_id: 'w1', workflow_definition: def }) },
        vi.fn()
      )
    )
    expect(result.current.executionWorkflow?.name).toBe('Workflow')
  })

  it('exposes execution activities from selected execution', () => {
    const activities = [{ activity_id: 'a1', status: 'completed' as const }]
    const { result } = renderHook(() =>
      useBuilderExecutionCanvasState(
        false,
        'ex',
        { data: { resources: [] } },
        {
          data: exec({
            workflow_id: 'w1',
            workflow_definition: {},
            activities,
          }),
        },
        vi.fn()
      )
    )
    expect(result.current.executionActivities).toEqual(activities)
  })

  it('treats null activities as empty list', () => {
    const { result } = renderHook(() =>
      useBuilderExecutionCanvasState(
        false,
        'ex',
        { data: { resources: [] } },
        {
          data: exec({
            workflow_id: 'w1',
            workflow_definition: {},
            activities: null,
          }),
        },
        vi.fn()
      )
    )
    expect(result.current.executionActivities).toEqual([])
  })

  it('uses Workflow label when metadata has no name', () => {
    const def = { metadata: {} } as unknown as Execution['workflow_definition']
    const { result } = renderHook(() =>
      useBuilderExecutionCanvasState(
        false,
        'ex',
        { data: { resources: [] } },
        { data: exec({ workflow_id: 'w1', workflow_definition: def }) },
        vi.fn()
      )
    )
    expect(result.current.executionWorkflow?.name).toBe('Workflow')
  })

  it('sets isViewingExecution from selectedExecutionId', () => {
    const { result } = renderHook(() =>
      useBuilderExecutionCanvasState(false, 'x', { data: { resources: [] } }, { data: undefined }, vi.fn())
    )
    expect(result.current.isViewingExecution).toBe(true)
  })

  it('memoizes executions list from query data', () => {
    const resources = [{ id: 'a' }]
    const { result, rerender } = renderHook(
      ({ q }) => useBuilderExecutionCanvasState(false, null, q, { data: undefined }, vi.fn()),
      { initialProps: { q: { data: { resources } } } }
    )
    const firstExecutions = result.current.executions
    expect(firstExecutions).toEqual([{ id: 'a' }])
    // Same `resources` array ref → same `executionsQuery.data?.resources` dep → useMemo returns same executions array
    rerender({ q: { data: { resources } } })
    expect(result.current.executions).toBe(firstExecutions)
  })
})
