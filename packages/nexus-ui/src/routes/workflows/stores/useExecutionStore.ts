/**
 * Execution Store
 *
 * Zustand store for managing execution visualization state:
 * - Execution visualization with WebSocket streaming
 * - Activity states and errors (unified data model)
 * - WebSocket connection status
 * - Event replay for reconnection
 *
 * Used by the ExecutionDetail page (/executions/{id}) to display execution
 * details with real-time updates via WebSocket or REST API fallback.
 */

import type { ExecutionsAPI } from '@ansible/nexus-contracts'
import { create } from 'zustand'

import type { Execution, ExecutionVisualization, JsonPatchOperation, ActivityState } from '../execution/types'
import { applyJsonPatch, buildActivityStateMap, extractActivityMaps } from '../execution/utils/activityState'

// ============================================================================
// Type Imports
// ============================================================================

type ActivityData = ExecutionsAPI.components['schemas']['ActivityData']
type ActivityExecution = ExecutionsAPI.components['schemas']['ActivityExecution']

/** Activity input from REST API: Execution.activities (ActivityData) or list endpoint (ActivityExecution) */
type ActivityInput = ActivityData | ActivityExecution

// ============================================================================
// Store State
// ============================================================================

type ExecutionStoreState = {
  // === Execution Visualization (WebSocket streaming) ===
  /** Current execution being visualized/streamed */
  executionId: string | null
  /** Full execution visualization data */
  visualization: ExecutionVisualization | null
  /** Activity states keyed by activity_id (UNIFIED - stores full ActivityState objects) */
  activityStates: Map<string, ActivityState>
  /** Activity errors keyed by activity_id (for quick error lookups) */
  activityErrors: Map<string, string>

  // === WebSocket State ===
  /** WebSocket connection state */
  isConnected: boolean
  /** Whether connection is stale (disconnected but reconnecting) */
  isStale: boolean
  /** Whether execution is complete (final_snapshot received) */
  isComplete: boolean
  /** Last event ID received (for replay on reconnection) */
  lastEventId: string | null

  // === Error State ===
  /** Error state */
  error: Error | null
}

// ============================================================================
// Store Actions
// ============================================================================

type ExecutionStoreActions = {
  // === Execution Visualization Actions ===
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

  // === ExecutionDetail Page Actions ===
  /**
   * Set activity executions for ExecutionDetail page (auto-converts to ActivityState)
   * Accepts ActivityData[] (from Execution.activities) or ActivityExecution[] (from list endpoint)
   * Used by ExecutionDetailsPanel when loading execution data via REST API
   */
  setActivityExecutions: (activities: ActivityInput[]) => void

  // === Reset ===
  /**
   * Reset entire store to initial state
   * Used when switching between executions or unmounting
   */
  reset: () => void
}

// ============================================================================
// Complete Store Type
// ============================================================================

type ExecutionStore = ExecutionStoreState & ExecutionStoreActions

// ============================================================================
// Adapter Functions
// ============================================================================

/**
 * Get activity ID from ActivityData or ActivityExecution
 * ActivityData uses activity_id; ActivityExecution uses activity_name or id
 */
function getActivityId(activity: ActivityInput): string | undefined {
  if ('activity_id' in activity) {
    return activity.activity_id
  }
  return activity.activity_name ?? activity.id
}

/**
 * Convert API ActivityData or ActivityExecution to internal ActivityState
 * Used by ExecutionDetailsPanel when loading execution data via REST API
 */
function activityInputToState(activity: ActivityInput): ActivityState {
  const activityId = getActivityId(activity)
  if (!activityId) {
    throw new Error('Activity must have activity_id (ActivityData) or activity_name/id (ActivityExecution)')
  }
  return {
    activityId,
    status: activity.status ?? 'pending',
    errorDetails: activity.error_details,
    outputData: (activity as { output_data?: Record<string, unknown> | null }).output_data,
    startedAt: activity.started_at,
    completedAt: activity.completed_at,
  }
}

/**
 * Convert array of ActivityData or ActivityExecution to maps for fast lookup
 * Used by ExecutionDetailsPanel's setActivityExecutions action
 */
