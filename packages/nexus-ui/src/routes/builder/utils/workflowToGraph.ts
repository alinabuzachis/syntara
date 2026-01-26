import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { MarkerType } from '@xyflow/react'

// Type aliases from API contracts
type ManualTrigger = WorkflowAPI.components['schemas']['manualTrigger'] & { name?: string }

// Custom trigger types (not yet in API schema but used in the codebase)
type ScheduledTrigger = {
  type: 'scheduled'
  schedule:
    | {
        scheduleType: 'cron'
        cron: string
        timezone?: string
      }
    | {
        scheduleType: 'interval'
        interval: string
      }
    | {
        scheduleType: 'continuous'
        continuous: true
      }
  name?: string
}

type EventTrigger = {
  type: 'event'
  event: {
    source: string
    eventType: string
    filter?: Record<string, unknown>
  }
  name?: string
}

export type Trigger = ManualTrigger | ScheduledTrigger | EventTrigger

export type Activity = WorkflowAPI.components['schemas']['activity']
export type TaskActivity = Extract<Activity, { type: 'task' }>

export const markerEnd = {
  type: MarkerType.ArrowClosed,
  width: 12,
  height: 12,
  color: '#6b7280',
}

export type EdgeType = {
  id: string
  type?: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  selectable?: boolean
  data?: {
    onAddNode?: (sourceNodeId: string, targetNodeId: string, edgeId: string) => void
    onButtonClick?: () => void
    isActive?: boolean
    isPending?: boolean
    executionStatus?: 'passed' | 'pending'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any
  }
  markerEnd?: typeof markerEnd
}

/**
 * Recursively extracts all task activities from nested workflow structures.
 * Flattens parallel, sequence, condition, and loop activities to find all tasks.
 */
export function extractTaskActivities(activities: Activity[]): TaskActivity[] {
  const tasks: TaskActivity[] = []
  for (const activity of activities) {
    if (activity.type === 'task') {
      tasks.push(activity)
    } else if (activity.type === 'parallel' && activity.branches) {
      tasks.push(...extractTaskActivities(activity.branches))
    } else if (activity.type === 'sequence' && activity.steps) {
      tasks.push(...extractTaskActivities(activity.steps))
    } else if (activity.type === 'condition') {
      if (activity.then) tasks.push(...extractTaskActivities(activity.then))
      if (activity.else) tasks.push(...extractTaskActivities(activity.else))
    } else if (activity.type === 'loop' && activity.loop.do) {
      tasks.push(...extractTaskActivities(activity.loop.do))
    }
  }
  return tasks
}

/**
 * Generates a human-readable label for a trigger based on its type and configuration
 */
export function getTriggerLabel(trigger: Trigger): string {
  const displayName = trigger.name?.trim() || 'Trigger'
  let details: string | null = null

  switch (trigger.type) {
    case 'manual':
      details = trigger.requiresApproval ? 'Manual - Requires Approval' : 'Manual'
      break
    case 'scheduled':
      if (trigger.schedule.scheduleType === 'cron') {
        details = `Cron: ${trigger.schedule.cron}`
      } else if (trigger.schedule.scheduleType === 'interval') {
        details = `Interval: ${trigger.schedule.interval}`
      } else {
        details = 'Continuous'
      }
      break
    case 'event':
      details = `Event: ${trigger.event.source}/${trigger.event.eventType}`
      break
    default:
      details = null
  }

  return details ? `${displayName} (${details})` : displayName
}
