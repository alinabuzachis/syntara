import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { create } from 'zustand'

import type { EdgeConnection } from '../routes/builder/types/edge'

// Type aliases from API contracts
type WorkflowDefinitionBase = WorkflowAPI.components['schemas']['workflow-definition.schema']
type ManualTrigger = WorkflowAPI.components['schemas']['manualTrigger']

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
}

type EventTrigger = {
  type: 'event'
  event: {
    source: string
    eventType: string
    filter?: Record<string, unknown>
  }
}

type Trigger = ManualTrigger | ScheduledTrigger | EventTrigger

// Extended workflow definition that supports all trigger types
type WorkflowDefinition = Omit<WorkflowDefinitionBase, 'triggers'> & {
  triggers?: Trigger[]
}

type Activity = WorkflowAPI.components['schemas']['activity']
type TaskActivity = Extract<Activity, { type: 'task' }>

interface WorkflowStore {
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
  syncConvergeNodeBranches: () => void
  moveActivityBefore: (activityId: string, beforeActivityId: string) => void
  moveActivityAfter: (activityId: string, afterActivityId: string) => void
  reorderActivitiesFromEdges: () => void
  // Atomic batch update to prevent race conditions
  batchRemoveNodesAndEdges: (params: { nodeIds: string[]; edges: EdgeConnection[]; triggerIndices?: number[] }) => void
  batchAddActivitiesAndEdges: (params: { activities: Activity[]; edges: EdgeConnection[] }) => void
}

// ============================================================================
// Utility functions for recursive activity traversal
// ============================================================================

/**
 * Recursively find an activity by ID in a list of activities
 */
function findActivityById(activities: Activity[], targetId: string): Activity | null {
  for (const activity of activities) {
    if (activity.id === targetId) {
      return activity
    }
    if (activity.type === 'parallel' && activity.branches) {
      for (const branch of activity.branches) {
        const found = findActivityById([branch], targetId)
        if (found) return found
      }
    } else if (activity.type === 'sequence' && activity.steps) {
      const found = findActivityById(activity.steps, targetId)
      if (found) return found
    } else if (activity.type === 'condition') {
      if (activity.then) {
        const found = findActivityById(activity.then, targetId)
        if (found) return found
      }
      if (activity.else) {
        const found = findActivityById(activity.else, targetId)
        if (found) return found
      }
    } else if (activity.type === 'loop' && activity.loop.do) {
      const found = findActivityById(activity.loop.do, targetId)
      if (found) return found
    }
  }
  return null
}

/**
 * Recursively remove an activity from a list, cleaning up parent structures
 */
function removeActivityFromList(activities: Activity[], activityId: string): Activity[] {
  const filtered: Activity[] = []

  for (const activity of activities) {
    // Skip the activity we're removing
    if (activity.id === activityId) {
      continue
    }

    // For other activities, recursively check nested structures
    if (activity.type === 'parallel') {
      const updatedBranches = activity.branches
        ?.map((branch) => removeActivityFromList([branch], activityId)[0])
        .filter((branch): branch is Activity => branch !== undefined)

      // If parallel has less than 2 branches, it's invalid - skip or promote
      if (!updatedBranches || updatedBranches.length < 2) {
        if (updatedBranches?.length === 1) {
          filtered.push(updatedBranches[0])
        }
        continue
      }

      filtered.push({
        ...activity,
        branches: updatedBranches,
      })
    } else if (activity.type === 'sequence') {
      const updatedSteps = activity.steps ? removeActivityFromList(activity.steps, activityId) : []

      // If sequence has no steps, skip it. If only one step, promote it
      if (updatedSteps.length === 0) {
        continue
      }
      if (updatedSteps.length === 1) {
        filtered.push(updatedSteps[0])
        continue
      }

      filtered.push({
        ...activity,
        steps: updatedSteps,
      })
    } else if (activity.type === 'condition') {
      const updatedThen = activity.then ? removeActivityFromList(activity.then, activityId) : []
      const updatedElse = activity.else ? removeActivityFromList(activity.else, activityId) : undefined

      filtered.push({
        ...activity,
        then: updatedThen,
        else: updatedElse,
      })
    } else if (activity.type === 'loop') {
      const updatedDo = activity.loop.do ? removeActivityFromList(activity.loop.do, activityId) : []

      // IMPORTANT: Keep loop nodes even with empty do arrays
      // During editing, loop structure is defined by edges, not nested do array
      // The do array is only populated when saving to API format
      filtered.push({
        ...activity,
        loop: {
          ...activity.loop,
          do: updatedDo,
        },
      })
    } else {
      // For task, join, and other activities, just keep them
      filtered.push(activity)
    }
  }

  return filtered
}

