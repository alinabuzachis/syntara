import type { NodeType } from '../../automations/canvas/nodes/NodeType'

import type { EdgeType } from './workflowToGraph'

/**
 * Detects which task nodes are in loop-back paths
 * A node is in a loop-back path if:
 * 1. It receives an edge FROM a loop node's 'loop' handle
 * 2. It (or a node it leads to) connects back TO the same loop node's 'end' handle
 *
 * All nodes in the path from loop → end should have reversed handles.
 *
 * @param edges - All edges in the workflow
 * @param nodes - All nodes in the workflow
 * @returns Set of node IDs that should have reversed handles
 */
export function detectLoopBackNodes(edges: EdgeType[], nodes: NodeType[]): Set<string> {
  const loopBackNodeIds = new Set<string>()

  // Find all loop nodes
  const loopNodes = nodes.filter((n) => n.type === 'loop')

  loopNodes.forEach((loopNode) => {
    // Find all edges FROM the loop node's 'loop' handle
    const loopOutgoingEdges = edges.filter((e) => e.source === loopNode.id && e.sourceHandle === 'loop')

    loopOutgoingEdges.forEach((loopEdge) => {
      const targetNodeId = loopEdge.target

      // Collect all nodes in the path from loop to end
      const nodesInPath = new Set<string>()
      const hasPathBackToLoop = collectNodesInLoopPath(targetNodeId, loopNode.id, edges, new Set(), nodesInPath)

      if (hasPathBackToLoop) {
        // Mark all nodes in the path for handle reversal
        nodesInPath.forEach((nodeId) => loopBackNodeIds.add(nodeId))
      }
    })
  })

  return loopBackNodeIds
}

/**
 * Recursively checks if there's a path from a node back to a loop node's 'end' handle
 * and collects all nodes in that path.
 *
 * @param currentNodeId - Current node being examined
 * @param loopNodeId - The loop node we're trying to reach
 * @param edges - All edges in the workflow
 * @param visited - Set of visited nodes (to avoid infinite loops)
 * @param nodesInPath - Set to collect all nodes that are part of the loop-back path
 * @returns True if there's a path back to the loop's end handle
 */
function collectNodesInLoopPath(
  currentNodeId: string,
  loopNodeId: string,
  edges: EdgeType[],
  visited: Set<string>,
  nodesInPath: Set<string>
): boolean {
  // Avoid infinite loops
  if (visited.has(currentNodeId)) {
    return false
  }
  visited.add(currentNodeId)

  // Find all edges FROM the current node
  const outgoingEdges = edges.filter((e) => e.source === currentNodeId)

  for (const edge of outgoingEdges) {
    // Check if this edge connects directly to the loop's 'end' handle
    if (edge.target === loopNodeId && edge.targetHandle === 'end') {
      // Found the path! Add current node to the path
      nodesInPath.add(currentNodeId)
      return true
    }

    // Recursively check if any downstream node connects to the loop
    if (collectNodesInLoopPath(edge.target, loopNodeId, edges, visited, nodesInPath)) {
      // This node is part of the path - add it
      nodesInPath.add(currentNodeId)
      return true
    }
  }

  return false
}
