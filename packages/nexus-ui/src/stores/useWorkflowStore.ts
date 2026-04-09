import { ActivityTypeEnum } from '@ansible/nexus-contracts'
import { create } from 'zustand'

import { buildTriggerIndexRemappping, remapTriggerIdsInEdges } from '../routes/builder/utils/triggerIndexRemapping'
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
      const deletedTrigger = triggers[index]

      // Guard: if index is out of bounds, return unchanged state
      if (!deletedTrigger) return state

      triggers.splice(index, 1)

      // Get the real ID of the deleted trigger (e.g., "activity_fb2060fd_...")
      // Edges use real trigger IDs, not display IDs like "trigger-0"
      const deletedTriggerRealId = (deletedTrigger as { id?: string }).id

      // Filter out edges that reference the deleted trigger by its real ID
      const edges = deletedTriggerRealId
        ? state.edges.filter((edge) => edge.source !== deletedTriggerRealId && edge.target !== deletedTriggerRealId)
        : state.edges

      return {
        currentWorkflow: {
          ...state.currentWorkflow,
          triggers,
        },
        edges,
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

      // v2: flat list, simply remove the activity
      const activities = removeActivityFromList(state.currentWorkflow.workflow.activities, activityId)

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

      // v2: no parallel containers — all nodes are flat.
      // Converge branches are determined by incoming edges.
      for (const convergeActivity of convergeActivities) {
        const incomingEdges = state.edges.filter((edge) => edge.target === convergeActivity.id)
        const branchIds = incomingEdges.map((edge) => edge.source)

        const convergeIndex = activities.findIndex((a) => a.id === convergeActivity.id)
        if (convergeIndex !== -1) {
          // v2: converge config is at activity.config (flat)
          const existingConfig = convergeActivity.config ?? {}
          activities[convergeIndex] = {
            ...convergeActivity,
            config: {
              ...existingConfig,
              branches: branchIds,
            },
          } as Activity
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

      // Remove triggers immutably
      const triggerIndicesToRemove = new Set(triggerIndices)
      const triggers = state.currentWorkflow.triggers
        ? state.currentWorkflow.triggers.filter((_, index) => !triggerIndicesToRemove.has(index))
        : []

      // v2: flat list — just filter out the removed node IDs
      const nodeIdSet = new Set(nodeIds)
      const activities = state.currentWorkflow.workflow.activities.filter((a) => !nodeIdSet.has(a.id))

      // Build trigger index remapping using shared utility
      const originalTriggerCount = state.currentWorkflow.triggers?.length ?? 0
      const triggerIndexRemap = buildTriggerIndexRemappping(triggerIndicesToRemove, originalTriggerCount)

      // Remap trigger display IDs in edges using shared utility
      const updatedEdges = remapTriggerIdsInEdges(edges, triggerIndexRemap)

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
        edges: updatedEdges,
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
export type {
  WorkflowStore,
  WorkflowDefinition,
  Trigger,
  Activity,
  ActivityWithMetadata,
  ActivityMetadata,
} from './workflowStoreTypes'
export { getActivityMetadata } from './workflowStoreTypes'
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
  createGenericActivity,
  createApprovalActivity,
} from './workflowFactories'
export type {
  CreateApiActivityOptions,
  CreateAgenticActivityOptions,
  CreateApprovalActivityOptions,
} from './workflowFactories'
