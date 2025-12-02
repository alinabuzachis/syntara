import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { MarkerType } from '@xyflow/react'

// Type aliases from API contracts
export type Trigger =
  | WorkflowAPI.components['schemas']['manualTrigger']
  | WorkflowAPI.components['schemas']['scheduledTrigger']
  | WorkflowAPI.components['schemas']['eventTrigger']

export type Activity = WorkflowAPI.components['schemas']['activity']
export type TaskActivity = Extract<Activity, { type: 'task' }>
export type ConditionActivity = Extract<Activity, { type: 'condition' }>
export type SequenceActivity = Extract<Activity, { type: 'sequence' }>
export type ParallelActivity = Extract<Activity, { type: 'parallel' }>
export type LoopActivity = Extract<Activity, { type: 'loop' }>
export type JoinActivity = Extract<Activity, { type: 'join' }>

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
  switch (trigger.type) {
    case 'manual':
      return trigger.requiresApproval ? 'Manual (Requires Approval)' : 'Manual'
    case 'scheduled':
      if (trigger.schedule.scheduleType === 'cron') {
        return `Scheduled (Cron: ${trigger.schedule.cron})`
      } else if (trigger.schedule.scheduleType === 'interval') {
        return `Scheduled (Interval: ${trigger.schedule.interval})`
      } else {
        return 'Scheduled (Continuous)'
      }
    case 'event':
      return `Event (${trigger.event.source}: ${trigger.event.eventType})`
    default:
      return 'Unknown Trigger'
  }
}
