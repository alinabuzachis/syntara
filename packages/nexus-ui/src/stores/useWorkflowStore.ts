import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { create } from 'zustand'

import type { EdgeConnection } from '../routes/builder/types/edge'

// Type aliases from API contracts
type WorkflowDefinition = WorkflowAPI.components['schemas']['workflow-definition.schema']
type Trigger =
  | WorkflowAPI.components['schemas']['manualTrigger']
  | WorkflowAPI.components['schemas']['scheduledTrigger']
  | WorkflowAPI.components['schemas']['eventTrigger']
type Activity = WorkflowAPI.components['schemas']['activity']
type TaskActivity = Extract<Activity, { type: 'task' }>

interface WorkflowStore {
  currentWorkflow: WorkflowDefinition | null
  workflowVersion: number // Incremented only when setWorkflow is called
  edges: EdgeConnection[]
  setWorkflow: (workflow: WorkflowDefinition | null) => void
  setEdges: (edges: EdgeConnection[]) => void
  addTrigger: (trigger: Trigger) => void
  removeTrigger: (index: number) => void
  updateTrigger: (index: number, trigger: Trigger) => void
  addActivity: (activity: Activity) => void
  removeActivity: (activityId: string) => void
  updateActivity: (activityId: string, updates: Partial<Activity>) => void
  syncConvergeBranches: () => void
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
// Helper functions for syncConvergeBranches
// ============================================================================

/**
 * Remove a parallel container and restore its branches to the main activities array
 */
function removeParallelAndRestoreBranches(
  activities: Activity[],
  parallelId: string,
  convergeActivityId: string
): Activity[] {
  const parallelIndex = activities.findIndex((a) => a.id === parallelId)
  if (parallelIndex === -1) return activities

  const parallelActivity = activities[parallelIndex] as Extract<Activity, { type: 'parallel' }>
  const parallelBranches = parallelActivity.branches || []

  // Remove the parallel activity
  const result = activities.filter((a) => a.id !== parallelId)

  // Add back the activities that were in the parallel (before the converge)
  if (parallelBranches.length > 0) {
    const convergeIndex = result.findIndex((a) => a.id === convergeActivityId)
    if (convergeIndex !== -1) {
      result.splice(convergeIndex, 0, ...parallelBranches)
    } else {
      result.push(...parallelBranches)
    }
  }

  return result
}

/**
 * Insert activities before a converge activity
 */
function insertActivitiesBeforeConverge(
  activities: Activity[],
  activitiesToInsert: Activity[],
  convergeActivityId: string
): Activity[] {
  if (activitiesToInsert.length === 0) return activities

  const result = [...activities]
  const convergeIndex = result.findIndex((a) => a.id === convergeActivityId)

  if (convergeIndex !== -1) {
    result.splice(convergeIndex, 0, ...activitiesToInsert)
  } else {
    result.push(...activitiesToInsert)
  }

  return result
}

/**
 * Update a converge activity's branches
 */
function updateConvergeBranches(activities: Activity[], convergeActivity: Activity, branchIds: string[]): Activity[] {
  const existing = convergeActivity as Extract<Activity, { type: 'converge' }>
  const updatedConverge: Extract<Activity, { type: 'converge' }> = {
    ...existing,
    converge: {
      ...existing.converge,
      branches: branchIds,
    },
  }

  const convergeIndex = activities.findIndex((a) => a.id === convergeActivity.id)
  if (convergeIndex !== -1) {
    const result = [...activities]
    result[convergeIndex] = updatedConverge
    return result
  }

  return activities
}

// ============================================================================
// Zustand Store
// ============================================================================

export const useWorkflowStore = create<WorkflowStore>((set) => ({
  currentWorkflow: null,
  workflowVersion: 0,
  edges: [],

  setWorkflow: (workflow) => {
    set((state) => ({
      currentWorkflow: workflow,
      workflowVersion: state.workflowVersion + 1,
    }))
  },

  setEdges: (edges) => {
    set({ edges })
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
      }
    })
  },

