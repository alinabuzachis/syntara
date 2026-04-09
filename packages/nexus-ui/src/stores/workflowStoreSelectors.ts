import { useWorkflowStore } from './useWorkflowStore'
import type { WorkflowStore } from './workflowStoreTypes'

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
 * Selector for workflow version counter (UI-only).
 * Use to detect when a completely new workflow has been loaded or batch operations complete.
 * This is a UI-only counter - NOT related to backend workflow.version or workflow.current_version.
 * Incremented by: setWorkflow, loadWorkflowWithEdges, batchAddActivitiesAndEdges.
 * Does NOT change when individual activities/triggers/edges are modified.
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
export const selectWorkflowName = (state: WorkflowStore) =>
  state.currentWorkflow?.name ?? state.currentWorkflow?.metadata?.name

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
    replaceActivity: state.replaceActivity,
    duplicateActivity: state.duplicateActivity,
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

// ============================================================================
// Custom Hooks - Recommended way to access store state
// ============================================================================
// These hooks provide controlled access to specific state slices.
// Prefer using these over direct store access for better encapsulation.
// ============================================================================

/** Hook to get workflow version counter (UI-only, NOT backend workflow.version) */
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
