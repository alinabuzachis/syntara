/**
 * Execution Visualization Store
 *
 * Zustand store for managing execution visualization state including:
 * - Execution data and workflow definition
 * - Activity states and errors
 * - WebSocket connection status
 * - Event replay for reconnection
 */

import { create } from 'zustand'

import type { Execution, ExecutionVisualization, ExecutionStoreState, JsonPatchOperation } from '../execution/types'
import { applyJsonPatch, buildActivityStateMap, extractActivityMaps } from '../execution/utils/activityState'

// ============================================================================
// Store Actions
// ============================================================================

interface ExecutionStoreActions {
  /**
   * Set execution data from REST API or WebSocket snapshot
   * Initializes or updates the complete execution state
   */
  setExecution: (execution: Execution) => void

  /**
   * Apply JSON Patch operations from WebSocket activity_patch message
   * Updates activity states incrementally
   */
  applyPatch: (ops: JsonPatchOperation[], eventId: string) => void

  /**
   * Mark execution as complete (received final_snapshot)
   * Stops WebSocket streaming
   */
  setComplete: (complete: boolean) => void

  /**
   * Update WebSocket connection state
   */
  setConnectionState: (connected: boolean, stale: boolean) => void

  /**
   * Update last received event ID for replay support
   */
  setLastEventId: (eventId: string) => void

  /**
   * Set error state
   */
  setError: (error: Error | null) => void

  /**
   * Reset store to initial state
   * Used when switching between executions or unmounting
   */
  reset: () => void
}

// ============================================================================
// Complete Store Type
// ============================================================================

type ExecutionStore = ExecutionStoreState & ExecutionStoreActions

// ============================================================================
// Initial State
// ============================================================================

const initialState: ExecutionStoreState = {
  executionId: null,
  visualization: null,
  activityStates: new Map(),
  activityErrors: new Map(),
  isConnected: false,
  isStale: false,
  isComplete: false,
  lastEventId: null,
  error: null,
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useExecutionStore = create<ExecutionStore>((set, get) => ({
  ...initialState,

  setExecution: (execution: Execution) => {
    // Build activity state map from execution data
    const activities = execution.activities || []
    const activityStateMap = buildActivityStateMap(activities)

    // Extract status and error maps for fast lookup
    const [activityStates, activityErrors] = extractActivityMaps(activityStateMap)

    // Build visualization object
    const visualization: ExecutionVisualization = {
      executionId: execution.id,
      workflowId: execution.workflow_id || '',
      status: execution.status || 'pending',
      workflowDefinition: execution.workflow_definition,
      activities: activityStateMap,
      createdAt: execution.createdAt,
      startedAt: execution.started_at,
      completedAt: execution.completed_at,
    }

    set({
      executionId: execution.id,
      visualization,
      activityStates,
      activityErrors,
      error: null,
    })
  },

  applyPatch: (ops: JsonPatchOperation[], eventId: string) => {
    const { visualization } = get()

    if (!visualization) {
      // console.warn('Cannot apply patch: no execution loaded')
      return
    }

    // Create mutable copy of activities map
    const activitiesCopy = new Map(visualization.activities)

    try {
      // Apply JSON Patch operations
      // Convert map values to array for index-based operations
      const activityArray = Array.from(activitiesCopy.values())
      applyJsonPatch(activitiesCopy, ops, activityArray)

      // Extract updated maps
      const [activityStates, activityErrors] = extractActivityMaps(activitiesCopy)

      // Update visualization with new activities
      const updatedVisualization: ExecutionVisualization = {
        ...visualization,
        activities: activitiesCopy,
      }

      set({
        visualization: updatedVisualization,
        activityStates,
        activityErrors,
        lastEventId: eventId,
        error: null,
      })
    } catch (error) {
      // console.error('Failed to apply JSON Patch:', error)
      set({
        error: error instanceof Error ? error : new Error(String(error)),
      })
    }
  },

  setComplete: (complete: boolean) => {
    set({ isComplete: complete })
  },

  setConnectionState: (connected: boolean, stale: boolean) => {
    set({
      isConnected: connected,
      isStale: stale,
    })
  },

  setLastEventId: (eventId: string) => {
    set({ lastEventId: eventId })
  },

  setError: (error: Error | null) => {
    set({ error })
  },

  reset: () => {
    set({
      ...initialState,
      // Reset with new Map instances to avoid reference issues
      activityStates: new Map(),
      activityErrors: new Map(),
    })
  },
}))

// ============================================================================
// Selectors
// ============================================================================

/**
 * Select execution ID
 */
export const selectExecutionId = (state: ExecutionStore) => state.executionId

/**
 * Select visualization data
 */
export const selectVisualization = (state: ExecutionStore) => state.visualization

/**
 * Select activity state by ID
 */
export const selectActivityStatus = (activityId: string) => (state: ExecutionStore) =>
  state.activityStates.get(activityId)

/**
 * Select activity error by ID
 */
export const selectActivityError = (activityId: string) => (state: ExecutionStore) =>
  state.activityErrors.get(activityId)

/**
 * Select all activity states
 */
export const selectAllActivityStates = (state: ExecutionStore) => state.activityStates

/**
 * Select all activity errors
 */
export const selectAllActivityErrors = (state: ExecutionStore) => state.activityErrors

/**
 * Select connection state
 */
export const selectConnectionState = (state: ExecutionStore) => ({
  isConnected: state.isConnected,
  isStale: state.isStale,
})

/**
 * Select completion state
 */
export const selectIsComplete = (state: ExecutionStore) => state.isComplete

/**
 * Select last event ID for replay
 */
export const selectLastEventId = (state: ExecutionStore) => state.lastEventId

/**
 * Select error state
 */
export const selectError = (state: ExecutionStore) => state.error

/**
 * Select whether execution is loaded
 */
export const selectIsLoaded = (state: ExecutionStore) => state.visualization !== null