  syncConvergeBranches: () => {
    set((state) => {
      if (!state.currentWorkflow) return state

      // Process all converge activities and restructure the workflow
      let activities = [...state.currentWorkflow.workflow.activities]
      const convergeActivities = activities.filter((a) => a.type === 'converge')

      for (const convergeActivity of convergeActivities) {
        const parallelId = `parallel_for_${convergeActivity.id}`

        // Find all edges that target this converge activity
        const incomingEdges = state.edges.filter((edge) => edge.target === convergeActivity.id)
        const sourceActivityIds = incomingEdges.map((edge) => edge.source)

        // Check if a parallel activity already exists for this converge
        const existingParallelIndex = activities.findIndex((a) => a.id === parallelId)
        const hasExistingParallel = existingParallelIndex !== -1

        if (sourceActivityIds.length >= 2) {
          // We need a parallel activity with 2+ branches
          // BUT: Structural nodes (loop, condition) should NOT be moved into parallels
          // Only regular task/action nodes should be parallelized

          const sourceActivitiesAll = activities.filter((a) => sourceActivityIds.includes(a.id))
          const structuralNodes = sourceActivitiesAll.filter((a) => a.type === 'loop' || a.type === 'condition')
          const regularNodes = sourceActivitiesAll.filter((a) => a.type !== 'loop' && a.type !== 'condition')

          // If all source nodes are structural (loops/conditions), don't create parallel
          // The edges encode the parallelism, no container needed
          if (structuralNodes.length === sourceActivityIds.length) {
            // All structural nodes - just update converge to reference them directly
            if (hasExistingParallel) {
              activities = removeParallelAndRestoreBranches(activities, parallelId, convergeActivity.id)
            }
            activities = updateConvergeBranches(activities, convergeActivity, sourceActivityIds)
          } else {
            // Mix of structural and regular nodes, or all regular nodes
            let sourceActivities: Activity[] = []
            let orphanedActivities: Activity[] = []

            if (hasExistingParallel) {
              const existingParallel = activities[existingParallelIndex] as Extract<Activity, { type: 'parallel' }>

              // Separate activities that still have edges vs those that lost them
              orphanedActivities = existingParallel.branches.filter((a) => !sourceActivityIds.includes(a.id))
              const activitiesFromParallel = existingParallel.branches.filter((a) => sourceActivityIds.includes(a.id))
              const activitiesFromMain = regularNodes // Only regular nodes from main array
              sourceActivities = [...activitiesFromParallel, ...activitiesFromMain]

              // Remove existing parallel - we'll create a new one
              activities = activities.filter((a) => a.id !== parallelId)
            } else {
              sourceActivities = regularNodes // Only wrap regular nodes
            }

            // Remove ONLY regular source activities from main array (they'll be in the parallel)
            // Structural nodes stay in main array
            const regularNodeIds = regularNodes.map((a) => a.id)
            activities = activities.filter((a) => !regularNodeIds.includes(a.id))

            // Restore orphaned activities back to main array
            activities = insertActivitiesBeforeConverge(activities, orphanedActivities, convergeActivity.id)

            // Create and insert the parallel activity
            const parallelActivity: Extract<Activity, { type: 'parallel' }> = {
              type: 'parallel',
              id: parallelId,
              name: `Parallel branches for ${convergeActivity.name}`,
              branches: sourceActivities,
            }
            activities = insertActivitiesBeforeConverge(activities, [parallelActivity], convergeActivity.id)

            // Update the converge to reference both the parallel and structural nodes
            const branchIds = [
              ...(sourceActivities.length > 0 ? [parallelId] : []),
              ...structuralNodes.map((a) => a.id),
            ]
            activities = updateConvergeBranches(activities, convergeActivity, branchIds)
          }
        } else if (sourceActivityIds.length === 1) {
          // Only one source - no parallel needed, reference activity directly
          if (hasExistingParallel) {
            activities = removeParallelAndRestoreBranches(activities, parallelId, convergeActivity.id)
          }

          // Update converge to reference the single source activity
          activities = updateConvergeBranches(activities, convergeActivity, sourceActivityIds)
        } else {
          // No sources - remove parallel if it exists, clear converge branches
          if (hasExistingParallel) {
            activities = removeParallelAndRestoreBranches(activities, parallelId, convergeActivity.id)
          }

          // Clear converge branches
          activities = updateConvergeBranches(activities, convergeActivity, [])
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
        // - Loop-back edges (targetHandle='end')
        const isSequentialEdge =
          (!edge.sourceHandle || edge.sourceHandle === 'source' || edge.sourceHandle === 'done') &&
          edge.targetHandle !== 'end'

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
      }
    })
  },
}))

