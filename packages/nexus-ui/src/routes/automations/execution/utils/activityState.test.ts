/**
 * Activity State Utilities Tests
 *
 * Comprehensive tests for JSON Patch operations and activity state management
 */

import { describe, it, expect } from 'vitest'

import type { ActivityState, JsonPatchOperation } from '../types'

import {
  parseActivityPath,
  applyOperation,
  applyJsonPatch,
  buildActivityStateMap,
  extractActivityMaps,
} from './activityState'

// ============================================================================
// Path Parsing Tests
// ============================================================================

describe('parseActivityPath', () => {
  it('parses activity ID path correctly', () => {
    const result = parseActivityPath('/activities/fetch_data/status')
    expect(result).toEqual({
      activityId: 'fetch_data',
      field: 'status',
      arrayIndex: undefined,
    })
  })

  it('parses array index path correctly', () => {
    const result = parseActivityPath('/activities/0/status')
    expect(result).toEqual({
      activityId: '0',
      field: 'status',
      arrayIndex: 0,
    })
  })

  it('handles path without leading slash', () => {
    const result = parseActivityPath('activities/process_data/error_details')
    expect(result).toEqual({
      activityId: 'process_data',
      field: 'error_details',
      arrayIndex: undefined,
    })
  })

  it('throws error for invalid path format', () => {
    expect(() => parseActivityPath('/invalid/path')).toThrow('Invalid activity path format')
    expect(() => parseActivityPath('/activities')).toThrow('Invalid activity path format')
    expect(() => parseActivityPath('/activities/id')).toThrow('Invalid activity path format')
  })

  it('throws error for wrong root key', () => {
    expect(() => parseActivityPath('/executions/id/status')).toThrow('Invalid activity path format')
  })

  it('throws error for empty parts', () => {
    expect(() => parseActivityPath('/activities//status')).toThrow('Missing activity ID or field')
    expect(() => parseActivityPath('/activities/id/')).toThrow('Missing activity ID or field')
  })
})

// ============================================================================
// Apply Operation Tests
// ============================================================================

