import type { Connection } from '@xyflow/react'

import type { EdgeType } from './workflowToGraph'

/**
 * Validates a connection between nodes in the builder.
 * Prevents connections to placeholder nodes and self-connections.
 */
export function validateConnection(connection: EdgeType | Connection): boolean {
  // Prevent connecting to placeholder nodes
  if (connection.target?.startsWith('placeholder-')) return false

  // Prevent self-connections
  if (connection.source === connection.target) return false

  return true
}
