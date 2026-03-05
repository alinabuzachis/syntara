import type { Activity } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import { makeCondition } from '../../../test/test-helpers'

import { ActivityTraversal } from './ActivityTraversal'

describe('ActivityTraversal', () => {
  describe('getActivityId', () => {
    it('returns the ID when given a string', () => {
      expect(ActivityTraversal.getActivityId('activity-123')).toBe('activity-123')
    })

    it('extracts the ID from an Activity object', () => {
      const activity = { id: 'task-1', type: 'task', name: 'Test Task', task: {} } as unknown as Activity
      expect(ActivityTraversal.getActivityId(activity)).toBe('task-1')
    })
  })

  describe('getFirstActivityId', () => {
    it('returns the activity ID for a simple task', () => {
      const activity = { id: 'task-1', type: 'task', name: 'Test Task', task: {} } as unknown as Activity
      expect(ActivityTraversal.getFirstActivityId(activity)).toBe('task-1')
    })

    it('returns the first activity ID from a sequence', () => {
      const sequence = {
        id: 'seq-1',
        type: 'sequence',
        name: 'Test Sequence',
        steps: [
          { id: 'task-1', type: 'task', name: 'First Task', task: {} },
          { id: 'task-2', type: 'task', name: 'Second Task', task: {} },
        ],
      } as unknown as Activity
      expect(ActivityTraversal.getFirstActivityId(sequence)).toBe('task-1')
    })

    it('drills into nested sequences', () => {
      const nestedSequence = {
        id: 'seq-outer',
        type: 'sequence',
        name: 'Outer Sequence',
        steps: [
          {
            id: 'seq-inner',
            type: 'sequence',
            name: 'Inner Sequence',
            steps: [{ id: 'task-nested', type: 'task', name: 'Nested Task', task: {} }],
          },
        ],
      } as unknown as Activity
      expect(ActivityTraversal.getFirstActivityId(nestedSequence)).toBe('task-nested')
    })

    it('returns sequence ID when steps are empty', () => {
      const emptySequence = {
        id: 'seq-empty',
        type: 'sequence',
        name: 'Empty Sequence',
        steps: [],
      } as unknown as Activity
      expect(ActivityTraversal.getFirstActivityId(emptySequence)).toBe('seq-empty')
    })

    it('returns sequence ID when steps is undefined', () => {
      const noStepsSequence: Activity = {
        id: 'seq-no-steps',
        type: 'sequence',
        name: 'No Steps Sequence',
      } as Activity
      expect(ActivityTraversal.getFirstActivityId(noStepsSequence)).toBe('seq-no-steps')
    })
  })

  describe('getLastActivityId', () => {
    it('returns the activity ID for a simple task', () => {
      const activity = { id: 'task-1', type: 'task', name: 'Test Task', task: {} } as unknown as Activity
      expect(ActivityTraversal.getLastActivityId(activity)).toBe('task-1')
    })

    it('returns the last activity ID from a sequence', () => {
      const sequence = {
        id: 'seq-1',
        type: 'sequence',
        name: 'Test Sequence',
        steps: [
          { id: 'task-1', type: 'task', name: 'First Task', task: {} },
          { id: 'task-2', type: 'task', name: 'Last Task', task: {} },
        ],
      } as unknown as Activity
      expect(ActivityTraversal.getLastActivityId(sequence)).toBe('task-2')
    })

    it('returns sequence ID when steps are empty', () => {
      const emptySequence = {
        id: 'seq-empty',
        type: 'sequence',
        name: 'Empty Sequence',
        steps: [],
      } as unknown as Activity
      expect(ActivityTraversal.getLastActivityId(emptySequence)).toBe('seq-empty')
    })

    it('returns last activity from then branch of condition', () => {
      const condition = makeCondition({
        id: 'cond-1',
        name: 'Test Condition',
        condition: 'true',
        then: [
          { id: 'task-then-1', type: 'task', name: 'Then Task 1', task: {} },
          { id: 'task-then-2', type: 'task', name: 'Then Task 2', task: {} },
        ],
        else: [{ id: 'task-else-1', type: 'task', name: 'Else Task', task: {} }],
      })
      // Should return last activity from then branch (first priority)
      expect(ActivityTraversal.getLastActivityId(condition)).toBe('task-then-2')
    })

    it('returns last activity from else branch when then is empty', () => {
      const condition = makeCondition({
        id: 'cond-1',
        name: 'Test Condition',
        condition: 'true',
        then: [],
        else: [
          { id: 'task-else-1', type: 'task', name: 'Else Task 1', task: {} },
          { id: 'task-else-2', type: 'task', name: 'Else Task 2', task: {} },
        ],
      })
      expect(ActivityTraversal.getLastActivityId(condition)).toBe('task-else-2')
    })

    it('returns condition ID when both branches are empty', () => {
      const condition = makeCondition({
        id: 'cond-empty',
        name: 'Empty Condition',
        condition: 'true',
      })
      expect(ActivityTraversal.getLastActivityId(condition)).toBe('cond-empty')
    })

    it('returns loop ID for loop activities', () => {
      const loop = {
        id: 'loop-1',
        type: 'loop',
        name: 'Test Loop',
        loop: {
          over: 'items',
          do: [{ id: 'task-in-loop', type: 'task', name: 'Loop Task', task: {} }],
        },
      } as unknown as Activity
      // Loops return their own ID (connected via 'done' handle)
      expect(ActivityTraversal.getLastActivityId(loop)).toBe('loop-1')
    })
  })

  describe('getAllLastActivityIds', () => {
    it('returns single ID for simple task', () => {
      const task = { id: 'task-1', type: 'task', name: 'Test Task', task: {} } as unknown as Activity
      expect(ActivityTraversal.getAllLastActivityIds(task)).toEqual(['task-1'])
    })

    it('returns last activity ID from sequence', () => {
      const sequence = {
        id: 'seq-1',
        type: 'sequence',
        name: 'Test Sequence',
        steps: [
          { id: 'task-1', type: 'task', name: 'First Task', task: {} },
          { id: 'task-2', type: 'task', name: 'Last Task', task: {} },
        ],
      } as unknown as Activity
      expect(ActivityTraversal.getAllLastActivityIds(sequence)).toEqual(['task-2'])
    })

    it('returns sequence ID when steps are empty', () => {
      const emptySequence = {
        id: 'seq-empty',
        type: 'sequence',
        name: 'Empty Sequence',
        steps: [],
      } as unknown as Activity
      expect(ActivityTraversal.getAllLastActivityIds(emptySequence)).toEqual(['seq-empty'])
    })

    it('returns last activities from all parallel branches', () => {
      const parallel = {
        id: 'parallel-1',
        type: 'parallel',
        name: 'Test Parallel',
        branches: [
          { id: 'task-branch-1', type: 'task', name: 'Branch 1 Task', task: {} },
          { id: 'task-branch-2', type: 'task', name: 'Branch 2 Task', task: {} },
          { id: 'task-branch-3', type: 'task', name: 'Branch 3 Task', task: {} },
        ],
      } as unknown as Activity
      expect(ActivityTraversal.getAllLastActivityIds(parallel)).toEqual([
        'task-branch-1',
        'task-branch-2',
        'task-branch-3',
      ])
    })

    it('returns parallel ID when branches are empty', () => {
      const emptyParallel = {
        id: 'parallel-empty',
        type: 'parallel',
        name: 'Empty Parallel',
        branches: [],
      } as unknown as Activity
      expect(ActivityTraversal.getAllLastActivityIds(emptyParallel)).toEqual(['parallel-empty'])
    })

    it('returns last activities from both condition branches', () => {
      const condition = makeCondition({
        id: 'cond-1',
        name: 'Test Condition',
        condition: 'true',
        then: [{ id: 'task-then', type: 'task', name: 'Then Task', task: {} }],
        else: [{ id: 'task-else', type: 'task', name: 'Else Task', task: {} }],
      })
      expect(ActivityTraversal.getAllLastActivityIds(condition)).toEqual(['task-then', 'task-else'])
    })

    it('returns condition ID when both branches are empty', () => {
      const emptyCondition = makeCondition({
        id: 'cond-empty',
        name: 'Empty Condition',
        condition: 'true',
      })
      expect(ActivityTraversal.getAllLastActivityIds(emptyCondition)).toEqual(['cond-empty'])
    })

    it('returns only then branch last activity when else is empty', () => {
      const condition = makeCondition({
        id: 'cond-1',
        name: 'Test Condition',
        condition: 'true',
        then: [{ id: 'task-then', type: 'task', name: 'Then Task', task: {} }],
        else: [],
      })
      expect(ActivityTraversal.getAllLastActivityIds(condition)).toEqual(['task-then'])
    })

    it('returns only else branch last activity when then is empty', () => {
      const condition = makeCondition({
        id: 'cond-1',
        name: 'Test Condition',
        condition: 'true',
        then: [],
        else: [{ id: 'task-else', type: 'task', name: 'Else Task', task: {} }],
      })
      expect(ActivityTraversal.getAllLastActivityIds(condition)).toEqual(['task-else'])
    })

    it('handles nested parallel within condition branches', () => {
      const condition = makeCondition({
        id: 'cond-1',
        name: 'Test Condition',
        condition: 'true',
        then: [
          {
            id: 'parallel-in-then',
            type: 'parallel',
            name: 'Parallel in Then',
            branches: [
              { id: 'task-p1', type: 'task', name: 'Task P1', task: {} },
              { id: 'task-p2', type: 'task', name: 'Task P2', task: {} },
            ],
          },
        ],
        else: [{ id: 'task-else', type: 'task', name: 'Else Task', task: {} }],
      })
      expect(ActivityTraversal.getAllLastActivityIds(condition)).toEqual(['task-p1', 'task-p2', 'task-else'])
    })
  })

  describe('getNestedActivities', () => {
    it('returns steps from sequence', () => {
      const sequence = {
        id: 'seq-1',
        type: 'sequence',
        name: 'Test Sequence',
        steps: [{ id: 'task-1', type: 'task', name: 'Task', task: {} }],
      } as unknown as Activity
      expect(ActivityTraversal.getNestedActivities(sequence)).toEqual(
        (sequence as unknown as { steps: Activity[] }).steps
      )
    })

    it('returns branches from parallel', () => {
      const parallel = {
        id: 'parallel-1',
        type: 'parallel',
        name: 'Test Parallel',
        branches: [{ id: 'task-1', type: 'task', name: 'Task', task: {} }],
      } as unknown as Activity
      expect(ActivityTraversal.getNestedActivities(parallel)).toEqual(
        (parallel as unknown as { branches: Activity[] }).branches
      )
    })

    it('returns loop.do from loop', () => {
      const loop = {
        id: 'loop-1',
        type: 'loop',
        name: 'Test Loop',
        loop: {
          over: 'items',
          do: [{ id: 'task-1', type: 'task', name: 'Task', task: {} }],
        },
      } as unknown as Activity
      expect(ActivityTraversal.getNestedActivities(loop)).toEqual(
        (loop as unknown as { loop: { do: Activity[] } }).loop.do
      )
    })

    it('returns combined then and else from condition', () => {
      const thenTask = { id: 'task-then', type: 'task', name: 'Then', task: {} } as Activity
      const elseTask = { id: 'task-else', type: 'task', name: 'Else', task: {} } as Activity
      const condition = makeCondition({
        id: 'cond-1',
        name: 'Test Condition',
        condition: 'true',
        then: [thenTask],
        else: [elseTask],
      })
      expect(ActivityTraversal.getNestedActivities(condition)).toEqual([thenTask, elseTask])
    })

    it('returns empty array for task', () => {
      const task = { id: 'task-1', type: 'task', name: 'Task', task: {} } as unknown as Activity
      expect(ActivityTraversal.getNestedActivities(task)).toEqual([])
    })

    it('returns empty array for approval without branches', () => {
      const approval = { id: 'approval-1', type: 'approval', name: 'Approval' } as unknown as Activity
      expect(ActivityTraversal.getNestedActivities(approval)).toEqual([])
    })

    it('returns onApproved and onRejected from approval', () => {
      const approvedTask = { id: 'task-approved', type: 'task', name: 'Approved', task: {} } as Activity
      const rejectedTask = { id: 'task-rejected', type: 'task', name: 'Rejected', task: {} } as Activity
      const approval = {
        id: 'approval-1',
        type: 'approval',
        name: 'Approval',
        onApproved: [approvedTask],
        onRejected: [rejectedTask],
      } as unknown as Activity
      expect(ActivityTraversal.getNestedActivities(approval)).toEqual([approvedTask, rejectedTask])
    })

    it('returns only onApproved when onRejected is missing', () => {
      const approvedTask = { id: 'task-approved', type: 'task', name: 'Approved', task: {} } as Activity
      const approval = {
        id: 'approval-1',
        type: 'approval',
        name: 'Approval',
        onApproved: [approvedTask],
      } as unknown as Activity
      expect(ActivityTraversal.getNestedActivities(approval)).toEqual([approvedTask])
    })
  })

  describe('findActivityById', () => {
    it('finds activity at root level', () => {
      const task = { id: 'task-1', type: 'task', name: 'Task', task: {} } as unknown as Activity
      expect(ActivityTraversal.findActivityById(task, 'task-1')).toEqual(task)
    })

    it('finds activity nested in sequence', () => {
      const nestedTask = { id: 'nested-task', type: 'task', name: 'Nested', task: {} } as unknown as Activity
      const sequence = {
        id: 'seq-1',
        type: 'sequence',
        name: 'Sequence',
        steps: [nestedTask],
      } as unknown as Activity
      expect(ActivityTraversal.findActivityById(sequence, 'nested-task')).toEqual(nestedTask)
    })

    it('finds activity nested in condition then branch', () => {
      const thenTask = { id: 'then-task', type: 'task', name: 'Then Task', task: {} } as Activity
      const condition = makeCondition({
        id: 'cond-1',
        name: 'Condition',
        condition: 'true',
        then: [thenTask],
        else: [],
      })
      expect(ActivityTraversal.findActivityById(condition, 'then-task')).toEqual(thenTask)
    })

    it('finds activity nested in condition else branch', () => {
      const elseTask = { id: 'else-task', type: 'task', name: 'Else Task', task: {} } as Activity
      const condition = makeCondition({
        id: 'cond-1',
        name: 'Condition',
        condition: 'true',
        then: [],
        else: [elseTask],
      })
      expect(ActivityTraversal.findActivityById(condition, 'else-task')).toEqual(elseTask)
    })

    it('finds activity nested in approval onApproved branch', () => {
      const approvedTask = { id: 'approved-task', type: 'task', name: 'Approved Task', task: {} } as Activity
      const approval = {
        id: 'approval-1',
        type: 'approval',
        name: 'Approval',
        onApproved: [approvedTask],
        onRejected: [],
      } as unknown as Activity
      expect(ActivityTraversal.findActivityById(approval, 'approved-task')).toEqual(approvedTask)
    })

    it('finds activity nested in approval onRejected branch', () => {
      const rejectedTask = { id: 'rejected-task', type: 'task', name: 'Rejected Task', task: {} } as Activity
      const approval = {
        id: 'approval-1',
        type: 'approval',
        name: 'Approval',
        onApproved: [],
        onRejected: [rejectedTask],
      } as unknown as Activity
      expect(ActivityTraversal.findActivityById(approval, 'rejected-task')).toEqual(rejectedTask)
    })

    it('returns null when activity not found', () => {
      const task = { id: 'task-1', type: 'task', name: 'Task', task: {} } as unknown as Activity
      expect(ActivityTraversal.findActivityById(task, 'nonexistent')).toBeNull()
    })
  })

  describe('searchInActivityList', () => {
    it('finds activity in list', () => {
      const task1 = { id: 'task-1', type: 'task', name: 'Task 1', task: {} } as unknown as Activity
      const task2 = { id: 'task-2', type: 'task', name: 'Task 2', task: {} } as unknown as Activity
      expect(ActivityTraversal.searchInActivityList([task1, task2], 'task-2')).toEqual(task2)
    })

    it('returns null when activity not in list', () => {
      const task1 = { id: 'task-1', type: 'task', name: 'Task 1', task: {} } as unknown as Activity
      expect(ActivityTraversal.searchInActivityList([task1], 'nonexistent')).toBeNull()
    })

    it('returns null for empty list', () => {
      expect(ActivityTraversal.searchInActivityList([], 'any-id')).toBeNull()
    })
  })

  describe('collectAllActivityIds', () => {
    it('collects ID from single activity', () => {
      const task = { id: 'task-1', type: 'task', name: 'Task', task: {} } as unknown as Activity
      expect(ActivityTraversal.collectAllActivityIds(task)).toEqual(['task-1'])
    })

    it('collects all IDs from sequence', () => {
      const sequence = {
        id: 'seq-1',
        type: 'sequence',
        name: 'Sequence',
        steps: [
          { id: 'task-1', type: 'task', name: 'Task 1', task: {} },
          { id: 'task-2', type: 'task', name: 'Task 2', task: {} },
        ],
      } as unknown as Activity
      expect(ActivityTraversal.collectAllActivityIds(sequence)).toEqual(['seq-1', 'task-1', 'task-2'])
    })

    it('collects all IDs from deeply nested structure', () => {
      const nested = {
        id: 'seq-outer',
        type: 'sequence',
        name: 'Outer',
        steps: [
          {
            id: 'loop-1',
            type: 'loop',
            name: 'Loop',
            loop: {
              over: 'items',
              do: [{ id: 'task-in-loop', type: 'task', name: 'Loop Task', task: {} }],
            },
          },
          { id: 'task-after-loop', type: 'task', name: 'After Loop', task: {} },
        ],
      } as unknown as Activity
      expect(ActivityTraversal.collectAllActivityIds(nested)).toEqual([
        'seq-outer',
        'loop-1',
        'task-in-loop',
        'task-after-loop',
      ])
    })

    it('collects all IDs from condition with both branches', () => {
      const condition = makeCondition({
        id: 'cond-1',
        name: 'Condition',
        condition: 'true',
        then: [{ id: 'then-task', type: 'task', name: 'Then', task: {} }],
        else: [{ id: 'else-task', type: 'task', name: 'Else', task: {} }],
      })
      expect(ActivityTraversal.collectAllActivityIds(condition)).toEqual(['cond-1', 'then-task', 'else-task'])
    })

    it('collects all IDs from approval with both branches', () => {
      const approval = {
        id: 'approval-1',
        type: 'approval',
        name: 'Approval',
        onApproved: [{ id: 'task-approved', type: 'task', name: 'Approved', task: {} }],
        onRejected: [{ id: 'task-rejected', type: 'task', name: 'Rejected', task: {} }],
      } as unknown as Activity
      expect(ActivityTraversal.collectAllActivityIds(approval)).toEqual([
        'approval-1',
        'task-approved',
        'task-rejected',
      ])
    })
  })
})