/**
 * Recursively update an activity in a list
 */
function updateActivityInList(activities: Activity[], activityId: string, updates: Partial<Activity>): Activity[] {
  return activities.map((activity) => {
    // If this is the activity we're looking for, update it
    if (activity.id === activityId) {
      return { ...activity, ...updates } as Activity
    }

    // Otherwise, recursively search nested structures
    if (activity.type === 'parallel') {
      return {
        ...activity,
        branches: activity.branches ? updateActivityInList(activity.branches, activityId, updates) : activity.branches,
      }
    } else if (activity.type === 'sequence') {
      return {
        ...activity,
        steps: activity.steps ? updateActivityInList(activity.steps, activityId, updates) : activity.steps,
      }
    } else if (activity.type === 'condition') {
      return {
        ...activity,
        then: activity.then ? updateActivityInList(activity.then, activityId, updates) : activity.then,
        else: activity.else ? updateActivityInList(activity.else, activityId, updates) : activity.else,
      }
    } else if (activity.type === 'loop') {
      return {
        ...activity,
        loop: {
          ...activity.loop,
          do: activity.loop.do ? updateActivityInList(activity.loop.do, activityId, updates) : activity.loop.do,
        },
      }
    }

    return activity
  })
}

// ============================================================================
// Helper functions for syncConvergeNodeBranches
// ============================================================================
// (No helper functions needed - simplified implementation)

// ============================================================================
// Zustand Store
// ============================================================================