describe('applyOperation', () => {
  describe('add operation', () => {
    it('creates new activity with status', () => {
      const activities = new Map<string, ActivityState>()
      const operation: JsonPatchOperation = {
        op: 'add',
        path: '/activities/fetch_data/status',
        value: 'running',
      }

      applyOperation(activities, operation)

      expect(activities.get('fetch_data')).toEqual({
        activityId: 'fetch_data',
        status: 'running',
      })
    })

    it('adds error_details to existing activity', () => {
      const activities = new Map<string, ActivityState>([['fetch_data', { activityId: 'fetch_data', status: 'error' }]])
      const operation: JsonPatchOperation = {
        op: 'add',
        path: '/activities/fetch_data/error_details',
        value: 'Connection timeout',
      }

      applyOperation(activities, operation)

      expect(activities.get('fetch_data')?.errorDetails).toBe('Connection timeout')
    })

    it('throws error if value is missing', () => {
      const activities = new Map<string, ActivityState>()
      const operation: JsonPatchOperation = {
        op: 'add',
        path: '/activities/fetch_data/status',
      }

      expect(() => applyOperation(activities, operation)).toThrow("Operation 'add' requires a value")
    })

    it('throws error when creating activity without status field', () => {
      const activities = new Map<string, ActivityState>()
      const operation: JsonPatchOperation = {
        op: 'add',
        path: '/activities/fetch_data/error_details',
        value: 'Error',
      }

      expect(() => applyOperation(activities, operation)).toThrow("'status' is required first")
    })
  })

  describe('replace operation', () => {
    it('replaces activity status', () => {
      const activities = new Map<string, ActivityState>([
        ['process_data', { activityId: 'process_data', status: 'running' }],
      ])
      const operation: JsonPatchOperation = {
        op: 'replace',
        path: '/activities/process_data/status',
        value: 'completed',
      }

      applyOperation(activities, operation)

      expect(activities.get('process_data')?.status).toBe('success')
    })

    it('maps completed to success', () => {
      const activities = new Map<string, ActivityState>([['task', { activityId: 'task', status: 'running' }]])
      const operation: JsonPatchOperation = {
        op: 'replace',
        path: '/activities/task/status',
        value: 'completed',
      }

      applyOperation(activities, operation)

      expect(activities.get('task')?.status).toBe('success')
    })

    it('maps failed to error', () => {
      const activities = new Map<string, ActivityState>([['task', { activityId: 'task', status: 'running' }]])
      const operation: JsonPatchOperation = {
        op: 'replace',
        path: '/activities/task/status',
        value: 'failed',
      }

      applyOperation(activities, operation)

      expect(activities.get('task')?.status).toBe('error')
    })

    it('maps retrying to running', () => {
      const activities = new Map<string, ActivityState>([['task', { activityId: 'task', status: 'error' }]])
      const operation: JsonPatchOperation = {
        op: 'replace',
        path: '/activities/task/status',
        value: 'retrying',
      }

      applyOperation(activities, operation)

      expect(activities.get('task')?.status).toBe('running')
    })

    it('updates error_details', () => {
      const activities = new Map<string, ActivityState>([
        ['task', { activityId: 'task', status: 'error', errorDetails: 'Old error' }],
      ])
      const operation: JsonPatchOperation = {
        op: 'replace',
        path: '/activities/task/error_details',
        value: 'New error message',
      }

      applyOperation(activities, operation)

      expect(activities.get('task')?.errorDetails).toBe('New error message')
    })

    it('updates started_at timestamp', () => {
      const activities = new Map<string, ActivityState>([['task', { activityId: 'task', status: 'running' }]])
      const operation: JsonPatchOperation = {
        op: 'replace',
        path: '/activities/task/started_at',
        value: '2025-12-10T15:00:10Z',
      }

      applyOperation(activities, operation)

      expect(activities.get('task')?.startedAt).toBe('2025-12-10T15:00:10Z')
    })

    it('updates completed_at timestamp', () => {
      const activities = new Map<string, ActivityState>([['task', { activityId: 'task', status: 'success' }]])
      const operation: JsonPatchOperation = {
        op: 'replace',
        path: '/activities/task/completed_at',
        value: '2025-12-10T15:00:25Z',
      }

      applyOperation(activities, operation)

      expect(activities.get('task')?.completedAt).toBe('2025-12-10T15:00:25Z')
    })

    it('throws error if value is missing', () => {
      const activities = new Map<string, ActivityState>([['task', { activityId: 'task', status: 'running' }]])
      const operation: JsonPatchOperation = {
        op: 'replace',
        path: '/activities/task/status',
      }

      expect(() => applyOperation(activities, operation)).toThrow("Operation 'replace' requires a value")
    })

    it('throws error for unsupported field', () => {
      const activities = new Map<string, ActivityState>([['task', { activityId: 'task', status: 'running' }]])
      const operation: JsonPatchOperation = {
        op: 'replace',
        path: '/activities/task/unknown_field',
        value: 'value',
      }

      expect(() => applyOperation(activities, operation)).toThrow('Unsupported field')
    })
  })

  describe('remove operation', () => {
    it('removes error_details', () => {
      const activities = new Map<string, ActivityState>([
        ['task', { activityId: 'task', status: 'error', errorDetails: 'Some error' }],
      ])
      const operation: JsonPatchOperation = {
        op: 'remove',
        path: '/activities/task/error_details',
      }

      applyOperation(activities, operation)

      expect(activities.get('task')?.errorDetails).toBeNull()
    })

    it('handles remove when activity does not exist', () => {
      const activities = new Map<string, ActivityState>()
      const operation: JsonPatchOperation = {
        op: 'remove',
        path: '/activities/nonexistent/error_details',
      }

      // Should not throw, just no-op
      expect(() => applyOperation(activities, operation)).not.toThrow()
    })

    it('throws error when removing unsupported field', () => {
      const activities = new Map<string, ActivityState>([['task', { activityId: 'task', status: 'running' }]])
      const operation: JsonPatchOperation = {
        op: 'remove',
        path: '/activities/task/status',
      }

      expect(() => applyOperation(activities, operation)).toThrow("Only 'error_details' can be removed")
    })
  })

  describe('array index operations', () => {
    it('applies operation using array index', () => {
      const activities = new Map<string, ActivityState>([
        ['fetch_data', { activityId: 'fetch_data', status: 'pending' }],
        ['process_data', { activityId: 'process_data', status: 'pending' }],
      ])
      const activityArray: ActivityState[] = [
        { activityId: 'fetch_data', status: 'pending' },
        { activityId: 'process_data', status: 'pending' },
      ]
      const operation: JsonPatchOperation = {
        op: 'replace',
        path: '/activities/1/status',
        value: 'running',
      }

      applyOperation(activities, operation, activityArray)

      expect(activities.get('process_data')?.status).toBe('running')
    })

    it('throws error for invalid array index', () => {
      const activities = new Map<string, ActivityState>()
      const activityArray: ActivityState[] = []
      const operation: JsonPatchOperation = {
        op: 'replace',
        path: '/activities/0/status',
        value: 'running',
      }

      expect(() => applyOperation(activities, operation, activityArray)).toThrow('Activity not found at index')
    })
  })

  describe('unsupported operations', () => {
    it('throws error for move operation', () => {
      const activities = new Map<string, ActivityState>()
      const operation: JsonPatchOperation = {
        op: 'move',
        path: '/activities/task/status',
        from: '/activities/other/status',
      }

      expect(() => applyOperation(activities, operation)).toThrow("Operation 'move' is not supported")
    })

    it('throws error for copy operation', () => {
      const activities = new Map<string, ActivityState>()
      const operation: JsonPatchOperation = {
        op: 'copy',
        path: '/activities/task/status',
        from: '/activities/other/status',
      }

      expect(() => applyOperation(activities, operation)).toThrow("Operation 'copy' is not supported")
    })

    it('throws error for test operation', () => {
      const activities = new Map<string, ActivityState>()
      const operation: JsonPatchOperation = {
        op: 'test',
        path: '/activities/task/status',
        value: 'running',
      }

      expect(() => applyOperation(activities, operation)).toThrow("Operation 'test' is not supported")
    })
  })
})

