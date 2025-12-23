import { useEffect, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react'

import type { NodeType } from '../../automations/canvas/nodes/NodeType'
import type { EdgeType } from '../utils/workflowToGraph'

interface UseNodePositioningParams {
  nodes: NodeType[]
  edges: EdgeType[]
  isInitialized: boolean
  newlyAddedNodeIdsRef: MutableRefObject<Set<string>>
  containerRef: RefObject<HTMLDivElement | null>
  setNodes: Dispatch<SetStateAction<NodeType[]>>
  getViewport: () => { x: number; y: number; zoom: number }
  updateNode: (nodeId: string, updates: { position: { x: number; y: number } }) => void
}

/**
 * Helper function to apply positioned nodes after a delay
 * This ensures ReactFlow updates the node positions immediately
 */
function applyPositionedNodes(
  positionedNodes: Map<string, NodeType>,
  updateNode: (nodeId: string, updates: { position: { x: number; y: number } }) => void
) {
  positionedNodes.forEach((node, nodeId) => {
    updateNode(nodeId, { position: node.position })
  })
}

/**
 * Processes a single node for loop-based positioning
 * Returns the updated node and whether it was positioned
 */
function positionLoopNode(
  node: NodeType,
  newlyAddedNodeIdsRef: MutableRefObject<Set<string>>,
  baseX: number,
  baseY: number,
  loopPositions: Map<string, { x: number; y: number; width: number; height: number }>,
  positionedNodes: Map<string, NodeType>
): NodeType {
  if (
    newlyAddedNodeIdsRef.current.has(node.id) &&
    node.measured &&
    node.position.x === 0 &&
    node.position.y === 0 &&
    node.type === 'loop'
  ) {
    const loopWidth = node.measured?.width ?? 240
    const loopHeight = node.measured?.height ?? 0
    loopPositions.set(node.id, { x: baseX, y: baseY, width: loopWidth, height: loopHeight })
    newlyAddedNodeIdsRef.current.delete(node.id)
    const updatedNode = { ...node, position: { x: baseX, y: baseY } }
    positionedNodes.set(node.id, updatedNode)
    return updatedNode
  }
  return node
}

/**
 * Processes a single node for loop body positioning
 * Returns the updated node if positioned, otherwise returns original
 */
function positionLoopBodyNode(
  node: NodeType,
  newlyAddedNodeIdsRef: MutableRefObject<Set<string>>,
  loopBodyNodeMap: Map<string, string>,
  loopPositions: Map<string, { x: number; y: number; width: number; height: number }>,
  positionedNodes: Map<string, NodeType>
): NodeType {
  if (newlyAddedNodeIdsRef.current.has(node.id) && node.measured && loopBodyNodeMap.has(node.id)) {
    const loopNodeId = loopBodyNodeMap.get(node.id)!
    const loopPos = loopPositions.get(loopNodeId)

    if (loopPos) {
      // Match getLayoutedElements behavior:
      // Body node's top-left Y is positioned at loop node's center Y
      const horizontalSpacing = 50
      const calculatedX = loopPos.x + loopPos.width + horizontalSpacing
      const calculatedY = loopPos.y + loopPos.height / 2

      newlyAddedNodeIdsRef.current.delete(node.id)
      const updatedNode = {
        ...node,
        position: { x: calculatedX, y: calculatedY },
      }
      positionedNodes.set(node.id, updatedNode)
      return updatedNode
    }
  }
  return node
}

/**
 * Custom hook to handle positioning of newly added nodes in the workflow canvas.
 *
 * Handles two positioning strategies:
 * 1. Loop nodes and their body nodes - positioned on left side of viewport with proper spacing
 * 2. Regular nodes - positioned on right side of viewport
 *
 * Loop body nodes are identified by edges with sourceHandle='loop' and positioned
 * relative to their parent loop node with consistent spacing.
 */
export function useNodePositioning({
  nodes,
  edges,
  isInitialized,
  newlyAddedNodeIdsRef,
  containerRef,
  setNodes,
  getViewport,
  updateNode,
}: UseNodePositioningParams) {
  useEffect(() => {
    if (newlyAddedNodeIdsRef.current.size > 0 && isInitialized) {
      // Build a Map of loop body nodes for O(1) lookup instead of O(n) edges.some() calls
      const loopBodyNodeMap = new Map<string, string>() // body node ID -> loop node ID
      edges.forEach((e) => {
        if (e.sourceHandle === 'loop') {
          loopBodyNodeMap.set(e.target, e.source)
        }
      })

      // For loop body nodes, they start with x: 340 (offset), so we check for that OR x: 0
      // For all other nodes, they start with x: 0
      const nodesToPosition = nodes.filter((node) => {
        if (!newlyAddedNodeIdsRef.current.has(node.id) || !node.measured) return false

        // Loop body nodes have an initial offset position (340, 0)
        if (loopBodyNodeMap.has(node.id)) {
          return node.position.x > 0 && node.position.y === 0
        }

        // All other nodes start at (0, 0)
        return node.position.x === 0 && node.position.y === 0
      })

      if (nodesToPosition.length > 0) {
        const hasLoopBodyNodes = nodesToPosition.some((n) => loopBodyNodeMap.has(n.id))

        if (hasLoopBodyNodes) {
          // Two-pass positioning for loop nodes - place on left side of viewport
          const viewport = getViewport()
          const padding = 50
          const baseX = (-viewport.x + padding) / viewport.zoom
          const baseY = (-viewport.y + padding) / viewport.zoom

          setNodes((currentNodes) => {
            const loopPositions = new Map<string, { x: number; y: number; width: number; height: number }>()
            const positionedNodes = new Map<string, NodeType>()

            // Single pass: position both loop nodes and body nodes
            const updatedNodes = currentNodes.map((node) => {
              // First: position loop nodes
              const loopPositioned = positionLoopNode(
                node,
                newlyAddedNodeIdsRef,
                baseX,
                baseY,
                loopPositions,
                positionedNodes
              )
              if (loopPositioned !== node) return loopPositioned

              // Second: position body nodes if their loop was positioned
              return positionLoopBodyNode(node, newlyAddedNodeIdsRef, loopBodyNodeMap, loopPositions, positionedNodes)
            })

            // Force ReactFlow to update the positioned nodes immediately
            if (positionedNodes.size > 0) {
              setTimeout(() => applyPositionedNodes(positionedNodes, updateNode), 100)
            }

            return updatedNodes
          })
        } else {
          // Standard viewport-based positioning for non-loop nodes
          const viewport = getViewport()
          const viewportWidth = containerRef.current?.clientWidth ?? window.innerWidth
          const padding = 50
          const newNodeX = (-viewport.x + viewportWidth - 350 - padding) / viewport.zoom
          const newNodeY = (-viewport.y + padding) / viewport.zoom

          // Build a Set for O(1) lookup
          const nodesToPositionSet = new Set(nodesToPosition.map((n) => n.id))

          setNodes((currentNodes) =>
            currentNodes.map((node) => {
              if (nodesToPositionSet.has(node.id)) {
                newlyAddedNodeIdsRef.current.delete(node.id)
                return { ...node, position: { x: newNodeX, y: newNodeY } }
              }
              return node
            })
          )
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, isInitialized, getViewport, setNodes])
}