export const useWorkflowStore = create<WorkflowStore>((set) => ({
  currentWorkflow: null,
  workflowVersion: 0,
  edges: [],
  isDirty: false,

  setWorkflow: (workflow) => {
    set((state) => ({
      currentWorkflow: workflow,
      workflowVersion: state.workflowVersion + 1,
      isDirty: false, // Reset dirty flag when loading a new workflow
    }))
  },

  // Atomic operation to set both workflow and edges in a single update
  // This prevents race conditions where BuilderFlow renders with workflow but no edges
  loadWorkflowWithEdges: (workflow, edges) => {
    set((state) => ({
      currentWorkflow: workflow,
      workflowVersion: state.workflowVersion + 1,
      edges,
      isDirty: false,
    }))
  },

  markClean: () => {
    set({ isDirty: false })
  },

  markDirty: () => {
    set({ isDirty: true })
  },

  updateWorkflow: (updater) => {
    set((state) => {
      if (!state.currentWorkflow) return state
      return {
        currentWorkflow: updater(state.currentWorkflow),
        isDirty: true,
      }
    })
  },

  setEdges: (edges) => {
    set({ edges, isDirty: true })
  },

  addTrigger: (trigger) => {
    set((state) => {
      if (!state.currentWorkflow) return state

      const triggers = state.currentWorkflow.triggers || []
      return {
        currentWorkflow: {
          ...state.currentWorkflow,
          triggers: [...triggers, trigger],
        },
        isDirty: true,
      }
    })
  },

  removeTrigger: (index) => {
    set((state) => {
      if (!state.currentWorkflow?.triggers) return state

      const triggers = [...state.currentWorkflow.triggers]
      triggers.splice(index, 1)
      return {
        currentWorkflow: {
          ...state.currentWorkflow,
          triggers,
        },
        isDirty: true,
      }
    })
  },

  updateTrigger: (index, trigger) => {
    set((state) => {
      if (!state.currentWorkflow?.triggers) return state

      const triggers = [...state.currentWorkflow.triggers]
      triggers[index] = trigger
      return {
        currentWorkflow: {
          ...state.currentWorkflow,
          triggers,
        },
        isDirty: true,
      }
    })
  },

  addActivity: (activity) => {
    set((state) => {
      if (!state.currentWorkflow) return state

      return {
        currentWorkflow: {
          ...state.currentWorkflow,
          workflow: {
            ...state.currentWorkflow.workflow,
            activities: [...state.currentWorkflow.workflow.activities, activity],
          },
        },
        isDirty: true,
      }
    })
  },

  removeActivity: (activityId) => {
    set((state) => {
      if (!state.currentWorkflow) return state

      let activities = [...state.currentWorkflow.workflow.activities]

      // Check if we're removing a converge activity
      const activityToRemove = findActivityById(activities, activityId)
      if (activityToRemove?.type === 'converge') {
        // Find and cleanup the associated parallel container
        const parallelId = `parallel_for_${activityId}`
        const parallelIndex = activities.findIndex((a) => a.id === parallelId)

        if (parallelIndex !== -1) {
          const parallelActivity = activities[parallelIndex] as Extract<Activity, { type: 'parallel' }>

          // Extract all activities from the parallel's branches
          const branchActivities = parallelActivity.branches || []

          // Remove the parallel activity
          activities = activities.filter((a) => a.id !== parallelId)

          // Add the branch activities back to main activities array (before where the converge was)
          if (branchActivities.length > 0) {
            const activityIndex = activities.findIndex((a) => a.id === activityId)
            if (activityIndex !== -1) {
              activities.splice(activityIndex, 0, ...branchActivities)
            } else {
              activities.push(...branchActivities)
            }
          }
        }
      }

      // Now remove the activity itself
      activities = removeActivityFromList(activities, activityId)

      return {
        currentWorkflow: {
          ...state.currentWorkflow,
          workflow: {
            ...state.currentWorkflow.workflow,
            activities,
          },
        },
        isDirty: true,
      }
    })
  },

  updateActivity: (activityId, updates) => {
    set((state) => {
      if (!state.currentWorkflow) return state

      return {
        currentWorkflow: {
          ...state.currentWorkflow,
          workflow: {
            ...state.currentWorkflow.workflow,
            activities: updateActivityInList(state.currentWorkflow.workflow.activities, activityId, updates),
          },
        },
        isDirty: true,
      }
    })
  },

  syncConvergeNodeBranches: () => {
    set((state) => {
      if (!state.currentWorkflow) return state

      const activities = [...state.currentWorkflow.workflow.activities]
      const convergeActivities = activities.filter((a) => a.type === 'converge')

      for (const convergeActivity of convergeActivities) {
        // Find all edges that target this converge activity
        const incomingEdges = state.edges.filter((edge) => edge.target === convergeActivity.id)
        const sourceActivityIds = incomingEdges.map((edge) => edge.source)

        // Update converge.branches directly from incoming edges
        const convergeIndex = activities.findIndex((a) => a.id === convergeActivity.id)
        if (convergeIndex !== -1) {
          const existing = convergeActivity as Extract<Activity, { type: 'converge' }>
          activities[convergeIndex] = {
            ...existing,
            converge: {
              ...existing.converge,
              branches: sourceActivityIds,
            },
          }
        }
      }

      return {
        currentWorkflow: {
          ...state.currentWorkflow,
          workflow: {
            ...state.currentWorkflow.workflow,
            activities,
          },
        },
        isDirty: true,
      }
    })
  },

  moveActivityBefore: (activityId: string, beforeActivityId: string) => {
    set((state) => {
      if (!state.currentWorkflow) return state

      const activities = [...state.currentWorkflow.workflow.activities]

      // Find the activity to move and the target position
      const activityIndex = activities.findIndex((a) => a.id === activityId)
      const beforeIndex = activities.findIndex((a) => a.id === beforeActivityId)

      // If either not found, or if already in correct order, return unchanged
      if (activityIndex === -1 || beforeIndex === -1) return state
      if (activityIndex < beforeIndex) return state // Already before

      // Remove the activity from its current position
      const [activity] = activities.splice(activityIndex, 1)

      // Find the new position (might have changed after removal)
      const newBeforeIndex = activities.findIndex((a) => a.id === beforeActivityId)

      // Insert before the target
      activities.splice(newBeforeIndex, 0, activity)

      return {
        currentWorkflow: {
          ...state.currentWorkflow,
          workflow: {
            ...state.currentWorkflow.workflow,
            activities,
          },
        },
        isDirty: true,
      }
    })
  },

  moveActivityAfter: (activityId: string, afterActivityId: string) => {
    set((state) => {
      if (!state.currentWorkflow) return state

      const activities = [...state.currentWorkflow.workflow.activities]

      // Find the activity to move and the target position
      const activityIndex = activities.findIndex((a) => a.id === activityId)
      const afterIndex = activities.findIndex((a) => a.id === afterActivityId)

      // If either not found, or if already in correct order, return unchanged
      if (activityIndex === -1 || afterIndex === -1) return state
      if (activityIndex === afterIndex + 1) return state // Already right after

      // Remove the activity from its current position
      const [activity] = activities.splice(activityIndex, 1)

      // Find the new position (might have changed after removal)
      const newAfterIndex = activities.findIndex((a) => a.id === afterActivityId)

      // Insert after the target
      activities.splice(newAfterIndex + 1, 0, activity)

      return {
        currentWorkflow: {
          ...state.currentWorkflow,
          workflow: {
            ...state.currentWorkflow.workflow,
            activities,
          },
        },
        isDirty: true,
      }
    })
  },

  reorderActivitiesFromEdges: () => {
    set((state) => {
      if (!state.currentWorkflow) return state

      const activities = [...state.currentWorkflow.workflow.activities]
      const edges = state.edges

      // Only get top-level activity IDs (not nested ones in parallel/sequence/condition/loop)
      const topLevelActivityIds = new Set(activities.map((a) => a.id))

      // Build a map of nested activity ID -> top-level parent activity ID
      const activityToParentMap = new Map<string, string>()
      activities.forEach((activity) => {
        if (activity.type === 'parallel' && activity.branches) {
          activity.branches.forEach((branch) => {
            activityToParentMap.set(branch.id, activity.id)
          })
        } else if (activity.type === 'sequence' && activity.steps) {
          activity.steps.forEach((step) => {
            activityToParentMap.set(step.id, activity.id)
          })
        } else if (activity.type === 'condition') {
          if (activity.then) {
            activity.then.forEach((step) => {
              activityToParentMap.set(step.id, activity.id)
            })
          }
          if (activity.else) {
            activity.else.forEach((step) => {
              activityToParentMap.set(step.id, activity.id)
            })
          }
        } else if (activity.type === 'loop' && activity.loop.do) {
          activity.loop.do.forEach((step) => {
            activityToParentMap.set(step.id, activity.id)
          })
        }
      })

      // Build adjacency list and in-degree map from edges
      const adjacencyList = new Map<string, string[]>()
      const inDegree = new Map<string, number>()

      // Initialize all top-level activity nodes
      topLevelActivityIds.forEach((id) => {
        adjacencyList.set(id, [])
        inDegree.set(id, 0)
      })

      // Build graph from edges - map nested activities to their top-level parents
      // Only consider sequential edges (not structural edges like loop bodies or condition branches)
      edges.forEach((edge) => {
        // Skip non-sequential edges:
        // - Loop body edges (sourceHandle='loop')
        // - Condition branch edges (sourceHandle='true'/'false')
        // - Approval branch edges (sourceHandle='approved'/'rejected')
        // - Loop-back edges (targetHandle='end')
        const isBranchEdge =
          edge.sourceHandle === 'loop' ||
          edge.sourceHandle === 'true' ||
          edge.sourceHandle === 'false' ||
          edge.sourceHandle === 'approved' ||
          edge.sourceHandle === 'rejected'
        const isLoopBackEdge = edge.targetHandle === 'end'
        const isSequentialEdge = !isBranchEdge && !isLoopBackEdge

        if (!isSequentialEdge) {
          return
        }

        // Map source and target to top-level activities (or keep as-is if already top-level)
        const mappedSource = activityToParentMap.get(edge.source) || edge.source
        const mappedTarget = activityToParentMap.get(edge.target) || edge.target

        // Only add edge if both source and target are top-level activities and they're different
        if (
          topLevelActivityIds.has(mappedSource) &&
          topLevelActivityIds.has(mappedTarget) &&
          mappedSource !== mappedTarget
        ) {
          const neighbors = adjacencyList.get(mappedSource) || []
          // Avoid duplicate edges
          if (!neighbors.includes(mappedTarget)) {
            neighbors.push(mappedTarget)
            adjacencyList.set(mappedSource, neighbors)
            inDegree.set(mappedTarget, (inDegree.get(mappedTarget) || 0) + 1)
          }
        }
      })

      // Perform topological sort using Kahn's algorithm
      const queue: string[] = []
      const sortedIds: string[] = []

      // Start with nodes that have no incoming edges
      inDegree.forEach((degree, id) => {
        if (degree === 0) {
          queue.push(id)
        }
      })

      // Process nodes in topological order
      while (queue.length > 0) {
        // Sort queue to ensure deterministic ordering when there are multiple valid orders
        queue.sort()
        const current = queue.shift()!
        sortedIds.push(current)

        const neighbors = adjacencyList.get(current) || []
        neighbors.forEach((neighbor) => {
          const newDegree = (inDegree.get(neighbor) || 0) - 1
          inDegree.set(neighbor, newDegree)
          if (newDegree === 0) {
            queue.push(neighbor)
          }
        })
      }

      // If sortedIds doesn't contain all top-level activities, add remaining ones
      const sortedIdsSet = new Set(sortedIds)
      const remainingActivities = activities.filter((a) => !sortedIdsSet.has(a.id))

      // Rebuild activities array in topological order - only reordering top-level activities
      const reorderedActivities: Activity[] = []

      sortedIds.forEach((id) => {
        const activity = activities.find((a) => a.id === id)
        if (activity) {
          reorderedActivities.push(activity)
        }
      })

      // Add any remaining top-level activities that weren't in the sorted list
      // IMPORTANT: Always preserve all nodes even if they have no connections yet
      remainingActivities.forEach((activity) => {
        reorderedActivities.push(activity)
      })

      // Safety check: Ensure ALL activities from the input are present in the output
      // This prevents any activities from being accidentally removed
      activities.forEach((activity) => {
        if (!reorderedActivities.some((a) => a.id === activity.id)) {
          reorderedActivities.push(activity)
        }
      })

      return {
        currentWorkflow: {
          ...state.currentWorkflow,
          workflow: {
            ...state.currentWorkflow.workflow,
            activities: reorderedActivities,
          },
        },
        isDirty: true,
      }
    })
  },

  /**
   * Atomic batch operation to remove nodes and update edges simultaneously.
   * This prevents race conditions by updating all related state in a single transaction.
   *
   * Use this instead of calling removeActivity() and setEdges() separately to avoid:
   * - Ghost edges from initialEdges recomputation
   * - Race conditions between multiple async updates
   * - Synchronization issues
   */
  batchRemoveNodesAndEdges: ({ nodeIds, edges, triggerIndices = [] }) => {
    set((state) => {
      if (!state.currentWorkflow) return state

      let activities = [...state.currentWorkflow.workflow.activities]

      // Remove triggers immutably
      const triggerIndicesToRemove = new Set(triggerIndices)
      const triggers = state.currentWorkflow.triggers
        ? state.currentWorkflow.triggers.filter((_, index) => !triggerIndicesToRemove.has(index))
        : []

      // Remove each activity
      nodeIds.forEach((nodeId) => {
        // Check if we're removing a converge activity
        const activityToRemove = findActivityById(activities, nodeId)
        if (activityToRemove?.type === 'converge') {
          // Find and cleanup the associated parallel container
          const parallelId = `parallel_for_${nodeId}`
          const parallelIndex = activities.findIndex((a) => a.id === parallelId)

          if (parallelIndex !== -1) {
            const parallelActivity = activities[parallelIndex] as Extract<Activity, { type: 'parallel' }>
            const branchActivities = parallelActivity.branches || []

            // Remove the parallel activity
            activities = activities.filter((a) => a.id !== parallelId)

            // Add the branch activities back to main activities array
            if (branchActivities.length > 0) {
              const convergeIndex = activities.findIndex((a) => a.id === nodeId)
              if (convergeIndex !== -1) {
                activities.splice(convergeIndex, 0, ...branchActivities)
              } else {
                activities.push(...branchActivities)
              }
            }
          }
        }

        // Remove the activity itself
        activities = removeActivityFromList(activities, nodeId)
      })

      // Update state atomically - all changes in one transaction
      return {
        currentWorkflow: {
          ...state.currentWorkflow,
          triggers: triggers.length > 0 ? triggers : undefined,
          workflow: {
            ...state.currentWorkflow.workflow,
            activities,
          },
        },
        edges,
        isDirty: true,
      }
    })
  },

  /**
   * Atomic batch operation to add activities and update edges simultaneously.
   * This prevents race conditions by updating all related state in a single transaction.
   *
   * Use this instead of calling addActivity() and setEdges() separately to avoid:
   * - Multiple re-renders triggering initialNodes recomputation
   * - Race conditions between multiple async updates
   * - useNodeUpdates running multiple times before positioning can complete
   */
  batchAddActivitiesAndEdges: ({ activities: newActivities, edges }) => {
    set((state) => {
      if (!state.currentWorkflow) return state

      const activities = [...state.currentWorkflow.workflow.activities, ...newActivities]

      // Update state atomically - all changes in one transaction
      return {
        ...state,
        currentWorkflow: {
          ...state.currentWorkflow,
          workflow: {
            ...state.currentWorkflow.workflow,
            activities,
          },
        },
        edges,
        isDirty: true,
      }
    })
  },
}))

