/**
 * Execution Store Tests
 *
 * Comprehensive tests for execution visualization store
 */

import { describe, it, expect, beforeEach } from 'vitest'

import type { Execution } from '../execution/types'

import {
  useExecutionStore,
  selectExecutionId,
  selectVisualization,
  selectActivityStatus,
  selectActivityError,
  selectConnectionState,
  selectIsComplete,
  selectLastEventId,
  selectError,
  selectIsLoaded,
} from './useExecutionStore'

// ============================================================================
// Test Helpers
// ============================================================================

function createMockExecution(overrides?: Partial<Execution>): Execution {
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
    activities: [
      {
        activity_id: 'fetch_data',
        status: 'completed',
        error_details: null,
        started_at: '2025-12-10T15:00:05Z',
        completed_at: '2025-12-10T15:00:10Z',
      },
      {
        activity_id: 'process_data',
        status: 'running',
        error_details: null,
        started_at: '2025-12-10T15:00:10Z',
        completed_at: null,
      },
      {
        activity_id: 'send_notification',
        status: 'pending',
        error_details: null,
        started_at: null,
        completed_at: null,
      },
    ],
    ...overrides,
  } as Execution
}

// ============================================================================
// Store Tests
// ============================================================================

describe('useExecutionStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useExecutionStore.getState().reset()
  })

  describe('initial state', () => {
    it('has correct initial state', () => {
      const state = useExecutionStore.getState()

      expect(state.executionId).toBeNull()
      expect(state.visualization).toBeNull()
      expect(state.activityStates.size).toBe(0)
      expect(state.activityErrors.size).toBe(0)
      expect(state.isConnected).toBe(false)
      expect(state.isStale).toBe(false)
      expect(state.isComplete).toBe(false)
      expect(state.lastEventId).toBeNull()
      expect(state.error).toBeNull()
    })
  })

  describe('setExecution', () => {
    it('sets execution data correctly', () => {
      const execution = createMockExecution()

      useExecutionStore.getState().setExecution(execution)

      const state = useExecutionStore.getState()
      expect(state.executionId).toBe('exec-123')
      expect(state.visualization).not.toBeNull()
      expect(state.visualization?.executionId).toBe('exec-123')
      expect(state.visualization?.workflowId).toBe('workflow-456')
      expect(state.visualization?.status).toBe('running')
    })

    it('builds activity state map from execution', () => {
      const execution = createMockExecution()

      useExecutionStore.getState().setExecution(execution)

      const state = useExecutionStore.getState()
      expect(state.activityStates.size).toBe(3)
      expect(state.activityStates.get('fetch_data')?.status).toBe('completed')
      expect(state.activityStates.get('process_data')?.status).toBe('running')
      expect(state.activityStates.get('send_notification')?.status).toBe('pending')
    })

    it('stores full ActivityState objects', () => {
      const execution = createMockExecution()

      useExecutionStore.getState().setExecution(execution)

      const state = useExecutionStore.getState()
      const fetchDataState = state.activityStates.get('fetch_data')
      expect(fetchDataState).toBeDefined()
      expect(fetchDataState?.activityId).toBe('fetch_data')
      expect(fetchDataState?.status).toBe('completed')
      expect(fetchDataState?.startedAt).toBe('2025-12-10T15:00:05Z')
      expect(fetchDataState?.completedAt).toBe('2025-12-10T15:00:10Z')
      expect(fetchDataState?.errorDetails).toBeNull()
    })

    it('stores completed status without conversion', () => {
      const execution = createMockExecution()

      useExecutionStore.getState().setExecution(execution)

      const state = useExecutionStore.getState()
      expect(state.activityStates.get('fetch_data')?.status).toBe('completed')
    })

    it('extracts activity errors', () => {
      const execution = createMockExecution({
        activities: [
          {
            activity_id: 'failed_task',
            status: 'failed',
            error_details: 'Connection timeout',
            started_at: '2025-12-10T15:00:05Z',
            completed_at: '2025-12-10T15:00:10Z',
          },
        ],
      } as Partial<Execution>)

      useExecutionStore.getState().setExecution(execution)

      const state = useExecutionStore.getState()
      expect(state.activityStates.get('failed_task')?.status).toBe('failed')
      expect(state.activityErrors.get('failed_task')).toBe('Connection timeout')
    })

    it('handles execution without activities', () => {
      const execution = createMockExecution({
        activities: [],
      } as Partial<Execution>)

      useExecutionStore.getState().setExecution(execution)

      const state = useExecutionStore.getState()
      expect(state.activityStates.size).toBe(0)
      expect(state.activityErrors.size).toBe(0)
    })

    it('clears previous error on successful load', () => {
      useExecutionStore.getState().setError(new Error('Previous error'))

      const execution = createMockExecution()
      useExecutionStore.getState().setExecution(execution)

      const state = useExecutionStore.getState()
      expect(state.error).toBeNull()
    })

    it('updates visualization with workflow definition', () => {
      const execution = createMockExecution({
        workflow_definition: { workflow: { activities: [{ id: 'task1' }] } },
      } as unknown as Partial<Execution>)

      useExecutionStore.getState().setExecution(execution)

      const state = useExecutionStore.getState()
      expect(state.visualization?.workflowDefinition).toEqual({
        workflow: { activities: [{ id: 'task1' }] },
      })
    })
  })

  describe('setActivityExecutions', () => {
    it('converts ActivityExecution array to ActivityState map', () => {
      useExecutionStore.getState().setActivityExecutions([
        {
          id: 'task1-exec',
          created_at: '2025-12-10T15:00:05Z',
          updated_at: '2025-12-10T15:00:05Z',
          execution_id: 'exec-123',
          temporal_activity_id: 'temporal-task1',
          activity_name: 'task1',
          status: 'completed' as const,
          error_details: null,
          started_at: '2025-12-10T15:00:05Z',
          completed_at: '2025-12-10T15:00:10Z',
        },
        {
          id: 'task2-exec',
          created_at: '2025-12-10T15:00:10Z',
          updated_at: '2025-12-10T15:00:10Z',
          execution_id: 'exec-123',
          temporal_activity_id: 'temporal-task2',
          activity_name: 'task2',
          status: 'running' as const,
          error_details: null,
          started_at: '2025-12-10T15:00:10Z',
          completed_at: null,
        },
      ])

      const state = useExecutionStore.getState()
      expect(state.activityStates.size).toBe(2)
      expect(state.activityStates.get('task1')?.status).toBe('completed')
      expect(state.activityStates.get('task2')?.status).toBe('running')
    })

    it('preserves original ActivityStatus from backend', () => {
      useExecutionStore.getState().setActivityExecutions([
        {
          id: 'task1-exec',
          created_at: '2025-12-10T15:00:05Z',
          updated_at: '2025-12-10T15:00:05Z',
          execution_id: 'exec-123',
          temporal_activity_id: 'temporal-task1',
          activity_name: 'task1',
          status: 'completed' as const,
          error_details: null,
          started_at: '2025-12-10T15:00:05Z',
          completed_at: '2025-12-10T15:00:10Z',
        },
      ])

      const state = useExecutionStore.getState()
      // Should preserve backend status without conversion
      expect(state.activityStates.get('task1')?.status).toBe('completed')
    })

    it('extracts errors from activity executions', () => {
      useExecutionStore.getState().setActivityExecutions([
        {
          id: 'failed_task-exec',
          created_at: '2025-12-10T15:00:05Z',
          updated_at: '2025-12-10T15:00:05Z',
          execution_id: 'exec-123',
          temporal_activity_id: 'temporal-failed',
          activity_name: 'failed_task',
          status: 'failed' as const,
          error_details: 'Connection timeout',
          started_at: '2025-12-10T15:00:05Z',
          completed_at: '2025-12-10T15:00:10Z',
        },
      ])

      const state = useExecutionStore.getState()
      expect(state.activityErrors.get('failed_task')).toBe('Connection timeout')
    })

    it('handles ActivityData from Execution.activities (activity_id shape)', () => {
      useExecutionStore.getState().setActivityExecutions([
        {
          activity_id: 'fetch_data',
          status: 'completed' as const,
          error_details: null,
          started_at: '2025-12-10T15:00:05Z',
          completed_at: '2025-12-10T15:00:10Z',
        },
        {
          activity_id: 'process_data',
          status: 'running' as const,
          error_details: null,
          started_at: '2025-12-10T15:00:10Z',
          completed_at: null,
        },
      ])

      const state = useExecutionStore.getState()
      expect(state.activityStates.size).toBe(2)
      expect(state.activityStates.get('fetch_data')?.status).toBe('completed')
      expect(state.activityStates.get('process_data')?.status).toBe('running')
    })
  })

  describe('setComplete', () => {
    it('marks execution as complete', () => {
      useExecutionStore.getState().setComplete(true)

      const state = useExecutionStore.getState()
      expect(state.isComplete).toBe(true)
    })

    it('can unmark execution as complete', () => {
      useExecutionStore.getState().setComplete(true)
      useExecutionStore.getState().setComplete(false)

      const state = useExecutionStore.getState()
      expect(state.isComplete).toBe(false)
    })
  })

  describe('setConnectionState', () => {
    it('sets connection state', () => {
      useExecutionStore.getState().setConnectionState(true, false)

      const state = useExecutionStore.getState()
      expect(state.isConnected).toBe(true)
      expect(state.isStale).toBe(false)
    })

    it('sets stale state', () => {
      useExecutionStore.getState().setConnectionState(false, true)

      const state = useExecutionStore.getState()
      expect(state.isConnected).toBe(false)
      expect(state.isStale).toBe(true)
    })
  })

  describe('setLastEventId', () => {
    it('sets last event ID', () => {
      useExecutionStore.getState().setLastEventId('1691431234567-0')

      const state = useExecutionStore.getState()
      expect(state.lastEventId).toBe('1691431234567-0')
    })

    it('updates last event ID', () => {
      useExecutionStore.getState().setLastEventId('1691431234567-0')
      useExecutionStore.getState().setLastEventId('1691431234567-1')

      const state = useExecutionStore.getState()
      expect(state.lastEventId).toBe('1691431234567-1')
    })
  })

  describe('setError', () => {
    it('sets error', () => {
      const error = new Error('Test error')
      useExecutionStore.getState().setError(error)

      const state = useExecutionStore.getState()
      expect(state.error).toBe(error)
    })

    it('clears error', () => {
      useExecutionStore.getState().setError(new Error('Test error'))
      useExecutionStore.getState().setError(null)

      const state = useExecutionStore.getState()
      expect(state.error).toBeNull()
    })
  })

  describe('reset', () => {
    it('resets to initial state', () => {
      const execution = createMockExecution()
      useExecutionStore.getState().setExecution(execution)
      useExecutionStore.getState().setConnectionState(true, false)
      useExecutionStore.getState().setComplete(true)
      useExecutionStore.getState().setLastEventId('1691431234567-0')
      useExecutionStore.getState().setError(new Error('Test error'))

      useExecutionStore.getState().reset()

      const state = useExecutionStore.getState()
      expect(state.executionId).toBeNull()
      expect(state.visualization).toBeNull()
      expect(state.activityStates.size).toBe(0)
      expect(state.activityErrors.size).toBe(0)
      expect(state.isConnected).toBe(false)
      expect(state.isStale).toBe(false)
      expect(state.isComplete).toBe(false)
      expect(state.lastEventId).toBeNull()
      expect(state.error).toBeNull()
    })
  })

  // ============================================================================
  // Selector Tests
  // ============================================================================

  describe('selectors', () => {
    beforeEach(() => {
      const execution = createMockExecution()
      useExecutionStore.getState().setExecution(execution)
    })

    it('selectExecutionId returns execution ID', () => {
      const executionId = selectExecutionId(useExecutionStore.getState())
      expect(executionId).toBe('exec-123')
    })

    it('selectVisualization returns visualization', () => {
      const visualization = selectVisualization(useExecutionStore.getState())
      expect(visualization).not.toBeNull()
      expect(visualization?.executionId).toBe('exec-123')
    })

    it('selectActivityStatus returns activity status', () => {
      const status = selectActivityStatus('fetch_data')(useExecutionStore.getState())
      expect(status).toBe('completed')
    })

    it('selectActivityStatus returns undefined for unknown activity', () => {
      const status = selectActivityStatus('unknown')(useExecutionStore.getState())
      expect(status).toBeUndefined()
    })

    it('selectActivityError returns error', () => {
      const execution = createMockExecution({
        activities: [
          {
            activity_id: 'failed_task',
            status: 'failed',
            error_details: 'Connection timeout',
            started_at: '2025-12-10T15:00:05Z',
            completed_at: '2025-12-10T15:00:10Z',
          },
        ],
      } as Partial<Execution>)
      useExecutionStore.getState().setExecution(execution)

      const error = selectActivityError('failed_task')(useExecutionStore.getState())
      expect(error).toBe('Connection timeout')
    })

    it('selectConnectionState returns connection state', () => {
      useExecutionStore.getState().setConnectionState(true, false)

      const connectionState = selectConnectionState(useExecutionStore.getState())
      expect(connectionState.isConnected).toBe(true)
      expect(connectionState.isStale).toBe(false)
    })

    it('selectIsComplete returns completion state', () => {
      useExecutionStore.getState().setComplete(true)

      const isComplete = selectIsComplete(useExecutionStore.getState())
      expect(isComplete).toBe(true)
    })

    it('selectLastEventId returns last event ID', () => {
      useExecutionStore.getState().setLastEventId('1691431234567-0')

      const lastEventId = selectLastEventId(useExecutionStore.getState())
      expect(lastEventId).toBe('1691431234567-0')
    })

    it('selectError returns error', () => {
      const error = new Error('Test error')
      useExecutionStore.getState().setError(error)

      const stateError = selectError(useExecutionStore.getState())
      expect(stateError).toBe(error)
    })

    it('selectIsLoaded returns true when execution loaded', () => {
      const isLoaded = selectIsLoaded(useExecutionStore.getState())
      expect(isLoaded).toBe(true)
    })

    it('selectIsLoaded returns false when no execution', () => {
      useExecutionStore.getState().reset()

      const isLoaded = selectIsLoaded(useExecutionStore.getState())
      expect(isLoaded).toBe(false)
    })
  })
})
