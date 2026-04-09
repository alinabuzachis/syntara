import { EdgeHandleEnum } from '@ansible/nexus-contracts'
import { useEffect, useMemo, useRef } from 'react'
import { flushSync } from 'react-dom'

import { FlowNodeType } from '../../../constants'
import type { NodeType } from '../../automations/canvas/nodes/NodeType'
import type { FlowPosition } from '../types'
import { filterButtonEdges, filterRealNodes } from '../utils/filterHelpers'
import type { EdgeType } from '../utils/workflowToGraph'

import { mergeNewPlaceholderNodes, processMultiHandleNode } from './buttonEdgeMaintenanceHelpers'
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
      .sort()
      .join(',')
  }, [nodes])

  // Memoize real edges count to track edge changes for button edge maintenance
  const realEdgesSignature = useMemo(() => {
    const realEdges = edges.filter(
      (edge) => edge.type !== 'buttonEdge' && !edge.id.startsWith('button-') && !edge.id.startsWith('pending-')
    )
    return realEdges
      .map((edge) => `${edge.source}-${edge.target}`)
      .sort()
      .join('|')
  }, [edges])

  // Memoize button edges to track when they change (needed for one-at-a-time addition)
  const buttonEdgesSignature = useMemo(() => {
    const buttonEdges = filterButtonEdges(edges)
    return buttonEdges
      .map((edge) => edge.id)
      .sort()
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

  // Track the last processed signature to prevent duplicate runs in React Strict Mode
  const lastProcessedSignatureRef = useRef<string>('')

  // CRITICAL: Reset signature when edges are cleared (workflow switch)
  // This prevents old workflow signatures from blocking new workflow processing
  useEffect(() => {
    if (edges.length === 0 && lastProcessedSignatureRef.current !== '') {
      lastProcessedSignatureRef.current = ''
    }
  }, [edges.length])

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
      // CRITICAL FIX: Capture real nodes from current nodes state
      // Filter out placeholders and pending targets
      const realNodes = nodes.filter(
        (node) => !node.id.startsWith('placeholder-') && !node.id.startsWith('pending-target-')
      )

      // If no real nodes, nothing to do
      if (realNodes.length === 0) {
        return
      }

      // CRITICAL FIX: We need to determine which placeholder nodes to add FIRST,
      // then add them to the nodes state, THEN add the ButtonEdges.
      // If we add ButtonEdges before placeholder nodes exist, React Flow removes the invalid edges!

      // CRITICAL: Use a ref to store which nodes need ButtonEdges and placeholders
      // This allows us to add placeholder nodes BEFORE calling setEdges
      // Important for React Strict Mode where effects run twice
      const nodesNeedingButtonEdgesRef = { current: [] as string[] }
      const placeholderNodesToAddRef = { current: [] as NodeType[] }

      // Step 1: Analyze edges to determine which nodes need ButtonEdges
      // IMPORTANT: Only track OUTGOING edges (edge.source), NOT incoming edges (edge.target)
      // A node should keep its ButtonEdge even if it receives incoming connections
      // IMPORTANT: Exclude button edges AND pending edges (which are temporary)
      const connectedHandles = new Map<string, Set<string>>()
      edges.forEach((edge) => {
        if (edge.type !== 'buttonEdge' && !edge.id.startsWith('button-') && !edge.id.startsWith('pending-')) {
          const handle = edge.sourceHandle ?? EdgeHandleEnum.SOURCE
          if (!connectedHandles.has(edge.source)) {
            connectedHandles.set(edge.source, new Set())
          }
          connectedHandles.get(edge.source)!.add(handle)
        }
      })

      // Track condition node handles that need button edges (nodeId-handleId format)
      const conditionHandlesNeedingButtonEdgesRef = { current: [] as { nodeId: string; handleId: string }[] }
      // Track loop node 'done' handles that need button edges
      const loopHandlesNeedingButtonEdgesRef = { current: [] as { nodeId: string; handleId: string }[] }
      // Track approval node handles that need button edges
      const approvalHandlesNeedingButtonEdgesRef = { current: [] as { nodeId: string; handleId: string }[] }

      // Step 2: Determine which nodes need ButtonEdges and which placeholders to add
      realNodes.forEach((node) => {
        const isConditionNode = node.type === FlowNodeType.CONDITION
        const isLoopNode = node.type === FlowNodeType.LOOP
        const isApprovalNode = node.type === FlowNodeType.APPROVAL

        // Handle multi-handle nodes (condition, approval, loop) using the reusable helper
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
            handlesNeedingButtonEdges: conditionHandlesNeedingButtonEdgesRef.current,
            placeholderNodesToAdd: placeholderNodesToAddRef.current,
          })
          return
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
            handlesNeedingButtonEdges: approvalHandlesNeedingButtonEdgesRef.current,
            placeholderNodesToAdd: placeholderNodesToAddRef.current,
          })
          return
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
            handlesNeedingButtonEdges: loopHandlesNeedingButtonEdgesRef.current,
            placeholderNodesToAdd: placeholderNodesToAddRef.current,
          })
          return
        }

        const sourceHandleConnected = connectedHandles.get(node.id)?.has(EdgeHandleEnum.SOURCE) ?? false
        const hasPendingEdge = pendingEdge?.sourceNodeId === node.id
        const shouldHaveButtonEdge = !sourceHandleConnected && !hasPendingEdge

        if (shouldHaveButtonEdge) {
          nodesNeedingButtonEdgesRef.current.push(node.id)

          // CRITICAL FIX: Always check if placeholder exists, not just when ButtonEdge is missing
          // A ButtonEdge might exist in state but its placeholder node might have been removed
          const placeholderId = `placeholder-${node.id}`
          const placeholderExists = nodes.some((n) => n.id === placeholderId)

          if (!placeholderExists) {
            placeholderNodesToAddRef.current.push({
              id: placeholderId,
              type: FlowNodeType.PLACEHOLDER,
              position: { x: node.position.x + 200, y: node.position.y },
              data: {},
              draggable: false,
              selectable: false,
            } as unknown as NodeType)
          }
        }
      })

      // Step 3: Add placeholder nodes FIRST using flushSync to ensure synchronous update
      // CRITICAL: flushSync forces React to process this state update immediately
      // This ensures placeholder nodes are in React Flow's internal state BEFORE we add edges
      if (placeholderNodesToAddRef.current.length > 0) {
        const placeholders = placeholderNodesToAddRef.current
        flushSync(() => {
          setNodes((currentNodes) => mergeNewPlaceholderNodes(placeholders, currentNodes))
        })
      }

      // Step 4: Now add/update ButtonEdges (placeholders are GUARANTEED to exist in React Flow's state)
      setEdges((currentEdges) =>
        computeNextButtonEdges({
          currentEdges,
          conditionHandlesNeedingButtonEdges: conditionHandlesNeedingButtonEdgesRef.current,
          loopHandlesNeedingButtonEdges: loopHandlesNeedingButtonEdgesRef.current,
          approvalHandlesNeedingButtonEdges: approvalHandlesNeedingButtonEdgesRef.current,
          nodesNeedingButtonEdges: nodesNeedingButtonEdgesRef.current,
          activeEdgeButtonNodeId,
          activeEdgeButtonHandle,
          onAddNodeFromEdge,
        })
      )

      // Step 5: Update node classes and placeholder positions (AFTER setEdges to avoid nested state updates)
      setNodes((currentNodes) =>
        updateNodesForButtonEdgeClasses(currentNodes, {
          nodesNeedingButtonEdges: nodesNeedingButtonEdgesRef.current,
          conditionHandlesNeedingButtonEdges: conditionHandlesNeedingButtonEdgesRef.current,
          loopHandlesNeedingButtonEdges: loopHandlesNeedingButtonEdgesRef.current,
          approvalHandlesNeedingButtonEdges: approvalHandlesNeedingButtonEdgesRef.current,
          connectedHandles,
        })
      )
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
