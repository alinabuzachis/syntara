import { EdgeHandleEnum } from '@ansible/nexus-contracts'
import Dagre from '@dagrejs/dagre'

import type { NodeType } from '../../workflows/canvas/nodes/NodeType'

import { filterRealEdges, filterRealNodes } from './filterHelpers'
import type { EdgeType } from './workflowToGraph'

type DagreNodeLabel = {
  x: number
  y: number
}

function isDagreNodeLabel(value: unknown): value is DagreNodeLabel {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.x === 'number' && typeof v.y === 'number'
}

/**
 * Type-safe wrapper around dagre's `graph.node()` which is typed as `any`.
 * After `Dagre.layout()`, every node label is guaranteed to carry x/y coords.
 */
function getNodeLabel(g: Dagre.graphlib.Graph, nodeId: string): DagreNodeLabel {
  const raw: unknown = g.node(nodeId)
  if (!isDagreNodeLabel(raw)) {
    throw new Error(`Missing Dagre coordinates for node "${nodeId}"`)
  }
  return raw
}

const markerEnd = { type: 'arrowclosed' as const }

type LayoutOptions = {
  direction: 'TB' | 'LR'
}

type LoopBodyPosition = {
  x: number
  y: number
}

type BodyNodeWithPosition = {
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
    const loopPositionCenter = getNodeLabel(g, loopId) // Dagre returns CENTER coordinates
    const loopWidth = loopNode?.measured?.width ?? 0
    const loopHeight = loopNode?.measured?.height ?? 0

    // Convert dagre CENTER coordinates to React Flow TOP-LEFT coordinates
    const loopX = loopPositionCenter.x - loopWidth / 2
    const loopY = loopPositionCenter.y - loopHeight / 2

    // Get all body nodes with their Dagre positions (maintain dagre order)
    const bodyNodesWithPositions: BodyNodeWithPosition[] = bodyNodeIds
      .map((nodeId) => {
        const node = realNodes.find((n) => n.id === nodeId)
        const position = getNodeLabel(g, nodeId)
        return {
          nodeId,
          width: node?.measured?.width ?? 0,
          height: node?.measured?.height ?? 0,
          dagreX: position.x,
        }
      })
      .sort((a, b) => a.dagreX - b.dagreX)

    // Position nodes to the right of loop node AND below it to fit inside the loop boundary
    const horizontalSpacing = 80 // Space to the right of loop node (increased to clear button edge)
    const nodeSpacing = 40 // Spacing between consecutive nodes
    const verticalOffset = 100 // Space below loop node's top edge (increased for better visual separation)

    // Start position: to the right of loop node's right edge, below the loop node
    // X: loop's left edge + loop width + spacing
    // Y: loop's top edge + vertical offset (positions node below loop visually)
    let currentX = loopX + loopWidth + horizontalSpacing
    const baseY = loopY + verticalOffset

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
 * Identify loop structures and their body nodes
 */
function identifyLoopStructures(realNodes: NodeType[], realEdges: EdgeType[]) {
  const loopBodyNodes = new Set<string>()
  const loopParents = new Map<string, string>() // Map: nodeId -> loopNodeId
  const loopBodies = new Map<string, string[]>() // Map: loopNodeId -> array of body node IDs

  realNodes.forEach((node) => {
    if (node.type === 'loop') {
      // Find all edges from this loop's 'loop' handle
      const loopEdges = realEdges.filter((e) => e.source === node.id && e.sourceHandle === EdgeHandleEnum.LOOP)
      const bodyNodeIds: string[] = []

      loopEdges.forEach((loopEdge) => {
        // Traverse from loop edge to find all nodes that connect back to loop's end handle
        const visited = new Set<string>()
        const queue: string[] = [loopEdge.target]

        // SECURITY: Secondary iteration limit as defense-in-depth (visited set is primary defense)
        const MAX_ITERATIONS = 10_000
        let iterations = 0

        while (queue.length > 0 && iterations < MAX_ITERATIONS) {
          iterations++
          const nodeId = queue.shift()!
          if (visited.has(nodeId)) continue
          visited.add(nodeId)

          loopBodyNodes.add(nodeId)
          loopParents.set(nodeId, node.id)
          bodyNodeIds.push(nodeId)

          // SECURITY: Domain-invariant check — loop body can't exceed total node count
          if (loopBodyNodes.size > realNodes.length) {
            break
          }

          // Find outgoing edges (but don't follow edges back to the loop node)
          // We exclude ANY edge that points back to the loop node to prevent circular traversal
          const outgoing = realEdges.filter(
            (e) => e.source === nodeId && e.sourceHandle === EdgeHandleEnum.SOURCE && e.target !== node.id // Don't follow edges back to the loop node itself
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
 * Build map of conditional/approval branch nodes and their desired ordering
 */
function buildBranchNodeOrdering(edges: EdgeType[]): Map<string, { top?: string; bottom?: string }> {
  const branchNodeOrdering = new Map<string, { top?: string; bottom?: string }>()

  edges.forEach((edge) => {
    if (edge.sourceHandle === EdgeHandleEnum.TRUE || edge.sourceHandle === EdgeHandleEnum.APPROVED) {
      const existing = branchNodeOrdering.get(edge.source) ?? {}
      branchNodeOrdering.set(edge.source, { ...existing, top: edge.target })
    } else if (edge.sourceHandle === EdgeHandleEnum.FALSE || edge.sourceHandle === EdgeHandleEnum.REJECTED) {
      const existing = branchNodeOrdering.get(edge.source) ?? {}
      branchNodeOrdering.set(edge.source, { ...existing, bottom: edge.target })
    }
  })

  return branchNodeOrdering
}

/**
 * Correct Y position for branch nodes if Dagre swapped their vertical order
 */
function correctBranchNodePosition(
  nodeId: string,
  baseY: number,
  nodeHeight: number,
  branchNodeOrdering: Map<string, { top?: string; bottom?: string }>,
  g: Dagre.graphlib.Graph
): number {
  // Find if this node is part of a branch pair
  for (const branches of branchNodeOrdering.values()) {
    if (branches.top !== nodeId && branches.bottom !== nodeId) continue

    const topNodeId = branches.top
    const bottomNodeId = branches.bottom

    if (!topNodeId || !bottomNodeId) return baseY

    const topPos = getNodeLabel(g, topNodeId)
    const bottomPos = getNodeLabel(g, bottomNodeId)

    // If Dagre swapped them (bottom node has lower Y than top node), fix it
    if (bottomPos.y >= topPos.y) return baseY

    // Swap their Y positions
    if (nodeId === topNodeId) {
      return bottomPos.y - nodeHeight / 2
    }
    if (nodeId === bottomNodeId) {
      return topPos.y - nodeHeight / 2
    }
  }

  return baseY
}

/**
 * Applies Dagre layout algorithm to position nodes in a hierarchical flow
 * with special handling for loop structures
 */
export function getLayoutedElements(nodes: NodeType[], edges: EdgeType[], options: LayoutOptions) {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}))
  // Enable ranker: 'tight-tree' for better control over node ordering
  g.setGraph({ rankdir: options.direction, ranksep: 120, ranker: 'tight-tree' })

  const realNodes = filterRealNodes(nodes)
  const realEdges = filterRealEdges(edges)

  // Identify loop structures - find nodes in loop bodies
  const { loopBodyNodes, loopBodies } = identifyLoopStructures(realNodes, realEdges)

  // For layout purposes, exclude loop-back edges (edges to loop's end handle)
  // This prevents Dagre from trying to create a circular layout
  const layoutEdges = realEdges.filter((edge) => edge.targetHandle !== 'end')

  // Add edges to Dagre with weights to control visual ordering
  // For condition nodes: 'true' branch gets higher weight to appear on top
  // For approval nodes: 'approved' branch gets higher weight to appear on top
  layoutEdges.forEach((edge) => {
    const edgeConfig: { weight?: number } = {}

    // Assign weights to control branch ordering:
    // - 'true' and 'approved' branches: weight 2 (prefer top/straight)
    // - 'false' and 'rejected' branches: weight 1 (prefer bottom/bent)
    if (edge.sourceHandle === EdgeHandleEnum.TRUE || edge.sourceHandle === EdgeHandleEnum.APPROVED) {
      edgeConfig.weight = 2
    } else if (edge.sourceHandle === EdgeHandleEnum.FALSE || edge.sourceHandle === EdgeHandleEnum.REJECTED) {
      edgeConfig.weight = 1
    }

    g.setEdge(edge.source, edge.target, edgeConfig)
  })
  realNodes.forEach((node) => {
    // Use actual node width for Dagre layout
    // Loop body nodes are positioned manually, so we don't need to account for them in Dagre's width calculation
    // This ensures consistent edge spacing between all nodes
    const width = node.measured?.width ?? 0
    g.setNode(node.id, {
      ...node,
      width,
      height: node.measured?.height ?? 0,
    })
  })

  Dagre.layout(g)

  // Calculate positions for loop body nodes (right and below the loop node)
  const loopBodyPositions = calculateLoopBodyPositions(loopBodies, realNodes, g)

  // Build map of conditional/approval branch nodes and their desired ordering
  const branchNodeOrdering = buildBranchNodeOrdering(realEdges)

  return {
    nodes: nodes.map((node) => {
      if (!node.id.startsWith('placeholder-')) {
        const position = getNodeLabel(g, node.id)
        const nodeWidth = node.measured?.width ?? 0
        const nodeHeight = node.measured?.height ?? 0
        let x = position.x - nodeWidth / 2
        let y = position.y - nodeHeight / 2

        // Use pre-calculated positions for loop body nodes
        if (loopBodyNodes.has(node.id)) {
          const centeredPos = loopBodyPositions.get(node.id)
          if (centeredPos) {
            x = centeredPos.x
            y = centeredPos.y
          }
        }

        // Adjust Y position for conditional/approval branch nodes to maintain visual order
        y = correctBranchNodePosition(node.id, y, nodeHeight, branchNodeOrdering, g)

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