// Helper functions to create triggers (return plain objects)
export function createManualTrigger(requiresApproval?: boolean): WorkflowAPI.components['schemas']['manualTrigger'] {
  return {
    type: 'manual',
    ...(requiresApproval !== undefined && { requiresApproval }),
  }
}

export function createScheduledTrigger(
  scheduleType: 'cron' | 'interval' | 'continuous',
  config: {
    cron?: string
    timezone?: string
    interval?: string
  }
): WorkflowAPI.components['schemas']['scheduledTrigger'] {
  if (scheduleType === 'cron' && config.cron) {
    return {
      type: 'scheduled',
      schedule: {
        scheduleType: 'cron',
        cron: config.cron,
        ...(config.timezone && { timezone: config.timezone }),
      },
    }
  } else if (scheduleType === 'interval' && config.interval) {
    return {
      type: 'scheduled',
      schedule: {
        scheduleType: 'interval',
        interval: config.interval,
      },
    }
  } else {
    return {
      type: 'scheduled',
      schedule: {
        scheduleType: 'continuous',
        continuous: true,
      },
    }
  }
}

export function createEventTrigger(
  source: string,
  eventType: string,
  filter?: Record<string, unknown>
): WorkflowAPI.components['schemas']['eventTrigger'] {
  return {
    type: 'event',
    event: {
      source,
      eventType,
      ...(filter && { filter }),
    },
  }
}

// Helper functions to create task activities
export function createScriptActivity(
  id: string,
  name: string,
  language: 'python' | 'javascript' | 'bash' | 'powershell',
  code: string,
  inputs?: string
): TaskActivity {
  const activity: TaskActivity = {
    type: 'task',
    id,
    name,
    task: {
      executor: 'script',
      config: {
        language,
        code,
      },
    },
  }

  if (inputs) {
    try {
      activity.task.inputs = JSON.parse(inputs)
    } catch {
      // If inputs is not valid JSON, skip it
    }
  }

  return activity
}

export function createApiActivity(
  id: string,
  name: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  headers?: string,
  body?: string,
  inputs?: string
): TaskActivity {
  const config: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    url: string
    headers?: { [key: string]: string }
    body?: unknown
  } = {
    method,
    url,
  }

  if (headers) {
    try {
      config.headers = JSON.parse(headers) as { [key: string]: string }
    } catch {
      // If headers is not valid JSON, skip it
    }
  }

  if (body) {
    try {
      config.body = JSON.parse(body)
    } catch {
      // If body is not valid JSON, use as string
      config.body = body
    }
  }

  const activity: TaskActivity = {
    type: 'task',
    id,
    name,
    task: {
      executor: 'api',
      config,
    },
  }

  if (inputs) {
    try {
      activity.task.inputs = JSON.parse(inputs)
    } catch {
      // If inputs is not valid JSON, skip it
    }
  }

  return activity
}

// Helper functions to create condition and loop activities
export function createConditionActivity(
  id: string,
  name: string,
  condition: string
): Extract<Activity, { type: 'condition' }> {
  return {
    type: 'condition',
    id,
    name,
    condition,
    then: [],
    else: [],
  }
}