// ============================================================================
// Typed Selectors - Use these for optimized component subscriptions
// ============================================================================
// These selectors help prevent unnecessary re-renders by subscribing to
// specific pieces of state rather than the entire store.
//
// Best Practice: Use these selectors instead of inline selectors for:
// 1. Better type inference
// 2. Reusability across components
// 3. Consistent state access patterns
// ============================================================================

/**
 * Selector for the current workflow.
 * Use when you need the entire workflow object.
 */
export const selectCurrentWorkflow = (state: WorkflowStore) => state.currentWorkflow

/**
 * Selector for workflow version.
 * Use to detect when a completely new workflow has been loaded (via setWorkflow).
 * Does NOT change when activities/triggers are modified.
 */
export const selectWorkflowVersion = (state: WorkflowStore) => state.workflowVersion

/**
 * Selector for edges array.
 * Use when working with workflow connections.
 */
export const selectEdges = (state: WorkflowStore) => state.edges

/**
 * Selector for activities array.
 * Use when you need to map over or filter activities.
 */
export const selectActivities = (state: WorkflowStore) => state.currentWorkflow?.workflow.activities

/**
 * Selector for triggers array.
 * Use when you need to map over or filter triggers.
 */
export const selectTriggers = (state: WorkflowStore) => state.currentWorkflow?.triggers

