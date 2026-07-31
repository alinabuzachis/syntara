import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { ActivityState } from '../../../execution/types'
import { useExecutionStore } from '../../../stores/useExecutionStore'

import { useLoopIterationCount } from './useLoopIterationCount'

function setActivityState(nodeId: string, state: ActivityState) {
  act(() => {
    const activityStates = new Map(useExecutionStore.getState().activityStates)
    activityStates.set(nodeId, state)
    useExecutionStore.setState({ activityStates })
  })
}

describe('useLoopIterationCount', () => {
  afterEach(() => {
    act(() => {
      useExecutionStore.setState({ activityStates: new Map() })
    })
  })

  it('returns null when no activity state exists', () => {
    const { result } = renderHook(() => useLoopIterationCount('loop-1'))

    expect(result.current).toBeNull()
  })

  it('returns null when outputData is undefined', () => {
    const { result } = renderHook(() => useLoopIterationCount('loop-1'))

    setActivityState('loop-1', {
      activityId: 'loop-1',
      status: 'running',
    })

    expect(result.current).toBeNull()
  })

  it('returns null when outputData has no iteration_count', () => {
    const { result } = renderHook(() => useLoopIterationCount('loop-1'))

    setActivityState('loop-1', {
      activityId: 'loop-1',
      status: 'running',
      outputData: { some_other_field: 'value' },
    })

    expect(result.current).toBeNull()
  })

  it('returns 1-indexed count for running loop on first iteration', () => {
    const { result } = renderHook(() => useLoopIterationCount('loop-1'))

    setActivityState('loop-1', {
      activityId: 'loop-1',
      status: 'running',
      outputData: { iteration_count: 0 },
    })

    expect(result.current).toBe(1)
  })

  it('returns 1-indexed count for running loop on third iteration', () => {
    const { result } = renderHook(() => useLoopIterationCount('loop-1'))

    setActivityState('loop-1', {
      activityId: 'loop-1',
      status: 'running',
      outputData: { iteration_count: 2 },
    })

    expect(result.current).toBe(3)
  })

  it('returns raw count for completed loop', () => {
    const { result } = renderHook(() => useLoopIterationCount('loop-1'))

    setActivityState('loop-1', {
      activityId: 'loop-1',
      status: 'completed',
      outputData: { iteration_count: 5, iteration_results: {} },
    })

    expect(result.current).toBe(5)
  })

  it('returns 1-indexed count for failed loop', () => {
    const { result } = renderHook(() => useLoopIterationCount('loop-1'))

    setActivityState('loop-1', {
      activityId: 'loop-1',
      status: 'failed',
      outputData: { iteration_count: 3 },
    })

    expect(result.current).toBe(4)
  })

  it('returns 1-indexed count for cancelled loop', () => {
    const { result } = renderHook(() => useLoopIterationCount('loop-1'))

    setActivityState('loop-1', {
      activityId: 'loop-1',
      status: 'cancelled',
      outputData: { iteration_count: 2 },
    })

    expect(result.current).toBe(3)
  })

  it('returns null for skipped loop', () => {
    const { result } = renderHook(() => useLoopIterationCount('loop-1'))

    setActivityState('loop-1', {
      activityId: 'loop-1',
      status: 'skipped',
      outputData: { iteration_count: 0 },
    })

    expect(result.current).toBeNull()
  })

  it('returns null for non-loop activity with no iteration_count', () => {
    const { result } = renderHook(() => useLoopIterationCount('action-1'))

    setActivityState('action-1', {
      activityId: 'action-1',
      status: 'completed',
      outputData: { result: 'success' },
    })

    expect(result.current).toBeNull()
  })
})