function buildActivityMapsFromInput(activities: ActivityInput[]): [Map<string, ActivityState>, Map<string, string>] {
  const activityStates = new Map<string, ActivityState>()
  const activityErrors = new Map<string, string>()

  activities.forEach((activity) => {
    const activityKey = getActivityId(activity)
    if (activityKey) {
      const activityState = activityInputToState(activity)
      activityStates.set(activityKey, activityState)

      if (activity.error_details) {
        activityErrors.set(activityKey, activity.error_details)
      }
    }
  })

  return [activityStates, activityErrors]
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: ExecutionStoreState = {
  // Execution Visualization
  executionId: null,
  visualization: null,
  activityStates: new Map(),
  activityErrors: new Map(),

  // WebSocket State
  isConnected: false,
  isStale: false,
  isComplete: false,
  lastEventId: null,

  // Error State
  error: null,
}

// ============================================================================
// Store Implementation
// ============================================================================

/**
 * Execution Store Implementation
 *
 * Supports execution visualization for the ExecutionDetail page (/executions/{id}).
 *
 * **Data Population:**
 * - Primary: setExecution() via WebSocket initial_snapshot for real-time streaming
 * - Fallback: setActivityExecutions() via REST API (ExecutionDetailsPanel)
 *
 * **Data Flow:**
 * 1. REST API: GET /executions/{id}?include=workflow_definition,activities
 *    → Initial load via setActivityExecutions() (ExecutionDetailsPanel)
 * 2. WebSocket (optional): Connect to streaming endpoint for running executions
 *    → initial_snapshot: Full state via setExecution()
 *    → activity_patch: Incremental updates via applyPatch()
 *    → final_snapshot: Execution complete, refetch REST data
 * 3. Canvas: BuilderFlow/ExecutionViewContent subscribe to activityStates
 *    → Node badges update automatically when state changes
 *
 * **Note:** If both setExecution() and setActivityExecutions() are called,
 * last write wins (both update the same activityStates map).
 */
export const useExecutionStore = create<ExecutionStore>((set, get) => ({
  ...initialState,

  // === Execution Visualization Actions ===

  setExecution: (execution: Execution) => {
    // Build activity state map from execution data
    const activities = execution.activities ?? []
    const activityStateMap = buildActivityStateMap(activities)

    // Extract error map for fast lookups (activityStates will be the full map)
    const [, activityErrors] = extractActivityMaps(activityStateMap)

    // Build visualization object
    const visualization: ExecutionVisualization = {
      executionId: execution.id,
      workflowId: execution.workflow_id ?? '',
      status: execution.status ?? 'pending',
      workflowDefinition: execution.workflow_definition,
      activities: activityStateMap,
      createdAt: execution.created_at,
      startedAt: execution.started_at,
      completedAt: execution.completed_at,
    }

    set({
      executionId: execution.id,
      visualization,
      activityStates: activityStateMap, // Store full ActivityState objects
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

      // Extract error map (activityStates will be the full map)
      const [, activityErrors] = extractActivityMaps(activitiesCopy)

      // Update visualization with new activities
      const updatedVisualization: ExecutionVisualization = {
        ...visualization,
        activities: activitiesCopy,
      }

      set({
        visualization: updatedVisualization,
        activityStates: activitiesCopy, // Store full ActivityState objects
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

  // === ExecutionDetail Page Actions ===

  setActivityExecutions: (activities: ActivityInput[]) => {
    // Convert ActivityData[] or ActivityExecution[] to activity state maps
    const [activityStates, activityErrors] = buildActivityMapsFromInput(activities)

    set({
      activityStates,
      activityErrors,
    })
  },

  // === Reset ===

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
 * Select execution ID (for visualization/streaming)
 */
export const selectExecutionId = (state: ExecutionStore) => state.executionId

/**
 * Select visualization data
 */
export const selectVisualization = (state: ExecutionStore) => state.visualization

/**
 * Select activity status by ID (returns just the ActivityStatus)
 */
export const selectActivityStatus = (activityId: string) => (state: ExecutionStore) =>
  state.activityStates.get(activityId)?.status

/**
 * Select activity error by ID
 */
export const selectActivityError = (activityId: string) => (state: ExecutionStore) =>
  state.activityErrors.get(activityId)

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

// ============================================================================
// Action Accessors - Use these to access actions without subscribing to state
// ============================================================================
// Zustand best practice: When you only need to call actions (not read state),
// use getState() to avoid unnecessary re-renders.
//
// Example:
//   const { setExecution, reset } = useExecutionStoreActions()
//   // Component won't re-render when execution changes
// ============================================================================

/**
 * Get all store actions without subscribing to state changes.
 * Use this when you only need to dispatch actions from event handlers.
 *
 * @example
 * const { setExecution, setActivityExecutions } = useExecutionStoreActions()
 * const handleLoad = () => setExecution(executionData)
 */
export const useExecutionStoreActions = () => {
  const state = useExecutionStore.getState()
  return {
    // Visualization Actions
    setExecution: state.setExecution,
    applyPatch: state.applyPatch,
    setComplete: state.setComplete,
    setConnectionState: state.setConnectionState,
    setLastEventId: state.setLastEventId,
    setError: state.setError,

    // ExecutionDetail Page Actions
    setActivityExecutions: state.setActivityExecutions,

    // Reset
    reset: state.reset,
  }
}

/**
 * Type for execution store action accessors (useful for typing event handlers).
 */
export type ExecutionStoreActionAccessors = ReturnType<typeof useExecutionStoreActions>

// ============================================================================
// Custom Hooks - Recommended way to access store state
// ============================================================================
// These hooks provide controlled access to specific state slices.
// Prefer using these over direct store access for better encapsulation.
// ============================================================================