/**
 * Selector for activities count.
 * Use when you only need to know the number of activities (e.g., for conditional rendering).
 */
export const selectActivitiesCount = (state: WorkflowStore) => state.currentWorkflow?.workflow.activities.length ?? 0

/**
 * Selector for triggers count.
 * Use when you only need to know the number of triggers (e.g., for conditional rendering).
 */
export const selectTriggersCount = (state: WorkflowStore) => state.currentWorkflow?.triggers?.length ?? 0

/**
 * Selector for isDirty flag.
 * Use to check if there are unsaved changes.
 */
export const selectIsDirty = (state: WorkflowStore) => state.isDirty

/**
 * Selector for workflow name.
 * Use when you only need the workflow name (e.g., for display in header).
 */
export const selectWorkflowName = (state: WorkflowStore) => state.currentWorkflow?.metadata?.name

/**
 * Selector to check if a workflow is loaded.
 * Use for conditional rendering based on workflow presence.
 */
export const selectHasWorkflow = (state: WorkflowStore) => state.currentWorkflow !== null

// ============================================================================
// Action Accessors - Use these to access actions without subscribing to state
// ============================================================================
// Zustand best practice: When you only need to call actions (not read state),
// use getState() to avoid unnecessary re-renders.
//
// Example:
//   const { addActivity, removeActivity } = useWorkflowStoreActions()
//   // Component won't re-render when workflow changes
// ============================================================================

