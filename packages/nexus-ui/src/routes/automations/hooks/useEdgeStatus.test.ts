/**
 * Edge Status Hook Tests
 *
 * Tests for edge status derivation logic and React hooks
 */

import { renderHook } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'

import type { Execution, ActivityStatus } from '../execution/types'
import { useExecutionStore } from '../stores/useExecutionStore'

import { deriveEdgeStatus, useEdgeStatus, useEdgeStatuses } from './useEdgeStatus'

// ============================================================================
// Test Helpers
// ============================================================================

function createMockExecution(activityStates: Array<{ id: string; status: ActivityStatus }>): Execution {
  return {
    id: 'exec-123',
    createdAt: '2025-12-10T15:00:00Z',
    updatedAt: '2025-12-10T15:00:00Z',
    workflow_id: 'workflow-456',
    workflow_version_id: 'version-789',
    status: 'running',
    started_at: '2025-12-10T15:00:05Z',
    completed_at: null,
    workflow_definition: { workflow: { activities: [] } },
    activities: activityStates.map((activity) => ({
      activity_id: activity.id,
      status: activity.status,
      error_details: null,
      started_at: activity.status !== 'pending' ? '2025-12-10T15:00:05Z' : null,
      completed_at: ['completed', 'failed', 'cancelled'].includes(activity.status) ? '2025-12-10T15:00:10Z' : null,
    })),
  } as unknown as Execution
}

// ============================================================================
// Derivation Logic Tests
// ============================================================================

describe('deriveEdgeStatus', () => {
  describe('passed statuses', () => {
    it('returns passed for completed status', () => {
      expect(deriveEdgeStatus('completed')).toBe('passed')
    })

    it('returns passed for failed status', () => {
      expect(deriveEdgeStatus('failed')).toBe('passed')
    })

    it('returns passed for cancelled status', () => {
      expect(deriveEdgeStatus('cancelled')).toBe('passed')
    })
  })

  describe('pending statuses', () => {
    it('returns pending for pending status', () => {
      expect(deriveEdgeStatus('pending')).toBe('pending')
    })

    it('returns pending for running status', () => {
      expect(deriveEdgeStatus('running')).toBe('pending')
    })

    it('returns pending for retrying status', () => {
      expect(deriveEdgeStatus('retrying')).toBe('pending')
    })

    it('returns pending for skipped status', () => {
      expect(deriveEdgeStatus('skipped')).toBe('pending')
    })
  })
})

// ============================================================================
// useEdgeStatus Hook Tests
// ============================================================================

describe('useEdgeStatus', () => {
  beforeEach(() => {
    useExecutionStore.getState().reset()
  })

  it('returns pending when no execution loaded', () => {
    const { result } = renderHook(() => useEdgeStatus('task1'))
    expect(result.current).toBe('pending')
  })

  it('returns pending when source node not found', () => {
    const execution = createMockExecution([{ id: 'task1', status: 'completed' }])
    useExecutionStore.getState().setExecution(execution)

    const { result } = renderHook(() => useEdgeStatus('unknown_task'))
    expect(result.current).toBe('pending')
  })

  it('returns passed for completed source', () => {
    const execution = createMockExecution([{ id: 'task1', status: 'completed' }])
    useExecutionStore.getState().setExecution(execution)

    const { result } = renderHook(() => useEdgeStatus('task1'))
    expect(result.current).toBe('passed')
  })

  it('returns passed for failed source', () => {
    const execution = createMockExecution([{ id: 'task1', status: 'failed' }])
    useExecutionStore.getState().setExecution(execution)

    const { result } = renderHook(() => useEdgeStatus('task1'))
    expect(result.current).toBe('passed')
  })

  it('returns passed for cancelled source', () => {
    const execution = createMockExecution([{ id: 'task1', status: 'cancelled' }])
    useExecutionStore.getState().setExecution(execution)

    const { result } = renderHook(() => useEdgeStatus('task1'))
    expect(result.current).toBe('passed')
  })

  it('returns pending for pending source', () => {
    const execution = createMockExecution([{ id: 'task1', status: 'pending' }])
    useExecutionStore.getState().setExecution(execution)

    const { result } = renderHook(() => useEdgeStatus('task1'))
    expect(result.current).toBe('pending')
  })

  it('returns pending for running source', () => {
    const execution = createMockExecution([{ id: 'task1', status: 'running' }])
    useExecutionStore.getState().setExecution(execution)

    const { result } = renderHook(() => useEdgeStatus('task1'))
    expect(result.current).toBe('pending')
  })

  it('returns pending for skipped source', () => {
    const execution = createMockExecution([{ id: 'task1', status: 'skipped' }])
    useExecutionStore.getState().setExecution(execution)

    const { result } = renderHook(() => useEdgeStatus('task1'))
    expect(result.current).toBe('pending')
  })

  it('updates when source status changes', () => {
    const execution = createMockExecution([{ id: 'task1', status: 'running' }])
    useExecutionStore.getState().setExecution(execution)

    const { result, rerender } = renderHook(() => useEdgeStatus('task1'))
    expect(result.current).toBe('pending')

    // Update status to completed
    useExecutionStore.getState().applyPatch(
      [
        {
          op: 'replace',
          path: '/activities/task1/status',
          value: 'completed',
        },
      ],
      '1691431234568-0'
    )

    rerender()
    expect(result.current).toBe('passed')
  })

  it('updates when source transitions through multiple states', () => {
    const execution = createMockExecution([{ id: 'task1', status: 'pending' }])
    useExecutionStore.getState().setExecution(execution)

    const { result, rerender } = renderHook(() => useEdgeStatus('task1'))
    expect(result.current).toBe('pending')

    // Transition to running
    useExecutionStore
      .getState()
      .applyPatch([{ op: 'replace', path: '/activities/task1/status', value: 'running' }], '1691431234568-0')
    rerender()
    expect(result.current).toBe('pending')

    // Transition to completed
    useExecutionStore
      .getState()
      .applyPatch([{ op: 'replace', path: '/activities/task1/status', value: 'completed' }], '1691431234568-1')
    rerender()
    expect(result.current).toBe('passed')
  })
})

