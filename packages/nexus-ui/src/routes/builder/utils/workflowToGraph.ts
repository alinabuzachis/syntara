import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { MarkerType } from '@xyflow/react'

import type { NodeType } from '../../automations/canvas/nodes/NodeType'

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
 * Checks if workflow has any non-parallel nested activity types (sequence, loop).
 * Condition nodes with empty then/else arrays are flat (edges define flow).
 * Parallels created by syncJoinBranches are structural containers, not legacy constructs.
 * Returns true if the workflow uses legacy nested activity patterns.
 */
export function hasLegacyNestedActivities(activities: Activity[], hasStoredEdges = false): boolean {
  for (const activity of activities) {
    if (activity.type === 'sequence' || activity.type === 'loop') {
      return true
    }
    // Check if condition has nested activities (legacy format)
    // In modern workflows, all activities are flat during editing. Nested structures only exist
    // during save/serialization (buildNestedConditionStructure). So if we see nested conditions
    // without stored edges, it's a legacy workflow.
    if (activity.type === 'condition') {
      const hasNestedActivities =
        (activity.then && activity.then.length > 0) || (activity.else && activity.else.length > 0)
      if (hasNestedActivities && !hasStoredEdges) return true
    }
    // Check if parallel was user-created (not auto-generated for joins)
    if (activity.type === 'parallel' && !activity.id.startsWith('parallel_for_')) {
      return true
    }
    // Recursively check nested structures
    if (activity.type === 'parallel' && activity.branches) {
      if (hasLegacyNestedActivities(activity.branches, hasStoredEdges)) return true
    }
    if (activity.type === 'sequence' && activity.steps) {
      if (hasLegacyNestedActivities(activity.steps, hasStoredEdges)) return true
    }
  }
  return false
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

/**
 * Recursively adds an activity and its nested activities to the node/edge graph
 * @returns The ID of the added activity
 */
export function addActivity(
  activity: Activity,
  nodes: NodeType[],
  edges: EdgeType[],
  previousIds: string[],
  sourceHandle?: string
): string {
  switch (activity.type) {
    case 'task':
      return addTaskActivity(activity, nodes, edges, previousIds, sourceHandle)
    case 'condition':
      return addConditionActivity(activity, nodes, edges, previousIds, sourceHandle)
    case 'sequence':
      return addSequenceActivity(activity, nodes, edges, previousIds, sourceHandle)
    case 'parallel':
      return addParallelActivity(activity, nodes, edges, previousIds, sourceHandle)
    case 'loop':
      return addLoopActivity(activity, nodes, edges, previousIds)
    case 'join':
      return addJoinActivity(activity, nodes, edges, previousIds, sourceHandle)
  }
}

/**
 * Adds a task activity node to the graph
 */
function addTaskActivity(
  taskActivity: TaskActivity,
  nodes: NodeType[],
  edges: EdgeType[],
  previousIds: string[],
  sourceHandle?: string
) {
  nodes.push({
    id: taskActivity.id,
    type: 'task',
    position: { x: 0, y: 0 },
    data: taskActivity,
  })
  for (const id of previousIds) {
    edges.push({
      id: `${id}-${taskActivity.id}`,
      type: 'default',
      source: id,
      target: taskActivity.id,
      sourceHandle,
    })
  }
  previousIds.length = 0
  previousIds.push(taskActivity.id)
  return taskActivity.id
}

/**
 * Adds a condition activity node with its then/else branches to the graph
 */
function addConditionActivity(
  conditionActivity: ConditionActivity,
  nodes: NodeType[],
  edges: EdgeType[],
  previousIds: string[],
  sourceHandle?: string
) {
  nodes.push({
    id: conditionActivity.id,
    type: 'condition',
    position: { x: 0, y: 0 },
    data: conditionActivity,
  })
  for (const id of previousIds) {
    edges.push({
      id: `${id}-${conditionActivity.id}`,
      type: 'default',
      source: id,
      target: conditionActivity.id,
      sourceHandle,
    })
  }

  previousIds = [conditionActivity.id]
  for (const branch of conditionActivity.then ?? []) {
    for (const id of previousIds) {
      edges.push({
        id: `${id}-${branch.id}-true`,
        type: 'default',
        source: id,
        target: branch.id,
        sourceHandle: id === conditionActivity.id ? 'true' : 'source',
      })
    }
    addActivity(branch, nodes, edges, previousIds, 'true')
  }

  previousIds = [conditionActivity.id]
  for (const branch of conditionActivity.else ?? []) {
    for (const id of previousIds) {
      edges.push({
        id: `${id}-${branch.id}-false`,
        type: 'default',
        source: id,
        target: branch.id,
        sourceHandle: id === conditionActivity.id ? 'false' : 'source',
      })
    }
    addActivity(branch, nodes, edges, previousIds, 'false')
  }

  return conditionActivity.id
}

/**
 * Adds a sequence activity and its steps to the graph
 */
function addSequenceActivity(
  sequenceActivity: SequenceActivity,
  nodes: NodeType[],
  edges: EdgeType[],
  previousIds: string[],
  sourceHandle?: string
) {
  let seqPreviousIds = [...previousIds]
  for (const step of sequenceActivity.steps ?? []) {
    const added = addActivity(step, nodes, edges, seqPreviousIds, sourceHandle)
    if (added) {
      seqPreviousIds = [step.id]
    }
  }
  return sequenceActivity.id
}

/**
 * Adds a parallel activity and its branches to the graph
 */
function addParallelActivity(
  parallelActivity: ParallelActivity,
  nodes: NodeType[],
  edges: EdgeType[],
  previousIds: string[],
  sourceHandle?: string
) {
  const ids: string[] = []
  for (const branch of parallelActivity.branches ?? []) {
    ids.push(addActivity(branch, nodes, edges, [...previousIds], sourceHandle))
  }

  previousIds.length = 0
  previousIds.push(...ids)

  return parallelActivity.id
}

/**
 * Adds a loop activity and its body to the graph
 */
function addLoopActivity(loopActivity: LoopActivity, nodes: NodeType[], edges: EdgeType[], previousIds: string[]) {
  nodes.push({
    id: loopActivity.id,
    type: 'loop',
    position: { x: 0, y: 0 },
    data: loopActivity,
  })
  for (const id of previousIds) {
    edges.push({
      id: `${id}-${loopActivity.id}`,
      type: 'default',
      source: id,
      target: loopActivity.id,
      targetHandle: 'target',
    })
  }

  let lastId: string = loopActivity.id

  for (const step of loopActivity.loop.do ?? []) {
    const id = addActivity(step, nodes, edges, [lastId], 'start')
    lastId = id
  }

  edges.push({
    id: `${lastId}-${loopActivity.id}`,
    type: 'default',
    source: lastId,
    target: loopActivity.id,
    targetHandle: 'end',
  })

  previousIds.length = 0
  previousIds.push(loopActivity.id)

  return loopActivity.id
}

/**
 * Adds a join activity node to the graph
 */
function addJoinActivity(
  joinActivity: JoinActivity,
  nodes: NodeType[],
  edges: EdgeType[],
  previousIds: string[],
  sourceHandle?: string
) {
  nodes.push({
    id: joinActivity.id,
    type: 'join',
    position: { x: 0, y: 0 },
    data: joinActivity,
  })
  for (const id of previousIds) {
    edges.push({
      id: `${id}-${joinActivity.id}`,
      type: 'default',
      source: id,
      target: joinActivity.id,
      sourceHandle,
    })
  }

  previousIds.length = 0
  previousIds.push(joinActivity.id)

  return joinActivity.id
}