/**
 * Get all store actions without subscribing to state changes.
 * Use this when you only need to dispatch actions from event handlers.
 *
 * @example
 * const { addActivity, removeActivity } = useWorkflowStoreActions()
 * const handleAdd = () => addActivity(newActivity)
 */
export const useWorkflowStoreActions = () => {
  const state = useWorkflowStore.getState()
  return {
    setWorkflow: state.setWorkflow,
    loadWorkflowWithEdges: state.loadWorkflowWithEdges,
    updateWorkflow: state.updateWorkflow,
    setEdges: state.setEdges,
    markClean: state.markClean,
    markDirty: state.markDirty,
    addTrigger: state.addTrigger,
    removeTrigger: state.removeTrigger,
    updateTrigger: state.updateTrigger,
    addActivity: state.addActivity,
    removeActivity: state.removeActivity,
    updateActivity: state.updateActivity,
    syncConvergeNodeBranches: state.syncConvergeNodeBranches,
    moveActivityBefore: state.moveActivityBefore,
    moveActivityAfter: state.moveActivityAfter,
    reorderActivitiesFromEdges: state.reorderActivitiesFromEdges,
    batchRemoveNodesAndEdges: state.batchRemoveNodesAndEdges,
    batchAddActivitiesAndEdges: state.batchAddActivitiesAndEdges,
  }
}

