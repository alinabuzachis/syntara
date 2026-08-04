import { EdgeHandleEnum } from '@syntara/contracts'
import type { Connection } from '@xyflow/react'

import type { EdgeType } from './workflowToGraph'

/**
 * Validates a connection between nodes in the builder.
 * Prevents connections to placeholder nodes and self-connections.
 * Allows only one edge from the 'loop' handle of a loop node.
 */
export function validateConnection(connection: EdgeType | Connection, existingEdges?: EdgeType[]): boolean {
  // Prevent connecting to placeholder nodes
  if (connection.target?.startsWith('placeholder-')) return false

  // Prevent self-connections
  if (connection.source === connection.target) return false

  // Allow only one edge from the 'loop' handle
  // The 'loop' handle is for the loop body - only one path should enter the loop
  if (connection.sourceHandle === EdgeHandleEnum.LOOP && existingEdges) {
    // Check if there's already an edge from this loop handle
    const hasExistingLoopEdge = existingEdges.some(
      (edge) =>
        edge.source === connection.source &&
        edge.sourceHandle === EdgeHandleEnum.LOOP &&
        edge.type !== 'buttonEdge' &&
        !edge.id.startsWith('button-') &&
        // Exclude the edge we're potentially replacing (for reconnections)
        edge.id !== (connection as EdgeType).id
    )
    if (hasExistingLoopEdge) return false
  }

  return true
}
