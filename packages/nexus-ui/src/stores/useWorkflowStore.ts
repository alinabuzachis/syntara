import { ActivityTypeEnum } from '@ansible/nexus-contracts'
import { create } from 'zustand'

import { generateActivityId } from '../utils/generateUUID'

import {
  findActivityById,
  getValidSourceHandles,
  removeActivityFromList,
  reorderActivities,
  replaceActivityInList,
  updateActivityInList,
} from './workflowActivityHelpers'
import type { Activity, WorkflowStore } from './workflowStoreTypes'

// ============================================================================
// Zustand Store
// ============================================================================

// eslint-disable-next-line max-lines-per-function
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

      const triggers = state.currentWorkflow.triggers ?? []
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

  duplicateActivity: (activityId) => {
    let newId: string | null = null

    set((state) => {
      if (!state.currentWorkflow) return state

      const original = findActivityById(state.currentWorkflow.workflow.activities, activityId)
      if (!original) return state

      const generatedId = generateActivityId()
      newId = generatedId

      const existingNames = new Set(
        state.currentWorkflow.workflow.activities
          .map((a) => a.name)
          .filter((name): name is string => Boolean(name?.trim()))
      )

      const baseName = `Copy of ${original.name ?? 'Node'}`
      let uniqueName = baseName
      if (existingNames.has(uniqueName)) {
        let suffix = 2
        while (existingNames.has(`${baseName}${suffix}`)) suffix++
        uniqueName = `${baseName}${suffix}`
      }

      // JSON round-trip for a safe deep-clone of plain data objects
      const clone = { ...(JSON.parse(JSON.stringify(original)) as Activity), id: generatedId, name: uniqueName }

      return {
        currentWorkflow: {
          ...state.currentWorkflow,
          workflow: {
            ...state.currentWorkflow.workflow,
            activities: [...state.currentWorkflow.workflow.activities, clone],
          },
        },
        isDirty: true,
      }
    })

    return newId
  },

  removeActivity: (activityId) => {
    set((state) => {
      if (!state.currentWorkflow) return state

      let activities = [...state.currentWorkflow.workflow.activities]

      // Check if we're removing a converge activity
      const activityToRemove = findActivityById(activities, activityId)
      if (activityToRemove?.type === ActivityTypeEnum.CONVERGE) {
        // Find and cleanup the associated parallel container
        const parallelId = `parallel_for_${activityId}`
        const parallelIndex = activities.findIndex((a) => a.id === parallelId)

        if (parallelIndex !== -1) {
          const parallelActivity = activities[parallelIndex] as Extract<Activity, { type: 'parallel' }>

          // Extract all activities from the parallel's branches
          const branchActivities = parallelActivity.branches ?? []

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

  replaceActivity: (activityId, newActivity) => {
    set((state) => {
      if (!state.currentWorkflow) return state

      const oldActivity = findActivityById(state.currentWorkflow.workflow.activities, activityId)

      // When the node type changes, remove outgoing edges that use handles incompatible
      // with the new type (e.g. condition's true/false edges when replacing with a task).
      let edges = state.edges
      if (oldActivity && oldActivity.type !== newActivity.type) {
        const validHandles = getValidSourceHandles(newActivity.type)
        edges = state.edges.filter(
          (edge) => edge.source !== activityId || edge.sourceHandle == null || validHandles.has(edge.sourceHandle)
        )
      }

      return {
        edges,
        currentWorkflow: {
          ...state.currentWorkflow,
          workflow: {
            ...state.currentWorkflow.workflow,
            activities: replaceActivityInList(state.currentWorkflow.workflow.activities, activityId, newActivity),
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
      const convergeActivities = activities.filter((a) => a.type === ActivityTypeEnum.CONVERGE)

      // Build a map of activity ID → parallel container ID
      // This allows us to detect when multiple incoming edges belong to the same parallel group
      const activityToParallelMap = new Map<string, string>()
      activities.forEach((activity) => {
        if (activity.type === ActivityTypeEnum.PARALLEL && activity.branches) {
          activity.branches.forEach((branch) => {
            // For each activity in the parallel branch, map it to the parallel container ID
            const collectActivityIds = (act: Activity): void => {
              activityToParallelMap.set(act.id, activity.id)
              if (act.type === ActivityTypeEnum.SEQUENCE && act.steps) {
                act.steps.forEach(collectActivityIds)
              } else if (act.type === ActivityTypeEnum.CONDITION) {
                ;(act.then ?? []).forEach(collectActivityIds)
                ;(act.else ?? []).forEach(collectActivityIds)
              } else if (act.type === ActivityTypeEnum.LOOP && act.loop.do) {
                act.loop.do.forEach(collectActivityIds)
              }
            }
            collectActivityIds(branch)
          })
        }
      })

      for (const convergeActivity of convergeActivities) {
        // Find all edges that target this converge activity
        const incomingEdges = state.edges.filter((edge) => edge.target === convergeActivity.id)
        const sourceActivityIds = incomingEdges.map((edge) => edge.source)

        // Group sources by their parallel container (if any)
        const parallelGroups = new Map<string, string[]>()
        const standaloneActivities: string[] = []

        for (const sourceId of sourceActivityIds) {
          const parallelId = activityToParallelMap.get(sourceId)
          if (parallelId) {
            // This source belongs to a parallel container
            if (!parallelGroups.has(parallelId)) {
              parallelGroups.set(parallelId, [])
            }
            parallelGroups.get(parallelId)!.push(sourceId)
          } else {
            // This source is a standalone activity
            standaloneActivities.push(sourceId)
          }
        }

        // Build the final branches array
        // CRITICAL: converge.branches should ALWAYS contain individual activity IDs,
        // NOT parallel container IDs. The API schema expects the IDs of the actual
        // branch endpoint activities, not their container.
        const branchIds: string[] = []

        parallelGroups.forEach((sources) => {
          // Always use individual source activity IDs, regardless of how many there are
          branchIds.push(...sources)
        })

        branchIds.push(...standaloneActivities)

        // Update converge.branches with the deduplicated branch IDs
        const convergeIndex = activities.findIndex((a) => a.id === convergeActivity.id)
        if (convergeIndex !== -1) {
          const existing = convergeActivity
          activities[convergeIndex] = {
            ...existing,
            converge: {
              ...existing.converge,
              branches: branchIds,
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

      return {
        currentWorkflow: {
          ...state.currentWorkflow,
          workflow: {
            ...state.currentWorkflow.workflow,
            activities: reorderActivities(state.currentWorkflow.workflow.activities, state.edges),
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
        if (activityToRemove?.type === ActivityTypeEnum.CONVERGE) {
          // Find and cleanup the associated parallel container
          const parallelId = `parallel_for_${nodeId}`
          const parallelIndex = activities.findIndex((a) => a.id === parallelId)

          if (parallelIndex !== -1) {
            const parallelActivity = activities[parallelIndex] as Extract<Activity, { type: 'parallel' }>
            const branchActivities = parallelActivity.branches ?? []

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
// Re-exports for backward compatibility
// ============================================================================
export {
  findActivityById,
  reorderActivities,
  removeActivityFromList,
  updateActivityInList,
} from './workflowActivityHelpers'
export type { WorkflowStore, WorkflowDefinition, Trigger, Activity, TaskActivity } from './workflowStoreTypes'
export * from './workflowStoreSelectors'

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
  createAgenticActivity,
  createConditionActivity,
  createLoopActivity,
  createConvergeActivity,
  createAAPJobTemplateActivity,
  createConnectorActivity,
  createGenericActivity,
  createApprovalActivity,
} from './workflowFactories'
export type {
  CreateApiActivityOptions,
  CreateAgenticActivityOptions,
  CreateApprovalActivityOptions,
} from './workflowFactories'
