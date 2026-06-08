import { EdgeHandleEnum } from '@ansible/nexus-contracts'

import { FlowNodeType } from '../../../constants'
import type { ButtonEdgePlaceholderNode, NodeType } from '../../workflows/canvas/nodes/NodeType'

export type HandlePositionConfig = {
  yOffset: number
  xOffset?: number
}

export function createButtonEdgePlaceholderNode(params: {
  id: string
  position: { x: number; y: number }
}): ButtonEdgePlaceholderNode {
  return {
    id: params.id,
    type: FlowNodeType.PLACEHOLDER,
    position: params.position,
    data: {},
    draggable: false,
    selectable: false,
  }
}

export type ProcessMultiHandleNodeOptions = {
  node: NodeType
  handles: readonly string[]
  handlePositions: Record<string, HandlePositionConfig>
  connectedHandles: Map<string, Set<string>>
  pendingEdge: { sourceNodeId: string; sourceHandle?: string } | null
  nodes: NodeType[]
  handlesNeedingButtonEdges: { nodeId: string; handleId: string }[]
  placeholderNodesToAdd: ButtonEdgePlaceholderNode[]
}

export function processMultiHandleNode(options: ProcessMultiHandleNodeOptions) {
  const {
    node,
    handles,
    handlePositions,
    connectedHandles,
    pendingEdge,
    nodes,
    handlesNeedingButtonEdges,
    placeholderNodesToAdd,
  } = options
  handles.forEach((handleId) => {
    const handleConnected = connectedHandles.get(node.id)?.has(handleId) ?? false
    const hasPendingEdge = pendingEdge?.sourceNodeId === node.id && pendingEdge?.sourceHandle === handleId

    if (!handleConnected && !hasPendingEdge) {
      handlesNeedingButtonEdges.push({ nodeId: node.id, handleId })

      const placeholderId = `placeholder-${node.id}-${handleId}`
      const placeholderExists = nodes.some((n) => n.id === placeholderId)

      if (!placeholderExists) {
        const positionConfig = handlePositions[handleId]
        const yOffset = positionConfig.yOffset
        const xOffset = positionConfig.xOffset ?? 200
        placeholderNodesToAdd.push(
          createButtonEdgePlaceholderNode({
            id: placeholderId,
            position: { x: node.position.x + xOffset, y: node.position.y + yOffset },
          })
        )
      }
    }
  })
}

export function mergeNewPlaceholderNodes(
  placeholders: ButtonEdgePlaceholderNode[],
  currentNodes: NodeType[]
): NodeType[] {
  const existingIds = new Set(currentNodes.map((n) => n.id))
  const nodesToAdd = placeholders.filter((n) => !existingIds.has(n.id))
  return nodesToAdd.length > 0 ? [...currentNodes, ...nodesToAdd] : currentNodes
}

export type ButtonEdgeFilterContext = {
  conditionHandles: { nodeId: string; handleId: string }[]
  loopHandles: { nodeId: string; handleId: string }[]
  approvalHandles: { nodeId: string; handleId: string }[]
  regularNodeIds: string[]
  activeNodeId: string | null
  activeHandle: string | null
}

export function getKeptButtonEdge<
  T extends { source: string; sourceHandle?: string | null; data?: Record<string, unknown> },
>(edge: T, ctx: ButtonEdgeFilterContext): (T & { data: Record<string, unknown> }) | null {
  const handleId = edge.sourceHandle

  if (handleId === EdgeHandleEnum.TRUE || handleId === EdgeHandleEnum.FALSE) {
    const isNeeded = ctx.conditionHandles.some((h) => h.nodeId === edge.source && h.handleId === handleId)
    if (!isNeeded) return null
    return {
      ...edge,
      data: {
        ...edge.data,
        isActive: ctx.activeNodeId === edge.source && ctx.activeHandle === handleId,
      },
    }
  }

  if (handleId === EdgeHandleEnum.DONE || handleId === EdgeHandleEnum.LOOP) {
    const isNeeded = ctx.loopHandles.some((h) => h.nodeId === edge.source && h.handleId === handleId)
    if (!isNeeded) return null
    return {
      ...edge,
      data: {
        ...edge.data,
        isActive: ctx.activeNodeId === edge.source && ctx.activeHandle === handleId,
      },
    }
  }

  if (handleId === EdgeHandleEnum.APPROVED || handleId === EdgeHandleEnum.REJECTED) {
    const isNeeded = ctx.approvalHandles.some((h) => h.nodeId === edge.source && h.handleId === handleId)
    if (!isNeeded) return null
    return {
      ...edge,
      data: {
        ...edge.data,
        isActive: ctx.activeNodeId === edge.source && ctx.activeHandle === handleId,
      },
    }
  }

  if ((handleId === EdgeHandleEnum.SOURCE || !handleId) && ctx.regularNodeIds.includes(edge.source)) {
    return {
      ...edge,
      data: {
        ...edge.data,
        isActive: ctx.activeNodeId === edge.source && (ctx.activeHandle === EdgeHandleEnum.SOURCE || !ctx.activeHandle),
      },
    }
  }

  return null
}
