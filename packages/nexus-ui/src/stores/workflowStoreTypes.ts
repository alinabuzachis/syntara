import type { WorkflowAPI } from '@ansible/nexus-contracts'

import type { EdgeConnection } from '../routes/builder/types/edge'

// Type aliases from API contracts
export type WorkflowDefinitionBase = WorkflowAPI.components['schemas']['workflow-definition.schema']
export type ManualTrigger = WorkflowAPI.components['schemas']['manualTrigger']

// Custom trigger types (not yet in API schema but used in the codebase)
export type ScheduledTrigger = {
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
}

export type EventTrigger = {
  type: 'event'
  event: {
    source: string
    eventType: string
    filter?: Record<string, unknown>
  }
}

export type Trigger = ManualTrigger | ScheduledTrigger | EventTrigger

// Extended workflow definition that supports all trigger types
export type WorkflowDefinition = Omit<WorkflowDefinitionBase, 'triggers'> & {
  triggers?: Trigger[]
}

export type Activity = WorkflowAPI.components['schemas']['activity']
export type TaskActivity = Extract<Activity, { type: 'task' }>

export interface WorkflowStore {
  currentWorkflow: WorkflowDefinition | null
  workflowVersion: number // Incremented only when setWorkflow is called
  edges: EdgeConnection[]
  isDirty: boolean // Tracks whether changes have been made since last save/load
  setWorkflow: (workflow: WorkflowDefinition | null) => void
  // Atomic operation to load workflow and edges together - prevents race conditions
  loadWorkflowWithEdges: (workflow: WorkflowDefinition, edges: EdgeConnection[]) => void
  markClean: () => void // Called after successful save
  markDirty: () => void // Called when metadata changes
  /**
   * Update the current workflow without incrementing workflowVersion.
   *
   * Use this for incremental updates to an already-loaded workflow (e.g. applying
   * externally computed changes) where consumers should react to the changed
   * workflow content, but the workflow "identity" has not changed.
   */
  updateWorkflow: (updater: (workflow: WorkflowDefinition) => WorkflowDefinition) => void
  setEdges: (edges: EdgeConnection[]) => void
  addTrigger: (trigger: Trigger) => void
  removeTrigger: (index: number) => void
  updateTrigger: (index: number, trigger: Trigger) => void
  addActivity: (activity: Activity) => void
  removeActivity: (activityId: string) => void
  updateActivity: (activityId: string, updates: Partial<Activity>) => void
  /**
   * Fully replace an activity in the list, discarding all type-specific fields
   * from the old activity. Unlike `updateActivity`, this does NOT merge — the
   * replacement activity is inserted as-is (with `id` overridden to the target ID).
   */
  replaceActivity: (activityId: string, newActivity: Activity) => void
  /**
   * Deep-clone an activity, assign it a new ID, derive a unique "Copy of…"
   * name, and append it to the flat activities list.
   *
   * @returns The new activity's ID, or null when the source activity is not found.
   */
  duplicateActivity: (activityId: string) => string | null
  syncConvergeNodeBranches: () => void
  moveActivityBefore: (activityId: string, beforeActivityId: string) => void
  moveActivityAfter: (activityId: string, afterActivityId: string) => void
  reorderActivitiesFromEdges: () => void
  // Atomic batch update to prevent race conditions
  batchRemoveNodesAndEdges: (params: { nodeIds: string[]; edges: EdgeConnection[]; triggerIndices?: number[] }) => void
  batchAddActivitiesAndEdges: (params: { activities: Activity[]; edges: EdgeConnection[] }) => void
}
