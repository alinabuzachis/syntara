import type { Activity } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import type { Trigger } from './workflowToGraph'
import { extractTaskActivities, getTriggerDisplayData, markerEnd } from './workflowToGraph'

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

    it('extracts script activities from flat array', () => {
      const activities: Activity[] = [
        { id: 'task-1', type: 'script', name: 'Task 1', config: { language: 'python', code: '' } },
        { id: 'task-2', type: 'script', name: 'Task 2', config: { language: 'python', code: '' } },
      ]
      const tasks = extractTaskActivities(activities)
      expect(tasks).toHaveLength(2)
      expect(tasks[0].id).toBe('task-1')
      expect(tasks[1].id).toBe('task-2')
    })

    it('includes executor and approval activities but skips control flow nodes', () => {
      const activities: Activity[] = [
        { id: 'task-1', type: 'script', name: 'Task 1', config: { language: 'python', code: '' } },
        { id: 'approval-1', type: 'approval', name: 'Approval', config: {} },
        { id: 'cond-1', type: 'condition', name: 'Condition', config: { condition: 'true' } },
        { id: 'loop-1', type: 'loop', name: 'Loop', config: { type: 'for_each', items: '${items}' } },
        { id: 'converge-1', type: 'converge', name: 'Converge', config: { strategy: 'all' } },
      ]
      const tasks = extractTaskActivities(activities)
      // Only script and approval are executor/approval types
      expect(tasks).toHaveLength(2)
      expect(tasks[0].id).toBe('task-1')
      expect(tasks[1].id).toBe('approval-1')
    })

    it('extracts http_request activities', () => {
      const activities: Activity[] = [
        { id: 'http-1', type: 'http_request', name: 'API Call', config: { method: 'GET', url: 'https://example.com' } },
      ]
      const tasks = extractTaskActivities(activities)
      expect(tasks).toHaveLength(1)
      expect(tasks[0].id).toBe('http-1')
    })

    it('extracts agentic activities', () => {
      const activities: Activity[] = [
        { id: 'agentic-1', type: 'agentic', name: 'AI Agent', config: { prompt: 'Do something' } },
      ]
      const tasks = extractTaskActivities(activities)
      expect(tasks).toHaveLength(1)
      expect(tasks[0].id).toBe('agentic-1')
    })

    it('extracts aap_job_template activities', () => {
      const activities: Activity[] = [
        { id: 'aap-1', type: 'aap_job_template', name: 'AAP Job', config: { job_template_id: 42 } },
      ]
      const tasks = extractTaskActivities(activities)
      expect(tasks).toHaveLength(1)
      expect(tasks[0].id).toBe('aap-1')
    })

    it('skips unknown activity types', () => {
      const activities = [{ id: 'unknown-1', type: 'unknown_type', name: 'Unknown', config: {} }] as Activity[]
      const tasks = extractTaskActivities(activities)
      expect(tasks).toHaveLength(0)
    })
  })

  describe('getTriggerDisplayData', () => {
    it('returns separate name and details for manual_trigger', () => {
      const trigger: Trigger = {
        type: 'manual_trigger',
      }
      expect(getTriggerDisplayData(trigger)).toEqual({ name: 'Trigger', details: 'Manual' })
    })

    it('uses trigger name when provided', () => {
      const trigger: Trigger = {
        type: 'manual_trigger',
        name: 'Start Workflow',
      }
      expect(getTriggerDisplayData(trigger)).toEqual({ name: 'Start Workflow', details: 'Manual' })
    })

    it('handles cron scheduled trigger', () => {
      const trigger: Trigger = {
        type: 'scheduled',
        config: {
          schedule_type: 'cron',
          cron: '0 9 * * *',
        },
      }
      expect(getTriggerDisplayData(trigger)).toEqual({ name: 'Trigger', details: 'Cron: 0 9 * * *' })
    })

    it('handles interval scheduled trigger', () => {
      const trigger: Trigger = {
        type: 'scheduled',
        config: {
          schedule_type: 'interval',
          interval: '1h',
        },
      }
      expect(getTriggerDisplayData(trigger)).toEqual({ name: 'Trigger', details: 'Interval: 1h' })
    })

    it('handles continuous scheduled trigger', () => {
      const trigger: Trigger = {
        type: 'scheduled',
        config: {
          schedule_type: 'continuous',
        },
      }
      expect(getTriggerDisplayData(trigger)).toEqual({ name: 'Trigger', details: 'Continuous' })
    })

    it('handles event trigger', () => {
      const trigger: Trigger = {
        type: 'event',
        config: {
          source: 'github',
          event_type: 'push',
        },
      }
      expect(getTriggerDisplayData(trigger)).toEqual({ name: 'Trigger', details: 'Event: github/push' })
    })

    it('handles event trigger with custom name', () => {
      const trigger: Trigger = {
        type: 'event',
        name: 'GitHub Push',
        config: {
          source: 'github',
          event_type: 'push',
        },
      }
      expect(getTriggerDisplayData(trigger)).toEqual({ name: 'GitHub Push', details: 'Event: github/push' })
    })

    it('returns just the name with null details for unknown trigger type', () => {
      const trigger = {
        type: 'unknown' as 'manual_trigger',
        name: 'Custom Trigger',
      } as Trigger
      expect(getTriggerDisplayData(trigger)).toEqual({ name: 'Custom Trigger', details: null })
    })

    it('trims whitespace from trigger name', () => {
      const trigger: Trigger = {
        type: 'manual_trigger',
        name: '  Trimmed Name  ',
      }
      expect(getTriggerDisplayData(trigger)).toEqual({ name: 'Trimmed Name', details: 'Manual' })
    })

    it('falls back to "Trigger" when name is empty', () => {
      const trigger: Trigger = {
        type: 'manual_trigger',
        name: '   ',
      }
      expect(getTriggerDisplayData(trigger)).toEqual({ name: 'Trigger', details: 'Manual' })
    })

    it('handles names with parentheses correctly', () => {
      const trigger: Trigger = {
        type: 'manual_trigger',
        name: 'Hello(World)',
      }
      expect(getTriggerDisplayData(trigger)).toEqual({ name: 'Hello(World)', details: 'Manual' })
    })
  })
})
