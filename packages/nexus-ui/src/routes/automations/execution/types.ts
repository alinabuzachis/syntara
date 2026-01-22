/**
 * Execution Visualization Types
 *
 * TypeScript type definitions for execution visualization including nodes,
 * edges, and WebSocket messages for real-time activity streaming.
 */

import type { WorkflowAPI } from '@ansible/nexus-contracts'

// ============================================================================
// API Type Imports
// ============================================================================

/** Execution schema from REST API */
export type Execution = WorkflowAPI.components['schemas']['Execution']

/** Activity data from REST API */
export type ActivityData = WorkflowAPI.components['schemas']['ActivityData']

/** Activity status from API */
export type ActivityStatus = WorkflowAPI.components['schemas']['ActivityStatus']

/** Execution status from API */
export type ExecutionStatus = WorkflowAPI.components['schemas']['ExecutionStatus']

// ============================================================================
// UI Status Types
// ============================================================================

/**
 * Node status for visualization
 * Maps from ActivityStatus with UI-friendly naming
 */
export type NodeStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped' | 'cancelled'

/**
 * Edge status derived from source node status
 */
export type EdgeStatus = 'pending' | 'passed'

// ============================================================================
// Status Mapping
// ============================================================================

/**
 * Convert API ActivityStatus to UI NodeStatus
 * - 'completed' → 'success' (UI-friendly terminology)
 * - 'failed' → 'error' (matches common UI conventions)
 * - 'retrying' → 'running' (retrying is a form of running)
 */
export function mapActivityStatusToNodeStatus(status: ActivityStatus): NodeStatus {
  switch (status) {
    case 'pending':
      return 'pending'
    case 'running':
      return 'running'
    case 'completed':
      return 'success'
    case 'failed':
      return 'error'
    case 'retrying':
      return 'running'
    case 'skipped':
      return 'skipped'
    case 'cancelled':
      return 'cancelled'
    default: {
      // Exhaustive check - TypeScript will error if we miss a case
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}

// ============================================================================
// JSON Patch Types
// ============================================================================

/**
 * JSON Patch operation per RFC 6902
 * Supports add, replace, and remove operations for activity updates
 */
export interface JsonPatchOperation {
  /** Operation type */
  op: 'add' | 'replace' | 'remove' | 'move' | 'copy' | 'test'
  /** JSON Pointer path (e.g., "/activities/0/status") */
  path: string
  /** Value for add/replace/test operations */
  value?: unknown
  /** Source path for move/copy operations */
  from?: string
}

// ============================================================================
// WebSocket Message Types
// ============================================================================

/**
 * Base message fields common to all WebSocket messages
 */
interface BaseWebSocketMessage {
  /** Valkey stream ID for replay support (format: {milliseconds}-{sequence}) */
  event_id: string
  /** Workflow execution ID */
  execution_id: string
  /** Timestamp when message was generated */
  timestamp: string
}

/**
 * Execution snapshot message
 * Sent as first message (type="initial_snapshot") on replay from beginning,
 * and as last message (type="final_snapshot") when execution completes.
 */
export interface ExecutionSnapshotMessage extends BaseWebSocketMessage {
  type: 'initial_snapshot' | 'final_snapshot'
  /**
   * Execution object with same structure as REST API
   * GET /executions/{id}?include=activities
   */
  execution: Execution
}

/**
 * Activity patch message
 * Activity status change using JSON Patch format for incremental updates
 */
export interface ActivityPatchMessage extends BaseWebSocketMessage {
  type: 'activity_patch'
  /** One or more JSON Patch operations */
  ops: JsonPatchOperation[]
}

/**
 * Heartbeat message
 * Sent every 30s when no updates to indicate connection health
 */
export interface HeartbeatMessage {
  type: 'heartbeat'
  /** Workflow execution ID */
  execution_id: string
  /** Timestamp of heartbeat */
  timestamp: string
}

/**
 * Union of all possible WebSocket message types
 */
export type WebSocketMessage = ExecutionSnapshotMessage | ActivityPatchMessage | HeartbeatMessage

// ============================================================================
// Visualization State Types
// ============================================================================

/**
 * Activity state for visualization
 */
export interface ActivityState {
  /** Activity ID from workflow definition */
  activityId: string
  /** Current status */
  status: NodeStatus
  /** Error message if status is 'error' */
  errorDetails?: string | null
  /** When activity started execution */
  startedAt?: string | null
  /** When activity reached terminal state */
  completedAt?: string | null
}

/**
 * Execution visualization data structure
 * Contains the workflow definition and execution metadata needed for visualization
 */
export interface ExecutionVisualization {
  /** Execution ID */
  executionId: string
  /** Workflow ID */
  workflowId: string
  /** Overall execution status */
  status: ExecutionStatus
  /** Workflow definition for building graph */
  workflowDefinition: unknown // TODO: Type from workflow-definition.schema
  /** Activity states keyed by activity_id */
  activities: Map<string, ActivityState>
  /** When execution was created */
  createdAt: string
  /** When execution started */
  startedAt?: string | null
  /** When execution completed */
  completedAt?: string | null
}

// ============================================================================
// Store State Types
// ============================================================================

/**
 * Connection state for WebSocket
 */
export interface ConnectionState {
  /** Whether WebSocket is currently connected */
  isConnected: boolean
  /**
   * Whether connection is stale (disconnected but attempting to reconnect)
   * UI should show warning indicator when true
   */
  isStale: boolean
}

/**
 * Execution store state
 * Manages all state for execution visualization
 */
export interface ExecutionStoreState {
  /** Current execution ID being visualized */
  executionId: string | null
  /** Execution visualization data */
  visualization: ExecutionVisualization | null
  /** Activity states keyed by activity_id (for fast lookup) */
  activityStates: Map<string, NodeStatus>
  /** Activity errors keyed by activity_id */
  activityErrors: Map<string, string>
  /** WebSocket connection state */
  isConnected: boolean
  /** Whether connection is stale (disconnected but reconnecting) */
  isStale: boolean
  /** Whether execution is complete (final_snapshot received) */
  isComplete: boolean
  /** Last event ID received (for replay on reconnection) */
  lastEventId: string | null
  /** Error state */
  error: Error | null
}