export function createLoopActivity(
  id: string,
  name: string,
  loopType: 'forEach' | 'while',
  config: {
    items?: string
    condition?: string
    maxIterations?: number
    indexVariable?: string
    itemVariable?: string
  }
): Extract<Activity, { type: 'loop' }> {
  const baseActivity = {
    type: 'loop' as const,
    id,
    name,
    loop: {
      type: loopType,
      do: [],
    },
  }

  if (loopType === 'forEach' && config.items) {
    return {
      ...baseActivity,
      loop: {
        ...baseActivity.loop,
        type: 'forEach' as const,
        items: config.items,
        itemVariable: config.itemVariable,
        indexVariable: config.indexVariable,
      },
    }
  } else if (loopType === 'while' && config.condition) {
    const whileLoop: Extract<Activity, { type: 'loop' }>['loop'] = {
      ...baseActivity.loop,
      type: 'while' as const,
      condition: config.condition,
    }

    // Only include maxIterations if it has a valid value
    if (config.maxIterations !== undefined && config.maxIterations !== null) {
      whileLoop.maxIterations = config.maxIterations
    }

    return {
      ...baseActivity,
      loop: whileLoop,
    }
  }

  // Fallback - should not happen if form validation works
  // Default to forEach with empty items to satisfy type requirements
  return {
    ...baseActivity,
    loop: {
      type: 'forEach' as const,
      items: '',
      do: [],
    },
  }
}

export function createConvergeActivity(
  id: string,
  name: string,
  config?: {
    timeout?: string
    onTimeout?: 'continue' | 'fail'
    aggregateOutputs?: boolean
  }
): Extract<Activity, { type: 'converge' }> {
  const convergeActivity: Extract<Activity, { type: 'converge' }> = {
    type: 'converge',
    id,
    name,
    converge: {
      branches: [], // Will be populated based on incoming edges
      strategy: 'all', // Only 'all' strategy is supported
      timeout: config?.timeout,
      onTimeout: config?.onTimeout,
      aggregateOutputs: config?.aggregateOutputs,
    },
  }

  return convergeActivity
}

export function createConnectorActivity(
  id: string,
  name: string,
  connectorId: string,
  operation: string,
  parameters?: string,
  requiresApproval?: boolean
): TaskActivity {
  // Parse parameters if provided
  let parsedParameters: { [key: string]: unknown } | undefined
  if (parameters) {
    try {
      parsedParameters = JSON.parse(parameters)
    } catch {
      // If parameters is not valid JSON, skip it
    }
  }

  // TODO: Backend ExecutorType enum is missing 'connector' even though JSON schema includes it
  // Temporarily using 'agentic' executor with structured prompt until backend is updated
  // See: src/nexus/workflows/workflow_engine/models/workflow_definition.py ExecutorType enum
  const connectorPrompt = JSON.stringify({
    __type: 'connector',
    connectorId,
    operation,
    ...(parsedParameters && { parameters: parsedParameters }),
  })

  const activity: TaskActivity = {
    type: 'task',
    id,
    name,
    ...(requiresApproval === true && { requiresApproval: true }),
    // Add metadata to indicate this is actually an AAP connector node
    // This allows the UI to render it with the Ansible icon/label
    metadata: {
      __executorType: 'aap',
      __connectorId: connectorId,
    },
    task: {
      executor: 'agentic',
      config: {
        agent: '__connector_workaround__', // Required field for agentic executor
        prompt: connectorPrompt,
      },
    },
  }

  return activity
}

/**
 * Create a generic placeholder activity that can be replaced with any node type
 */
export function createGenericActivity(id: string, name: string = 'New Node', customMessage?: string): TaskActivity {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activity: any = {
    type: 'task',
    id,
    name,
    metadata: {
      __isGeneric: true, // Flag to identify this as a placeholder node
      ...(customMessage ? { __customMessage: customMessage } : {}),
    },
    task: {
      executor: 'script', // Use script executor as placeholder
      config: {
        language: 'python',
        code: '# Click to configure this node',
      },
    },
  }

  return activity as TaskActivity
}
