import { EdgeHandleEnum } from '@ansible/nexus-contracts'
import { useEffect, useMemo, useRef } from 'react'
import { flushSync } from 'react-dom'

import { FlowNodeType } from '../../../constants'
import type { ButtonEdgePlaceholderNode, NodeType } from '../../automations/canvas/nodes/NodeType'
import type { FlowPosition } from '../types'
import { filterButtonEdges, filterRealNodes, isRealEdge } from '../utils/filterHelpers'
import type { EdgeType } from '../utils/workflowToGraph'

import {
  createButtonEdgePlaceholderNode,
  mergeNewPlaceholderNodes,
  processMultiHandleNode,
} from './buttonEdgeMaintenanceHelpers'
import { computeNextButtonEdges, updateNodesForButtonEdgeClasses } from './computeButtonEdgesUpdate'

interface UseButtonEdgeMaintenanceOptions {
  nodes: NodeType[]
  edges: EdgeType[]
  isInitialized: boolean
  activeEdgeButtonNodeId: string | null
  activeEdgeButtonHandle: string | null
  onAddNodeFromEdge?: (
    sourceNodeId: string,
    targetNodeId?: string,
    edgeId?: string,
    sourceHandle?: string,
    desiredPosition?: FlowPosition
  ) => void
  pendingEdge: { sourceNodeId: string; sourceHandle?: string; x: number; y: number } | null
  setNodes: React.Dispatch<React.SetStateAction<NodeType[]>>
  setEdges: React.Dispatch<React.SetStateAction<EdgeType[]>>
  executionStatus: string | null
}

/**
 * Outgoing real edges per source node (excludes button + pending edges).
 * Only `edge.source` / `sourceHandle` matter here: incoming edges must not hide the need for a button edge.
 */
function buildConnectedHandlesMap(edges: EdgeType[]): Map<string, Set<string>> {
  const connectedHandles = new Map<string, Set<string>>()
  for (const edge of edges) {
    if (!isRealEdge(edge)) {
      continue
    }
    const handle = edge.sourceHandle ?? EdgeHandleEnum.SOURCE
    let handleSet = connectedHandles.get(edge.source)
    if (!handleSet) {
      handleSet = new Set()
      connectedHandles.set(edge.source, handleSet)
    }
    handleSet.add(handle)
  }
  return connectedHandles
}

interface RunButtonEdgeMaintenanceWorkArgs {
  nodes: NodeType[]
  edges: EdgeType[]
  pendingEdge: { sourceNodeId: string; sourceHandle?: string; x: number; y: number } | null
  setNodes: React.Dispatch<React.SetStateAction<NodeType[]>>
  setEdges: React.Dispatch<React.SetStateAction<EdgeType[]>>
  activeEdgeButtonNodeId: string | null
  activeEdgeButtonHandle: string | null
  onAddNodeFromEdge?: UseButtonEdgeMaintenanceOptions['onAddNodeFromEdge']
}

/**
 * Deferred button-edge work (runs inside the effect timeout). Extracted to module scope so the
 * effect callback stays shallow and nested-function depth stays within tooling limits.
 *
 * Order matters: placeholder nodes must exist in React Flow before button edges reference them
 * (`flushSync` + `setNodes` first when needed), then `setEdges`, then node class updates.
 */