// ============================================================================
// useEdgeStatuses Hook Tests
// ============================================================================

describe('useEdgeStatuses', () => {
  beforeEach(() => {
    useExecutionStore.getState().reset()
  })

  it('returns empty map for empty edges array', () => {
    const { result } = renderHook(() => useEdgeStatuses([]))
    expect(result.current.size).toBe(0)
  })

  it('returns status map for multiple edges', () => {
    const execution = createMockExecution([
      { id: 'task1', status: 'completed' },
      { id: 'task2', status: 'running' },
      { id: 'task3', status: 'pending' },
    ])
    useExecutionStore.getState().setExecution(execution)

    const edges = [
      { id: 'edge1', source: 'task1' },
      { id: 'edge2', source: 'task2' },
      { id: 'edge3', source: 'task3' },
    ]

    const { result } = renderHook(() => useEdgeStatuses(edges))

    expect(result.current.size).toBe(3)
    expect(result.current.get('edge1')).toBe('passed')
    expect(result.current.get('edge2')).toBe('pending')
    expect(result.current.get('edge3')).toBe('pending')
  })

  it('handles edges with unknown source nodes', () => {
    const execution = createMockExecution([{ id: 'task1', status: 'completed' }])
    useExecutionStore.getState().setExecution(execution)

    const edges = [
      { id: 'edge1', source: 'task1' },
      { id: 'edge2', source: 'unknown' },
    ]

    const { result } = renderHook(() => useEdgeStatuses(edges))

    expect(result.current.size).toBe(2)
    expect(result.current.get('edge1')).toBe('passed')
    expect(result.current.get('edge2')).toBe('pending')
  })

  it('updates all edge statuses when activities change', () => {
    const execution = createMockExecution([
      { id: 'task1', status: 'running' },
      { id: 'task2', status: 'pending' },
    ])
    useExecutionStore.getState().setExecution(execution)

    const edges = [
      { id: 'edge1', source: 'task1' },
      { id: 'edge2', source: 'task2' },
    ]

    const { result, rerender } = renderHook(() => useEdgeStatuses(edges))

    expect(result.current.get('edge1')).toBe('pending')
    expect(result.current.get('edge2')).toBe('pending')

    // Update both tasks
    useExecutionStore.getState().applyPatch(
      [
        { op: 'replace', path: '/activities/task1/status', value: 'completed' },
        { op: 'replace', path: '/activities/task2/status', value: 'running' },
      ],
      '1691431234568-0'
    )

    rerender()

    expect(result.current.get('edge1')).toBe('passed')
    expect(result.current.get('edge2')).toBe('pending')
  })

  it('handles workflow with mixed terminal and non-terminal states', () => {
    const execution = createMockExecution([
      { id: 'fetch_data', status: 'completed' },
      { id: 'process_data', status: 'running' },
      { id: 'send_notification', status: 'pending' },
      { id: 'log_error', status: 'failed' },
      { id: 'cleanup', status: 'cancelled' },
      { id: 'retry_task', status: 'retrying' },
    ])
    useExecutionStore.getState().setExecution(execution)

    const edges = [
      { id: 'edge1', source: 'fetch_data' }, // completed -> passed
      { id: 'edge2', source: 'process_data' }, // running -> pending
      { id: 'edge3', source: 'send_notification' }, // pending -> pending
      { id: 'edge4', source: 'log_error' }, // failed -> passed
      { id: 'edge5', source: 'cleanup' }, // cancelled -> passed
      { id: 'edge6', source: 'retry_task' }, // retrying -> pending
    ]

    const { result } = renderHook(() => useEdgeStatuses(edges))

    expect(result.current.get('edge1')).toBe('passed')
    expect(result.current.get('edge2')).toBe('pending')
    expect(result.current.get('edge3')).toBe('pending')
    expect(result.current.get('edge4')).toBe('passed')
    expect(result.current.get('edge5')).toBe('passed')
    expect(result.current.get('edge6')).toBe('pending')
  })

  it('maintains referential equality when activities unchanged', () => {
    const execution = createMockExecution([{ id: 'task1', status: 'running' }])
    useExecutionStore.getState().setExecution(execution)

    const edges = [{ id: 'edge1', source: 'task1' }]

    const { result, rerender } = renderHook(() => useEdgeStatuses(edges))
    const firstResult = result.current

    rerender()
    const secondResult = result.current

    // Should be the same object (memoized)
    expect(firstResult).toBe(secondResult)
  })

  it('creates new map when activities change', () => {
    const execution = createMockExecution([{ id: 'task1', status: 'running' }])
    useExecutionStore.getState().setExecution(execution)

    const edges = [{ id: 'edge1', source: 'task1' }]

    const { result, rerender } = renderHook(() => useEdgeStatuses(edges))
    const firstResult = result.current

    // Change activity status
    useExecutionStore
      .getState()
      .applyPatch([{ op: 'replace', path: '/activities/task1/status', value: 'completed' }], '1691431234568-0')

    rerender()
    const secondResult = result.current

    // Should be different objects
    expect(firstResult).not.toBe(secondResult)
  })
})
