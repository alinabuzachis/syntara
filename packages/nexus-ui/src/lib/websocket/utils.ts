/**
 * WebSocket Utility Functions
 *
 * Helper functions for UI and common operations.
 */

import type { ConnectionState } from './types'

// ============================================================================
// UI Helpers
// ============================================================================

/** Get human-readable label for connection state */
export function getConnectionStateLabel(state: ConnectionState): string {
  const labels: Record<ConnectionState, string> = {
    connecting: 'Connecting...',
    connected: 'Connected',
    disconnected: 'Disconnected',
    reconnecting: 'Reconnecting...',
    failed: 'Connection Failed',
  }
  return labels[state]
}

/** Get color for connection state (for UI indicators) */
export function getConnectionStateColor(state: ConnectionState): 'green' | 'yellow' | 'red' | 'gray' {
  const colors: Record<ConnectionState, 'green' | 'yellow' | 'red' | 'gray'> = {
    connecting: 'yellow',
    connected: 'green',
    disconnected: 'gray',
    reconnecting: 'yellow',
    failed: 'red',
  }
  return colors[state]
}

/** Check if connection is in an active state */
export function isActiveState(state: ConnectionState): boolean {
  return state === 'connected'
}

/** Check if connection is attempting to connect */
export function isConnectingState(state: ConnectionState): boolean {
  return state === 'connecting' || state === 'reconnecting'
}

/** Check if connection has failed */
export function isFailedState(state: ConnectionState): boolean {
  return state === 'failed'
}
