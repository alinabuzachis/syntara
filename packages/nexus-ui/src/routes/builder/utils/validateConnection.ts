import type { Connection } from '@xyflow/react'

import type { NodeType } from '../../automations/canvas/nodes/NodeType'

import { isButtonEdge } from './filterHelpers'
import type { EdgeType } from './workflowToGraph'

/**
 * Validates a connection between nodes in the builder.
 * Enforces the restriction that standard nodes can only have one incoming edge,
 * while Join nodes can accept multiple incoming edges.
 */
export function validateConnection(connection: EdgeType | Connection, nodes: NodeType[], edges: EdgeType[]): boolean {
  // Prevent connecting to placeholder nodes
  if (connection.target?.startsWith('placeholder-')) return false

  // Prevent self-connections
  if (connection.source === connection.target) return false

  // Find target node to check its type
  const targetNode = nodes.find((n) => n.id === connection.target)
  const isJoinNode = targetNode?.type === 'join'

  // Join nodes allow multiple incoming edges
  if (isJoinNode) return true

  // For other nodes, check if they already have an incoming edge
  // We ignore button edges and internal system edges
  const hasExistingIncomingEdge = edges.some((edge) => edge.target === connection.target && !isButtonEdge(edge))

  // Block connection if an incoming edge already exists
  return !hasExistingIncomingEdge
}
