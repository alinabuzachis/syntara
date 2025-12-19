import Dagre from '@dagrejs/dagre'

import { filterRealEdges, filterRealNodes } from './filterHelpers'
import type { EdgeType, NodeType } from './workflowToGraph'

const markerEnd = { type: 'arrowclosed' as const }

interface LayoutOptions {
  direction: 'TB' | 'LR'
}

interface LoopBodyPosition {
  x: number
  y: number
}

interface BodyNodeWithPosition {
  nodeId: string
  width: number
  height: number
  dagreX: number
}

/**
 * Calculate loop body node positions relative to their parent loop node
 */
function calculateLoopBodyPositions(
  loopBodies: Map<string, string[]>,
  realNodes: NodeType[],
  g: Dagre.graphlib.Graph
): Map<string, LoopBodyPosition> {
  const loopBodyPositions = new Map<string, LoopBodyPosition>()

  loopBodies.forEach((bodyNodeIds, loopId) => {
    const loopNode = realNodes.find((n) => n.id === loopId)
    const loopPosition = g.node(loopId)
    const loopWidth = loopNode?.measured?.width ?? 0

    // Get all body nodes with their Dagre positions (maintain dagre order)
    const bodyNodesWithPositions: BodyNodeWithPosition[] = bodyNodeIds
      .map((nodeId) => {
        const node = realNodes.find((n) => n.id === nodeId)
        const position = g.node(nodeId)
        return {
          nodeId,
          width: node?.measured?.width ?? 0,
          height: node?.measured?.height ?? 0,
          dagreX: position.x,
        }
      })
      .sort((a, b) => a.dagreX - b.dagreX)

    // Position nodes completely to the right of the loop node (same vertical center)
    const horizontalSpacing = 50 // Space to the right of loop node (compact)
    const nodeSpacing = 40 // Spacing between consecutive nodes (increased for readability)

    // Start position: to the right of loop node, vertically centered with loop
    let currentX = loopPosition.x + loopWidth / 2 + horizontalSpacing
    const baseY = loopPosition.y // Same vertical position as loop node center

    // Assign positions to each body node (flowing left to right)
    bodyNodesWithPositions.forEach((bodyNode) => {
      loopBodyPositions.set(bodyNode.nodeId, {
        x: currentX,
        y: baseY,
      })
      currentX += bodyNode.width + nodeSpacing
    })
  })

  return loopBodyPositions
}

/**
 * Calculate total widths for loop nodes including their body nodes
 */
function calculateLoopWidths(loopBodies: Map<string, string[]>, realNodes: NodeType[]): Map<string, number> {
  const loopWidths = new Map<string, number>()

  loopBodies.forEach((bodyNodeIds, loopId) => {
    const loopNode = realNodes.find((n) => n.id === loopId)
    const loopWidth = loopNode?.measured?.width ?? 0

    // Calculate total width of loop body nodes
    let totalBodyWidth = 0
    bodyNodeIds.forEach((nodeId) => {
      const bodyNode = realNodes.find((n) => n.id === nodeId)
      totalBodyWidth += bodyNode?.measured?.width ?? 0
    })

    // Add spacing: initial gap + spacing between nodes
    const horizontalSpacing = 50
    const nodeSpacing = 40
    const spacingWidth = horizontalSpacing + Math.max(0, bodyNodeIds.length - 1) * nodeSpacing

    // Total width = loop width + spacing + body nodes width
    const totalWidth = loopWidth + spacingWidth + totalBodyWidth
    loopWidths.set(loopId, totalWidth)
  })

  return loopWidths
}

/**
 * Identify loop structures and their body nodes
 */
function identifyLoopStructures(realNodes: NodeType[], realEdges: EdgeType[]) {
  const loopBodyNodes = new Set<string>()
  const loopParents = new Map<string, string>() // Map: nodeId -> loopNodeId
  const loopBodies = new Map<string, string[]>() // Map: loopNodeId -> array of body node IDs

  realNodes.forEach((node) => {
    if (node.type === 'loop') {
      // Find all edges from this loop's 'loop' handle
      const loopEdges = realEdges.filter((e) => e.source === node.id && e.sourceHandle === 'loop')
      const bodyNodeIds: string[] = []

      loopEdges.forEach((loopEdge) => {
        // Traverse from loop edge to find all nodes that connect back to loop's end handle
        const visited = new Set<string>()
        const queue: string[] = [loopEdge.target]

        while (queue.length > 0) {
          const nodeId = queue.shift()!
          if (visited.has(nodeId)) continue
          visited.add(nodeId)

          loopBodyNodes.add(nodeId)
          loopParents.set(nodeId, node.id)
          bodyNodeIds.push(nodeId)

          // Find outgoing edges (but don't follow edges back to loop's end)
          const outgoing = realEdges.filter(
            (e) =>
              e.source === nodeId && e.sourceHandle === 'source' && !(e.target === node.id && e.targetHandle === 'end')
          )

          outgoing.forEach((e) => {
            if (!visited.has(e.target)) {
              queue.push(e.target)
            }
          })
        }
      })

      if (bodyNodeIds.length > 0) {
        loopBodies.set(node.id, bodyNodeIds)
      }
    }
  })

  return { loopBodyNodes, loopParents, loopBodies }
}

/**
 * Applies Dagre layout algorithm to position nodes in a hierarchical flow
 * with special handling for loop structures
 */
export function getLayoutedElements(nodes: NodeType[], edges: EdgeType[], options: LayoutOptions) {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: options.direction, ranksep: 120 })

  const realNodes = filterRealNodes(nodes)
  const realEdges = filterRealEdges(edges)

  // Identify loop structures - find nodes in loop bodies
  const { loopBodyNodes, loopBodies } = identifyLoopStructures(realNodes, realEdges)

  // For layout purposes, exclude loop-back edges (edges to loop's end handle)
  // This prevents Dagre from trying to create a circular layout
  const layoutEdges = realEdges.filter((edge) => edge.targetHandle !== 'end')

  // Calculate the total width needed for loop nodes (including their body nodes)
  const loopWidths = calculateLoopWidths(loopBodies, realNodes)

  layoutEdges.forEach((edge) => g.setEdge(edge.source, edge.target))
  realNodes.forEach((node) => {
    // Use extended width for loop nodes to account for their body nodes
    const width = loopWidths.get(node.id) ?? node.measured?.width ?? 0
    g.setNode(node.id, {
      ...node,
      width,
      height: node.measured?.height ?? 0,
    })
  })

  Dagre.layout(g)

  // Calculate positions for loop body nodes (right and below the loop node)
  const loopBodyPositions = calculateLoopBodyPositions(loopBodies, realNodes, g)

  return {
    nodes: nodes.map((node) => {
      if (!node.id.startsWith('placeholder-')) {
        const position = g.node(node.id)
        let x = position.x - (node.measured?.width ?? 0) / 2
        let y = position.y - (node.measured?.height ?? 0) / 2

        // Use pre-calculated centered positions for loop body nodes
        if (loopBodyNodes.has(node.id)) {
          const centeredPos = loopBodyPositions.get(node.id)
          if (centeredPos) {
            x = centeredPos.x
            y = centeredPos.y
          }
        }

        // Add className for loop body nodes to match loop node width
        const isLoopBodyNode = loopBodyNodes.has(node.id)
        return {
          ...node,
          position: { x, y },
          className: isLoopBodyNode ? 'min-w-[300px]' : node.className,
        }
      }
      return node
    }),
    edges: edges.map((edge) => ({ ...edge, markerEnd })),
  }
}
