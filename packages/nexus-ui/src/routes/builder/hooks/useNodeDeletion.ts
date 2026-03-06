import { EdgeHandleEnum } from '@ansible/nexus-contracts'
import type { OnNodesDelete } from '@xyflow/react'
import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'

import { FlowNodeType } from '../../../constants'
import { useWorkflowStoreActions } from '../../../stores/useWorkflowStore'
import { parseTriggerIndex } from '../../../utils/triggerNodeIds'
import type { NodeType } from '../../automations/canvas/nodes/NodeType'
import type { EdgeConnection } from '../types/edge'
import { EdgeFactory } from '../utils/EdgeFactory'
import type { EdgeType } from '../utils/workflowToGraph'

export type LoopReconnection = {
  source: string
  target: string
  targetHandle: string
  sourceHandle?: string
}

export function findLoopReconnections(
  storedEdges: EdgeConnection[],
  deletedNodeIds: Set<string>,
  nodes: NodeType[]
): LoopReconnection[] {
  const loopReconnections: LoopReconnection[] = []

  deletedNodeIds.forEach((deletedNodeId) => {
    const loopBackEdge = storedEdges.find(
      (edge) => edge.source === deletedNodeId && edge.targetHandle === EdgeHandleEnum.END
    )

    if (loopBackEdge && !deletedNodeIds.has(loopBackEdge.target)) {
      const pickIncomingEdge = (targetId: string) => {
        const candidates = storedEdges.filter((edge) => edge.target === targetId)
        return (
          candidates.find(
            (edge) =>
              !deletedNodeIds.has(edge.source) &&
              !(edge.source === loopBackEdge.target && edge.sourceHandle === EdgeHandleEnum.LOOP)
          ) ?? candidates.find((edge) => deletedNodeIds.has(edge.source))
        )
      }

      let cursorTarget = deletedNodeId
      const visited = new Set<string>()
      let incomingEdge = pickIncomingEdge(cursorTarget)

      while (incomingEdge && deletedNodeIds.has(incomingEdge.source) && !visited.has(cursorTarget)) {
        visited.add(cursorTarget)
        cursorTarget = incomingEdge.source
        incomingEdge = pickIncomingEdge(cursorTarget)
      }

      if (incomingEdge && !deletedNodeIds.has(incomingEdge.source)) {
        const isFromLoopNode =
          incomingEdge.source === loopBackEdge.target && incomingEdge.sourceHandle === EdgeHandleEnum.LOOP

        if (!isFromLoopNode) {
          const newLastNode = nodes.find((n) => n.id === incomingEdge.source)
          const sourceHandle = newLastNode?.type === FlowNodeType.LOOP ? EdgeHandleEnum.DONE : EdgeHandleEnum.SOURCE

          loopReconnections.push({
            source: incomingEdge.source,
            target: loopBackEdge.target,
            targetHandle: EdgeHandleEnum.END,
            sourceHandle,
          })
        }
      }
    }
  })

  return loopReconnections
}

interface UseNodeDeletionParams {
  nodes: NodeType[]
  edges: EdgeConnection[]
  setNodes: Dispatch<SetStateAction<NodeType[]>>
  setEdges: Dispatch<SetStateAction<EdgeType[]>>
  isDeletingRef: MutableRefObject<boolean>
  onAddNodeFromEdge?: (sourceNodeId: string, nodeType?: string, activityId?: string, sourceHandle?: string) => void
  onNodesDeleted?: (nodeIds: string[]) => void
}

export function useNodeDeletion({
  nodes,
  edges: storedEdges,
  setNodes,
  setEdges,
  isDeletingRef,
  onAddNodeFromEdge,
  onNodesDeleted,
}: UseNodeDeletionParams) {
  const { batchRemoveNodesAndEdges } = useWorkflowStoreActions()

  const onNodesDelete: OnNodesDelete = useCallback(
    (deletedNodes) => {
      isDeletingRef.current = true
      const deletedNodeIds = new Set(deletedNodes.map((n) => n.id))
      const placeholderIdsToRemove = new Set(deletedNodes.map((n) => `placeholder-${n.id}`))

      const activityIds: string[] = []
      const triggerIndices: number[] = []

      deletedNodes.forEach((node) => {
        if (node.type === FlowNodeType.TRIGGER) {
          const triggerIndex = parseTriggerIndex(node.id)
          if (triggerIndex !== undefined) {
            triggerIndices.push(triggerIndex)
          }
        } else if (node.type !== FlowNodeType.PLACEHOLDER) {
          activityIds.push(node.id)
        }
      })

      const loopReconnections = findLoopReconnections(storedEdges, deletedNodeIds, nodes)

      const filteredEdges = storedEdges.filter(
        (edge) => !deletedNodeIds.has(edge.source) && !deletedNodeIds.has(edge.target)
      )

      // Add loop reconnection edges to the filtered edges
      const edgesWithReconnections = [
        ...filteredEdges,
        ...loopReconnections.map((reconnection) => ({
          id: `${reconnection.source}-${reconnection.target}-end`,
          source: reconnection.source,
          target: reconnection.target,
          sourceHandle: reconnection.sourceHandle,
          targetHandle: reconnection.targetHandle,
        })),
      ]

      // ATOMIC UPDATE: Update workflow and edges in a single transaction to prevent race conditions
      batchRemoveNodesAndEdges({
        nodeIds: activityIds,
        edges: edgesWithReconnections,
        triggerIndices,
      })

      setNodes((currentNodes) => {
        const filtered = currentNodes.filter(
          (node) => !deletedNodeIds.has(node.id) && !placeholderIdsToRemove.has(node.id)
        )
        return filtered
      })

      // CRITICAL: Remove edges connected to deleted nodes to avoid validation errors
      // and ensure ButtonEdges are recreated by useButtonEdgeMaintenance
      // Also add loop reconnection edges
      setEdges((currentEdges) => {
        const filtered = currentEdges.filter(
          (edge) =>
            !deletedNodeIds.has(edge.source) &&
            !deletedNodeIds.has(edge.target) &&
            !placeholderIdsToRemove.has(edge.target)
        )

        // Add loop reconnection edges with proper edge types
        const reconnectionEdges = loopReconnections.map((reconnection) =>
          EdgeFactory.createEdge({
            source: reconnection.source,
            target: reconnection.target,
            sourceHandle: reconnection.sourceHandle,
            targetHandle: reconnection.targetHandle,
            onAddNode: onAddNodeFromEdge,
          })
        )

        return [...filtered, ...reconnectionEdges]
      })

      // Clear deletion flag after all updates complete
      setTimeout(() => {
        isDeletingRef.current = false
      }, 100)

      // Notify parent component about deleted nodes
      if (onNodesDeleted) {
        const deletedIds = Array.from(deletedNodeIds)
        onNodesDeleted(deletedIds)
      }
    },
    [batchRemoveNodesAndEdges, setEdges, setNodes, nodes, storedEdges, onAddNodeFromEdge, onNodesDeleted, isDeletingRef]
  )

  return { onNodesDelete }
}
