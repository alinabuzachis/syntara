import { describe, expect, it } from 'vitest'

import type { Activity, Trigger } from './workflowToGraph'
import { extractTaskActivities, getTriggerLabel, markerEnd } from './workflowToGraph'

describe('workflowToGraph', () => {
  describe('markerEnd', () => {
    it('has expected marker configuration', () => {
      expect(markerEnd).toEqual({
        type: 'arrowclosed',
        width: 12,
        height: 12,
        color: '#6b7280',
      })
    })
  })

  describe('extractTaskActivities', () => {
    it('returns empty array for empty input', () => {
      expect(extractTaskActivities([])).toEqual([])
    })

    it('extracts task activities from flat array', () => {
      const activities = [
        { id: 'task-1', type: 'task', name: 'Task 1', task: {} },
        { id: 'task-2', type: 'task', name: 'Task 2', task: {} },
      ] as unknown as Activity[]
      const tasks = extractTaskActivities(activities)
      expect(tasks).toHaveLength(2)
      expect(tasks[0].id).toBe('task-1')
      expect(tasks[1].id).toBe('task-2')
    })

    it('skips non-task activities', () => {
      const activities = [
        { id: 'trigger-1', type: 'trigger', name: 'Trigger', trigger: { executor: 'manual', config: {} } },
        { id: 'task-1', type: 'task', name: 'Task 1', task: {} },
        { id: 'approval-1', type: 'approval', name: 'Approval' },
      ] as unknown as Activity[]
      const tasks = extractTaskActivities(activities)
      expect(tasks).toHaveLength(1)
      expect(tasks[0].id).toBe('task-1')
    })

    it('extracts tasks from parallel branches', () => {
      const activities = [
        {
          id: 'parallel-1',
          type: 'parallel',
          name: 'Parallel',
          branches: [
            { id: 'task-branch-1', type: 'task', name: 'Branch 1 Task', task: {} },
            { id: 'task-branch-2', type: 'task', name: 'Branch 2 Task', task: {} },
          ],
        },
      ] as unknown as Activity[]
      const tasks = extractTaskActivities(activities)
      expect(tasks).toHaveLength(2)
      expect(tasks.map((t) => t.id)).toEqual(['task-branch-1', 'task-branch-2'])
    })

    it('extracts tasks from sequence steps', () => {
      const activities = [
        {
          id: 'sequence-1',
          type: 'sequence',
          name: 'Sequence',
          steps: [
            { id: 'task-step-1', type: 'task', name: 'Step 1 Task', task: {} },
            { id: 'task-step-2', type: 'task', name: 'Step 2 Task', task: {} },
          ],
        },
      ] as unknown as Activity[]
      const tasks = extractTaskActivities(activities)
      expect(tasks).toHaveLength(2)
      expect(tasks.map((t) => t.id)).toEqual(['task-step-1', 'task-step-2'])
    })

    it('extracts tasks from condition then branch', () => {
      const activities = [
        {
          id: 'condition-1',
          type: 'condition',
          name: 'Condition',
          condition: 'x > 0',
          then: [{ id: 'task-then', type: 'task', name: 'Then Task', task: {} }],
          else: [],
        },
      ] as unknown as Activity[]
      const tasks = extractTaskActivities(activities)
      expect(tasks).toHaveLength(1)
      expect(tasks[0].id).toBe('task-then')
    })

    it('extracts tasks from condition else branch', () => {
      const activities = [
        {
          id: 'condition-1',
          type: 'condition',
          name: 'Condition',
          condition: 'x > 0',
          then: [],
          else: [{ id: 'task-else', type: 'task', name: 'Else Task', task: {} }],
        },
      ] as unknown as Activity[]
      const tasks = extractTaskActivities(activities)
      expect(tasks).toHaveLength(1)
      expect(tasks[0].id).toBe('task-else')
    })

    it('extracts tasks from condition both branches', () => {
      const activities = [
        {
          id: 'condition-1',
          type: 'condition',
          name: 'Condition',
          condition: 'x > 0',
          then: [{ id: 'task-then', type: 'task', name: 'Then Task', task: {} }],
          else: [{ id: 'task-else', type: 'task', name: 'Else Task', task: {} }],
        },
      ] as unknown as Activity[]
      const tasks = extractTaskActivities(activities)
      expect(tasks).toHaveLength(2)
      expect(tasks.map((t) => t.id)).toEqual(['task-then', 'task-else'])
    })

    it('extracts tasks from loop body', () => {
      const activities = [
        {
          id: 'loop-1',
          type: 'loop',
          name: 'Loop',
          loop: {
            over: 'items',
            do: [
              { id: 'task-in-loop', type: 'task', name: 'Loop Task', task: {} },
              { id: 'task-in-loop-2', type: 'task', name: 'Loop Task 2', task: {} },
            ],
          },
        },
      ] as unknown as Activity[]
      const tasks = extractTaskActivities(activities)
      expect(tasks).toHaveLength(2)
      expect(tasks.map((t) => t.id)).toEqual(['task-in-loop', 'task-in-loop-2'])
    })

    it('extracts tasks from deeply nested structures', () => {
      const activities = [
        {
          id: 'parallel-1',
          type: 'parallel',
          name: 'Parallel',
          branches: [
            {
              id: 'condition-in-parallel',
              type: 'condition',
              name: 'Nested Condition',
              condition: 'true',
              then: [
                {
                  id: 'loop-in-condition',
                  type: 'loop',
                  name: 'Nested Loop',
                  loop: {
                    over: 'items',
                    do: [{ id: 'deeply-nested-task', type: 'task', name: 'Deep Task', task: {} }],
                  },
                },
              ],
              else: [],
            },
            { id: 'task-in-parallel', type: 'task', name: 'Parallel Task', task: {} },
          ],
        },
      ] as unknown as Activity[]
      const tasks = extractTaskActivities(activities)
      expect(tasks).toHaveLength(2)
      expect(tasks.map((t) => t.id)).toEqual(['deeply-nested-task', 'task-in-parallel'])
    })

    it('handles parallel without branches', () => {
      const activities: Activity[] = [
        {
          id: 'parallel-empty',
          type: 'parallel',
          name: 'Empty Parallel',
        } as Activity,
      ]
      const tasks = extractTaskActivities(activities)
      expect(tasks).toHaveLength(0)
    })

    it('handles sequence without steps', () => {
      const activities: Activity[] = [
        {
          id: 'sequence-empty',
          type: 'sequence',
          name: 'Empty Sequence',
        } as Activity,
      ]
      const tasks = extractTaskActivities(activities)
      expect(tasks).toHaveLength(0)
    })
  })

  describe('getTriggerLabel', () => {
    it('returns "Manual" for manual trigger without approval', () => {
      const trigger: Trigger = {
        type: 'manual',
        requiresApproval: false,
      }
      expect(getTriggerLabel(trigger)).toBe('Trigger (Manual)')
    })

    it('returns "Manual - Requires Approval" for manual trigger with approval', () => {
      const trigger: Trigger = {
        type: 'manual',
        requiresApproval: true,
      }
      expect(getTriggerLabel(trigger)).toBe('Trigger (Manual - Requires Approval)')
    })

    it('uses trigger name when provided', () => {
      const trigger: Trigger = {
        type: 'manual',
        name: 'Start Workflow',
        requiresApproval: false,
      }
      expect(getTriggerLabel(trigger)).toBe('Start Workflow (Manual)')
    })

    it('handles cron scheduled trigger', () => {
      const trigger: Trigger = {
        type: 'scheduled',
        schedule: {
          scheduleType: 'cron',
          cron: '0 9 * * *',
        },
      }
      expect(getTriggerLabel(trigger)).toBe('Trigger (Cron: 0 9 * * *)')
    })

    it('handles interval scheduled trigger', () => {
      const trigger: Trigger = {
        type: 'scheduled',
        schedule: {
          scheduleType: 'interval',
          interval: '1h',
        },
      }
      expect(getTriggerLabel(trigger)).toBe('Trigger (Interval: 1h)')
    })

    it('handles continuous scheduled trigger', () => {
      const trigger: Trigger = {
        type: 'scheduled',
        schedule: {
          scheduleType: 'continuous',
          continuous: true,
        },
      }
      expect(getTriggerLabel(trigger)).toBe('Trigger (Continuous)')
    })

    it('handles event trigger', () => {
      const trigger: Trigger = {
        type: 'event',
        event: {
          source: 'github',
          eventType: 'push',
        },
      }
      expect(getTriggerLabel(trigger)).toBe('Trigger (Event: github/push)')
    })

    it('handles event trigger with custom name', () => {
      const trigger: Trigger = {
        type: 'event',
        name: 'GitHub Push',
        event: {
          source: 'github',
          eventType: 'push',
        },
      }
      expect(getTriggerLabel(trigger)).toBe('GitHub Push (Event: github/push)')
    })

    it('returns just the name for unknown trigger type', () => {
      const trigger = {
        type: 'unknown' as 'manual',
        name: 'Custom Trigger',
      } as Trigger
      expect(getTriggerLabel(trigger)).toBe('Custom Trigger')
    })

    it('trims whitespace from trigger name', () => {
      const trigger: Trigger = {
        type: 'manual',
        name: '  Trimmed Name  ',
        requiresApproval: false,
      }
      expect(getTriggerLabel(trigger)).toBe('Trimmed Name (Manual)')
    })

    it('falls back to "Trigger" when name is empty', () => {
      const trigger: Trigger = {
        type: 'manual',
        name: '   ',
        requiresApproval: false,
      }
      expect(getTriggerLabel(trigger)).toBe('Trigger (Manual)')
    })
  })
})
