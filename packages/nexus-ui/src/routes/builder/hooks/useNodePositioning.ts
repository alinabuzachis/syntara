import { EdgeHandleEnum } from '@ansible/nexus-contracts'
import { useEffect, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react'

import type { NodeType } from '../../automations/canvas/nodes/NodeType'
import type { FlowPosition } from '../types'
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
  /** When set, place the next new node's left edge at this position (e.g. from [+] click or pending edge drop) */
  desiredPosition: FlowPosition | null
  /** Called after desiredPosition has been applied so it can be cleared */
  onClearDesiredPosition?: () => void
}

/** Returns top-left position so the node's vertical center is at desired.y */
function positionWithCenterAt(desired: FlowPosition, height: number): FlowPosition {
  return { x: desired.x, y: desired.y - height / 2 }
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

interface PositionLoopNodeOptions {
  node: NodeType
  newlyAddedNodeIdsRef: MutableRefObject<Set<string>>
  baseX: number
  baseY: number
  loopPositions: Map<string, { x: number; y: number; width: number; height: number }>
  positionedNodes: Map<string, NodeType>
  overridePosition: FlowPosition | null
}

function positionLoopNode(options: PositionLoopNodeOptions): NodeType {
  const { node, newlyAddedNodeIdsRef, baseX, baseY, loopPositions, positionedNodes, overridePosition } = options
  if (
    newlyAddedNodeIdsRef.current.has(node.id) &&
    node.measured &&
    node.position.x === 0 &&
    node.position.y === 0 &&
    node.type === 'loop'
  ) {
    const loopWidth = node.measured?.width ?? 240
    const loopHeight = node.measured?.height ?? 0
    const position = overridePosition ?? { x: baseX, y: baseY }
    loopPositions.set(node.id, { x: position.x, y: position.y, width: loopWidth, height: loopHeight })
    newlyAddedNodeIdsRef.current.delete(node.id)
    const updatedNode = { ...node, position }
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
      // Body node is positioned to the right and below the loop node
      const horizontalSpacing = 80 // Increased to clear button edge
      const verticalOffset = 100 // Increased for better visual separation
      const calculatedX = loopPos.x + loopPos.width + horizontalSpacing
      const calculatedY = loopPos.y + verticalOffset

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
  desiredPosition,
  onClearDesiredPosition,
}: UseNodePositioningParams) {
  useEffect(() => {
    if (newlyAddedNodeIdsRef.current.size > 0 && isInitialized) {
      // Build a Map of loop body nodes for O(1) lookup instead of O(n) edges.some() calls
      const loopBodyNodeMap = new Map<string, string>() // body node ID -> loop node ID
      edges.forEach((e) => {
        if (e.sourceHandle === EdgeHandleEnum.LOOP) {
          loopBodyNodeMap.set(e.target, e.source)
        }
      })

      // All nodes (including loop body nodes) start at (0, 0)
      // Filter for newly added nodes that haven't been positioned yet
      const nodesToPosition = nodes.filter((node) => {
        if (!newlyAddedNodeIdsRef.current.has(node.id) || !node.measured) return false
        return node.position.x === 0 && node.position.y === 0
      })

      if (nodesToPosition.length > 0) {
        const hasLoopBodyNodes = nodesToPosition.some((n) => loopBodyNodeMap.has(n.id))

        if (hasLoopBodyNodes) {
          // Position loop(s) and body nodes. Use desiredPosition for first loop when set (e.g. from [+] or pending edge).
          const viewport = getViewport()
          const padding = 50
          const baseX = (-viewport.x + padding) / viewport.zoom
          const baseY = (-viewport.y + padding) / viewport.zoom

          const firstLoopNode = nodesToPosition.find((n) => n.type === 'loop')
          const desiredLoopPosition =
            firstLoopNode && desiredPosition != null
              ? positionWithCenterAt(desiredPosition, firstLoopNode.measured?.height ?? 0)
              : null

          setNodes((currentNodes) => {
            const loopPositions = new Map<string, { x: number; y: number; width: number; height: number }>()
            const positionedNodes = new Map<string, NodeType>()
            const overrideForFirstLoop =
              firstLoopNode && desiredLoopPosition ? { nodeId: firstLoopNode.id, position: desiredLoopPosition } : null

            const updatedNodes = currentNodes.map((node) => {
              const overridePosition = node.id === overrideForFirstLoop?.nodeId ? overrideForFirstLoop.position : null
              const loopPositioned = positionLoopNode({
                node,
                newlyAddedNodeIdsRef,
                baseX,
                baseY,
                loopPositions,
                positionedNodes,
                overridePosition,
              })
              if (loopPositioned !== node) return loopPositioned

              return positionLoopBodyNode(node, newlyAddedNodeIdsRef, loopBodyNodeMap, loopPositions, positionedNodes)
            })

            if (positionedNodes.size > 0) {
              setTimeout(() => applyPositionedNodes(positionedNodes, updateNode), 100)
            }

            return updatedNodes
          })

          // Clear desiredPosition when in loop branch so it's not reused (whether we consumed it for firstLoopNode or not)
          if (desiredPosition != null) {
            onClearDesiredPosition?.()
          }
        } else {
          // Standard positioning: use desiredPosition (e.g. [+] or pending edge drop) or fallback to viewport top-right
          const viewport = getViewport()
          const viewportWidth = containerRef.current?.clientWidth ?? window.innerWidth
          const padding = 50
          const viewportX = (-viewport.x + viewportWidth - 350 - padding) / viewport.zoom
          const viewportY = (-viewport.y + padding) / viewport.zoom
          const useDesired = desiredPosition != null
          const firstNodeId = nodesToPosition[0]?.id

          // Build a Set for O(1) lookup
          const nodesToPositionSet = new Set(nodesToPosition.map((n) => n.id))

          setNodes((currentNodes) =>
            currentNodes.map((node) => {
              if (!nodesToPositionSet.has(node.id)) return node
              newlyAddedNodeIdsRef.current.delete(node.id)
              let position: { x: number; y: number }
              if (useDesired && node.id === firstNodeId) {
                position = positionWithCenterAt(desiredPosition, node.measured?.height ?? 0)
              } else {
                position = { x: viewportX, y: viewportY }
              }
              return { ...node, position }
            })
          )

          if (useDesired && firstNodeId) {
            onClearDesiredPosition?.()
          }
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, isInitialized, getViewport, setNodes, desiredPosition, onClearDesiredPosition])
}
