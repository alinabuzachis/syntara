import type { NodeType } from '../../workflows/canvas/nodes/NodeType'

import type { EdgeType } from './workflowToGraph'

/**
 * Detects which task nodes are in loop-back paths
 *
 * NOTE: Loop nodes no longer use handle reversal for their body nodes.
 * Loop bodies use standard handle orientation (source on right, target on left).
 * This function now returns an empty set but is kept for potential future use.
 *
 * @param _edges - All edges in the workflow (unused)
 * @param _nodes - All nodes in the workflow (unused)
 * @returns Set of node IDs that should have reversed handles (currently always empty)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function detectLoopBackNodes(_edges: EdgeType[], _nodes: NodeType[]): Set<string> {
  // No nodes should have reversed handles - loop nodes use standard orientation
  return new Set<string>()
}