// ============================================================================
// Apply JSON Patch Tests
// ============================================================================

describe('applyJsonPatch', () => {
  it('applies multiple operations sequentially', () => {
    const activities = new Map<string, ActivityState>()
    const operations: JsonPatchOperation[] = [
      { op: 'add', path: '/activities/fetch_data/status', value: 'running' },
      { op: 'add', path: '/activities/process_data/status', value: 'pending' },
      { op: 'replace', path: '/activities/fetch_data/status', value: 'completed' },
    ]

    applyJsonPatch(activities, operations)

    expect(activities.get('fetch_data')?.status).toBe('success')
    expect(activities.get('process_data')?.status).toBe('pending')
  })

  it('applies activity status change with error', () => {
    const activities = new Map<string, ActivityState>([['task', { activityId: 'task', status: 'running' }]])
    const operations: JsonPatchOperation[] = [
      { op: 'replace', path: '/activities/task/status', value: 'failed' },
      { op: 'add', path: '/activities/task/error_details', value: 'Connection timeout' },
    ]

    applyJsonPatch(activities, operations)

    expect(activities.get('task')).toEqual({
      activityId: 'task',
      status: 'error',
      errorDetails: 'Connection timeout',
    })
  })

  it('throws error with context when operation fails', () => {
    const activities = new Map<string, ActivityState>()
    const operations: JsonPatchOperation[] = [
      { op: 'replace', path: '/activities/task/status' }, // Missing value
    ]

    expect(() => applyJsonPatch(activities, operations)).toThrow('Failed to apply operation replace')
    expect(() => applyJsonPatch(activities, operations)).toThrow('requires a value')
  })

  it('handles empty operations array', () => {
    const activities = new Map<string, ActivityState>([['task', { activityId: 'task', status: 'running' }]])

    applyJsonPatch(activities, [])

    expect(activities.get('task')?.status).toBe('running')
  })
})

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('buildActivityStateMap', () => {
  it('converts API activity data to map', () => {
    const apiActivities = [
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
    ]

    const map = buildActivityStateMap(apiActivities)

    expect(map.size).toBe(2)
    expect(map.get('fetch_data')).toEqual({
      activityId: 'fetch_data',
      status: 'success',
      errorDetails: null,
      startedAt: '2025-12-10T15:00:05Z',
      completedAt: '2025-12-10T15:00:10Z',
    })
    expect(map.get('process_data')).toEqual({
      activityId: 'process_data',
      status: 'running',
      errorDetails: null,
      startedAt: '2025-12-10T15:00:10Z',
      completedAt: null,
    })
  })

  it('maps failed status to error', () => {
    const apiActivities = [
      {
        activity_id: 'task',
        status: 'failed' as const,
        error_details: 'Connection timeout',
        started_at: '2025-12-10T15:00:05Z',
        completed_at: '2025-12-10T15:00:10Z',
      },
    ]

    const map = buildActivityStateMap(apiActivities)

    expect(map.get('task')?.status).toBe('error')
    expect(map.get('task')?.errorDetails).toBe('Connection timeout')
  })

  it('handles empty array', () => {
    const map = buildActivityStateMap([])
    expect(map.size).toBe(0)
  })
})

describe('extractActivityMaps', () => {
  it('extracts status and error maps', () => {
    const activities = new Map<string, ActivityState>([
      ['fetch_data', { activityId: 'fetch_data', status: 'success' }],
      ['process_data', { activityId: 'process_data', status: 'error', errorDetails: 'Failed to process' }],
      ['send_notification', { activityId: 'send_notification', status: 'pending' }],
    ])

    const [statusMap, errorMap] = extractActivityMaps(activities)

    expect(statusMap.size).toBe(3)
    expect(statusMap.get('fetch_data')).toBe('success')
    expect(statusMap.get('process_data')).toBe('error')
    expect(statusMap.get('send_notification')).toBe('pending')

    expect(errorMap.size).toBe(1)
    expect(errorMap.get('process_data')).toBe('Failed to process')
  })

  it('handles activities without errors', () => {
    const activities = new Map<string, ActivityState>([
      ['task1', { activityId: 'task1', status: 'success' }],
      ['task2', { activityId: 'task2', status: 'running' }],
    ])

    const [statusMap, errorMap] = extractActivityMaps(activities)

    expect(statusMap.size).toBe(2)
    expect(errorMap.size).toBe(0)
  })

  it('handles empty map', () => {
    const activities = new Map<string, ActivityState>()
    const [statusMap, errorMap] = extractActivityMaps(activities)

    expect(statusMap.size).toBe(0)
    expect(errorMap.size).toBe(0)
  })
})