function runButtonEdgeMaintenanceWork({
  nodes,
  edges,
  pendingEdge,
  setNodes,
  setEdges,
  activeEdgeButtonNodeId,
  activeEdgeButtonHandle,
  onAddNodeFromEdge,
}: RunButtonEdgeMaintenanceWorkArgs): void {
  const realNodes = filterRealNodes(nodes)
  if (realNodes.length === 0) {
    return
  }

  const nodesNeedingButtonEdges: string[] = []
  const placeholderNodesToAdd: ButtonEdgePlaceholderNode[] = []
  const connectedHandles = buildConnectedHandlesMap(edges)

  const conditionHandlesNeedingButtonEdges: { nodeId: string; handleId: string }[] = []
  const loopHandlesNeedingButtonEdges: { nodeId: string; handleId: string }[] = []
  const approvalHandlesNeedingButtonEdges: { nodeId: string; handleId: string }[] = []

  const existingNodeIds = new Set(nodes.map((node) => node.id))

  for (const node of realNodes) {
    const isConditionNode = node.type === FlowNodeType.CONDITION
    const isLoopNode = node.type === FlowNodeType.LOOP
    const isApprovalNode = node.type === FlowNodeType.APPROVAL

    if (isConditionNode) {
      processMultiHandleNode({
        node,
        handles: [EdgeHandleEnum.TRUE, EdgeHandleEnum.FALSE] as const,
        handlePositions: {
          [EdgeHandleEnum.TRUE]: { yOffset: -30 },
          [EdgeHandleEnum.FALSE]: { yOffset: 30 },
        },
        connectedHandles,
        pendingEdge,
        nodes,
        handlesNeedingButtonEdges: conditionHandlesNeedingButtonEdges,
        placeholderNodesToAdd,
      })
      continue
    }

    if (isApprovalNode) {
      processMultiHandleNode({
        node,
        handles: [EdgeHandleEnum.APPROVED, EdgeHandleEnum.REJECTED] as const,
        handlePositions: {
          [EdgeHandleEnum.APPROVED]: { yOffset: -30 },
          [EdgeHandleEnum.REJECTED]: { yOffset: 30 },
        },
        connectedHandles,
        pendingEdge,
        nodes,
        handlesNeedingButtonEdges: approvalHandlesNeedingButtonEdges,
        placeholderNodesToAdd,
      })
      continue
    }

    if (isLoopNode) {
      processMultiHandleNode({
        node,
        handles: [EdgeHandleEnum.DONE, EdgeHandleEnum.LOOP] as const,
        handlePositions: {
          [EdgeHandleEnum.DONE]: { yOffset: -30 },
          [EdgeHandleEnum.LOOP]: { yOffset: 30 },
        },
        connectedHandles,
        pendingEdge,
        nodes,
        handlesNeedingButtonEdges: loopHandlesNeedingButtonEdges,
        placeholderNodesToAdd,
      })
      continue
    }

    const sourceHandleConnected = connectedHandles.get(node.id)?.has(EdgeHandleEnum.SOURCE) ?? false
    const hasPendingEdge = pendingEdge?.sourceNodeId === node.id
    const shouldHaveButtonEdge = !sourceHandleConnected && !hasPendingEdge

    if (!shouldHaveButtonEdge) {
      continue
    }

    nodesNeedingButtonEdges.push(node.id)

    // A button edge can still exist in state after its placeholder was removed; (re)add the placeholder.
    const placeholderId = `placeholder-${node.id}`
    if (existingNodeIds.has(placeholderId)) {
      continue
    }

    placeholderNodesToAdd.push(
      createButtonEdgePlaceholderNode({
        id: placeholderId,
        position: { x: node.position.x + 200, y: node.position.y },
      })
    )
  }

  // Placeholders first: React Flow drops edges to missing targets. flushSync commits nodes before setEdges runs.
  if (placeholderNodesToAdd.length > 0) {
    flushSync(() => {
      setNodes((currentNodes) => mergeNewPlaceholderNodes(placeholderNodesToAdd, currentNodes))
    })
  }

  setEdges((currentEdges) =>
    computeNextButtonEdges({
      currentEdges,
      conditionHandlesNeedingButtonEdges,
      loopHandlesNeedingButtonEdges,
      approvalHandlesNeedingButtonEdges,
      nodesNeedingButtonEdges,
      activeEdgeButtonNodeId,
      activeEdgeButtonHandle,
      onAddNodeFromEdge,
    })
  )

  // After setEdges to avoid nested state-update ordering issues.
  setNodes((currentNodes) =>
    updateNodesForButtonEdgeClasses(currentNodes, {
      nodesNeedingButtonEdges,
      conditionHandlesNeedingButtonEdges,
      loopHandlesNeedingButtonEdges,
      approvalHandlesNeedingButtonEdges,
      connectedHandles,
    })
  )
}

/**
 * Custom hook that maintains button edges on nodes.
 * - Adds button edges to nodes without outgoing edges
 * - Removes button edges from nodes with outgoing edges
 * - Manages placeholder nodes for button edge targets
 * - Updates node classes for proper styling
 * - Skips all button edge logic when in execution view mode
 */