/**
 * Type for workflow store actions (useful for typing event handlers).
 */
export type WorkflowStoreActions = ReturnType<typeof useWorkflowStoreActions>

// Re-export types for convenience
export type { WorkflowStore, WorkflowDefinition, Trigger, Activity, TaskActivity }

// ============================================================================
// Custom Hooks - Recommended way to access store state
// ============================================================================
// These hooks provide controlled access to specific state slices.
// Prefer using these over direct store access for better encapsulation.
// ============================================================================

/** Hook to get workflow version (changes only when setWorkflow is called) */
export const useWorkflowVersion = () => useWorkflowStore(selectWorkflowVersion)

/** Hook to get the current workflow */
export const useCurrentWorkflow = () => useWorkflowStore(selectCurrentWorkflow)

/** Hook to get edges */
export const useEdges = () => useWorkflowStore(selectEdges)

/** Hook to get activities */
export const useActivities = () => useWorkflowStore(selectActivities)

/** Hook to get triggers */
export const useTriggers = () => useWorkflowStore(selectTriggers)

/** Hook to get activities count */
export const useActivitiesCount = () => useWorkflowStore(selectActivitiesCount)

/** Hook to get triggers count */
export const useTriggersCount = () => useWorkflowStore(selectTriggersCount)

/** Hook to check if there are unsaved changes */
export const useIsDirty = () => useWorkflowStore(selectIsDirty)

/** Hook to get workflow name */
export const useWorkflowName = () => useWorkflowStore(selectWorkflowName)

/** Hook to check if workflow is loaded */
export const useHasWorkflow = () => useWorkflowStore(selectHasWorkflow)

// ============================================================================
// Factory Functions - Re-exported from workflowFactories.ts
// ============================================================================
// These functions are maintained in a separate file for better organization.
// They are re-exported here for backward compatibility.
// ============================================================================
export {
  createManualTrigger,
  createScheduledTrigger,
  createEventTrigger,
  createScriptActivity,
  createApiActivity,
  createConditionActivity,
  createLoopActivity,
  createConvergeActivity,
  createAAPJobTemplateActivity,
  createConnectorActivity,
  createGenericActivity,
  createApprovalActivity,
} from './workflowFactories'
