import type { Activity } from '@ansible/nexus-contracts'

import type { EdgeConnection } from '../../../types/edge'
import type { ValidationError } from '../types'

/**
 * Validates that all nodes are connected to the workflow graph.
 *
 * A node is considered "dangling" if it has no incoming or outgoing edges.
 *
 * Note: In the new architecture, parallel containers don't exist in the builder format,
 * so all activities are validated equally.
 */
export function validateNoDanglingNodes(activities: Activity[], edges: EdgeConnection[]): ValidationError[] {
  const errors: ValidationError[] = []

  // Build adjacency map for graph traversal
  const adjacencyMap = new Map<string, Set<string>>()
  edges.forEach((edge) => {
    if (!adjacencyMap.has(edge.source)) {
      adjacencyMap.set(edge.source, new Set())
    }
    adjacencyMap.get(edge.source)!.add(edge.target)
  })

  // Also build reverse adjacency map to check for incoming edges
  const reverseAdjacencyMap = new Map<string, Set<string>>()
  edges.forEach((edge) => {
    if (!reverseAdjacencyMap.has(edge.target)) {
      reverseAdjacencyMap.set(edge.target, new Set())
    }
    reverseAdjacencyMap.get(edge.target)!.add(edge.source)
  })

  // Find all reachable nodes by traversing from any node with no incoming edges
  // (these are the entry points - could be triggers or other starting nodes)
  const reachable = new Set<string>()
  const entryNodes = activities
    .map((a) => a.id)
    .filter((id) => !reverseAdjacencyMap.has(id) || reverseAdjacencyMap.get(id)!.size === 0)

  // BFS traversal from all entry nodes
  const queue = [...entryNodes]
  const visited = new Set<string>()

  while (queue.length > 0) {
    const nodeId = queue.shift()!
    if (visited.has(nodeId)) continue
    visited.add(nodeId)
    reachable.add(nodeId)

    const neighbors = adjacencyMap.get(nodeId) ?? new Set()
    neighbors.forEach((neighbor) => {
      if (!visited.has(neighbor)) {
        queue.push(neighbor)
      }
    })
  }

  // Check each activity
  for (const activity of activities) {
    // A node is dangling if it has NO connections (neither incoming nor outgoing)
    const hasIncomingEdges = reverseAdjacencyMap.has(activity.id) && reverseAdjacencyMap.get(activity.id)!.size > 0
    const hasOutgoingEdges = adjacencyMap.has(activity.id) && adjacencyMap.get(activity.id)!.size > 0

    if (!hasIncomingEdges && !hasOutgoingEdges) {
      // Node is completely isolated - dangling
      errors.push({
        id: `dangling-${activity.id}`,
        severity: 'error',
        rule: 'no-dangling-nodes',
        message: `Node "${activity.name || activity.id}" is not connected to the workflow`,
        nodeId: activity.id,
        suggestion: "Connect this node to other nodes in the workflow, or remove it if it's not needed",
      })
    }
  }

  return errors
}