export function useButtonEdgeMaintenance({
  nodes,
  edges,
  isInitialized,
  activeEdgeButtonNodeId,
  activeEdgeButtonHandle,
  onAddNodeFromEdge,
  pendingEdge,
  setNodes,
  setEdges,
  executionStatus,
}: UseButtonEdgeMaintenanceOptions) {
  // Memoize real node IDs+types (excluding placeholders and pending targets) to use as stable dependency.
  // Including the node type ensures the effect re-runs when a node is replaced with a different type
  // (e.g. task → approval), even though the node ID stays the same during a replace operation.
  const realNodeIds = useMemo(() => {
    return filterRealNodes(nodes)
      .map((node) => `${node.id}:${node.type ?? ''}`)
      .sort((a, b) => a.localeCompare(b, 'en'))
      .join(',')
  }, [nodes])

  // Memoize real edges to track edge changes for button edge maintenance (handles affect connectedHandles).
  const realEdgesSignature = useMemo(() => {
    const realEdges = edges.filter(isRealEdge)
    return realEdges
      .map((edge) => {
        const sourceHandle = edge.sourceHandle ?? EdgeHandleEnum.SOURCE
        const targetHandle = edge.targetHandle ?? ''
        return `${edge.source}::${sourceHandle}::${edge.target}::${targetHandle}`
      })
      .sort((a, b) => a.localeCompare(b, 'en'))
      .join('|')
  }, [edges])

  // Memoize button edges to track when they change (needed for one-at-a-time addition)
  const buttonEdgesSignature = useMemo(() => {
    const buttonEdges = filterButtonEdges(edges)
    return buttonEdges
      .map((edge) => edge.id)
      .sort((a, b) => a.localeCompare(b, 'en'))
      .join('|')
  }, [edges])

  // Bump when onAddNodeFromEdge identity changes so dedupe does not skip handler refresh (computeNextButtonEdges).
  const onAddHandlerSerialRef = useRef(0)
  const prevOnAddHandlerRef = useRef(onAddNodeFromEdge)
  if (prevOnAddHandlerRef.current !== onAddNodeFromEdge) {
    prevOnAddHandlerRef.current = onAddNodeFromEdge
    onAddHandlerSerialRef.current += 1
  }
  const onAddHandlerSignature = onAddHandlerSerialRef.current

  // Dedup signature prevents duplicate runs when deps change but content is the same.
  const lastProcessedSignatureRef = useRef<string>('')

  // Reset dedup when isInitialized transitions false → true (after undo/redo or
  // initial load). This is the authoritative signal that React Flow has settled
  // with correct restored data. Without this reset, the main effect might skip
  // processing if the new signature happens to match the stale one.
  const prevIsInitRef = useRef(isInitialized)
  useEffect(() => {
    const wasUninit = !prevIsInitRef.current
    prevIsInitRef.current = isInitialized
    if (wasUninit && isInitialized) {
      lastProcessedSignatureRef.current = ''
    }
  }, [isInitialized])

  // Maintain button edges: add to nodes without outgoing edges, remove from nodes with outgoing edges
  useEffect(() => {
    // Skip button edge creation when in execution view mode
    if (!isInitialized || executionStatus) {
      return
    }

    // Create a signature for this effect run to detect duplicates in Strict Mode
    // CRITICAL: Include buttonEdgesSignature to allow effect to run again when ButtonEdges are added one-at-a-time
    // CRITICAL: Include pendingEdge to allow effect to run when pending edge is cleared (panel closed)
    // CRITICAL: Use '::' as separator instead of '|' because signature values contain '|' characters
    const pendingEdgeSignature = pendingEdge
      ? `pending:${pendingEdge.sourceNodeId}:${pendingEdge.sourceHandle ?? EdgeHandleEnum.SOURCE}`
      : 'no-pending'
    const activeButtonSignature = `${activeEdgeButtonNodeId ?? 'none'}:${activeEdgeButtonHandle ?? 'none'}`
    const currentSignature = `${realNodeIds}::${realEdgesSignature}::${buttonEdgesSignature}::${pendingEdgeSignature}::${activeButtonSignature}::${isInitialized}::onAdd:${onAddHandlerSignature}`

    // CRITICAL: Check signature BEFORE starting timeout to prevent race conditions in Strict Mode
    // In Strict Mode, effects run twice rapidly - both would start timeouts before either updates the ref
    // By checking here, the second effect run returns immediately without starting a timeout
    if (lastProcessedSignatureRef.current === currentSignature) {
      return
    }
    lastProcessedSignatureRef.current = currentSignature

    // Use a delay to ensure nodes are fully loaded and measured, and edges are synchronized
    const timeoutId = setTimeout(() => {
      runButtonEdgeMaintenanceWork({
        nodes,
        edges,
        pendingEdge,
        setNodes,
        setEdges,
        activeEdgeButtonNodeId,
        activeEdgeButtonHandle,
        onAddNodeFromEdge,
      })
    }, 50) // Small delay to let React Flow settle and edges sync from reactFlowInstance

    return () => clearTimeout(timeoutId)
    // Note: We depend on signatures (realNodeIds, realEdgesSignature, buttonEdgesSignature)
    // instead of raw nodes/edges arrays to avoid unnecessary re-runs when references change
    // but content is the same. Signatures are computed from the actual node/edge data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    realNodeIds,
    realEdgesSignature,
    buttonEdgesSignature,
    isInitialized,
    pendingEdge,
    setEdges,
    setNodes,
    onAddNodeFromEdge,
    activeEdgeButtonNodeId,
    activeEdgeButtonHandle,
    executionStatus,
  ])

  // Return memoized values that might be useful
  return { realNodeIds, realEdgesSignature, buttonEdgesSignature }
}
