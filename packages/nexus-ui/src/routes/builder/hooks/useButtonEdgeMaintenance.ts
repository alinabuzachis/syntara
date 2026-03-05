import { EdgeHandleEnum } from '@ansible/nexus-contracts'
import { useEffect, useMemo, useRef } from 'react'
import { flushSync } from 'react-dom'

import { FlowNodeType } from '../../../constants'
import type { NodeType } from '../../automations/canvas/nodes/NodeType'
import type { FlowPosition } from '../types'
import { filterButtonEdges, filterRealNodes } from '../utils/filterHelpers'
import type { EdgeType } from '../utils/workflowToGraph'

// Configuration for multi-handle node types (condition, loop, approval)
interface HandlePositionConfig {
  yOffset: number
  xOffset?: number
}

/**
 * Generic helper function to process multi-handle nodes (condition, loop, approval)
 * and create placeholders and button edges as needed
 */
function processMultiHandleNode(
  node: NodeType,
  handles: readonly string[],
  handlePositions: Record<string, HandlePositionConfig>,
  connectedHandles: Map<string, Set<string>>,
  pendingEdge: { sourceNodeId: string; sourceHandle?: string } | null,
  nodes: NodeType[],
  handlesNeedingButtonEdges: { nodeId: string; handleId: string }[],
  placeholderNodesToAdd: NodeType[]
) {
  handles.forEach((handleId) => {
    const handleConnected = connectedHandles.get(node.id)?.has(handleId) ?? false
    // Only consider this handle as having a pending edge if both nodeId AND handleId match
    const hasPendingEdge = pendingEdge?.sourceNodeId === node.id && pendingEdge?.sourceHandle === handleId

    if (!handleConnected && !hasPendingEdge) {
      handlesNeedingButtonEdges.push({ nodeId: node.id, handleId })

      // Create placeholder for this handle
      const placeholderId = `placeholder-${node.id}-${handleId}`
      const placeholderExists = nodes.some((n) => n.id === placeholderId)

      if (!placeholderExists) {
        const positionConfig = handlePositions[handleId]
        const yOffset = positionConfig.yOffset
        const xOffset = positionConfig.xOffset ?? 200
        placeholderNodesToAdd.push({
          id: placeholderId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          type: 'placeholder' as any,
          position: { x: node.position.x + xOffset, y: node.position.y + yOffset },
          data: {},
          draggable: false,
          selectable: false,
        } as NodeType)
      }
    }
  })
}

/**
 * Merges new placeholder nodes into the current nodes array,
 * skipping any that already exist.
 */
function mergeNewPlaceholderNodes(placeholders: NodeType[], currentNodes: NodeType[]): NodeType[] {
  const existingIds = new Set(currentNodes.map((n) => n.id))
  const nodesToAdd = placeholders.filter((n) => !existingIds.has(n.id))
  return nodesToAdd.length > 0 ? [...currentNodes, ...nodesToAdd] : currentNodes
}

interface ButtonEdgeFilterContext {
  conditionHandles: { nodeId: string; handleId: string }[]
  loopHandles: { nodeId: string; handleId: string }[]
  approvalHandles: { nodeId: string; handleId: string }[]
  regularNodeIds: string[]
  activeNodeId: string | null
  activeHandle: string | null
}

/**
 * Determines whether an existing button edge should be kept, returning the
 * edge with updated active state, or null if it should be removed.
 */
function getKeptButtonEdge(edge: EdgeType, ctx: ButtonEdgeFilterContext): EdgeType | null {
  const handleId = edge.sourceHandle

  if (handleId === 'true' || handleId === 'false') {
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

  if (handleId === 'done' || handleId === 'loop') {
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
        isActive: ctx.activeNodeId === edge.source && (ctx.activeHandle === 'source' || !ctx.activeHandle),
      },
    }
  }

  return null
}

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
  // Memoize real node IDs (excluding placeholders and pending targets) to use as stable dependency
  const realNodeIds = useMemo(() => {
    return filterRealNodes(nodes)
      .map((node) => node.id)
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
    const pendingEdgeSignature = pendingEdge ? `pending:${pendingEdge.sourceNodeId}` : 'no-pending'
    const currentSignature = `${realNodeIds}::${realEdgesSignature}::${buttonEdgesSignature}::${pendingEdgeSignature}::${isInitialized}`

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
          const handle = edge.sourceHandle ?? 'source'
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
          processMultiHandleNode(
            node,
            ['true', 'false'] as const,
            { true: { yOffset: -30 }, false: { yOffset: 30 } },
            connectedHandles,
            pendingEdge,
            nodes,
            conditionHandlesNeedingButtonEdgesRef.current,
            placeholderNodesToAddRef.current
          )
          return
        }

        if (isApprovalNode) {
          processMultiHandleNode(
            node,
            [EdgeHandleEnum.APPROVED, EdgeHandleEnum.REJECTED] as const,
            { approved: { yOffset: -30 }, rejected: { yOffset: 30 } },
            connectedHandles,
            pendingEdge,
            nodes,
            approvalHandlesNeedingButtonEdgesRef.current,
            placeholderNodesToAddRef.current
          )
          return
        }

        if (isLoopNode) {
          processMultiHandleNode(
            node,
            ['done', 'loop'] as const,
            { done: { yOffset: -30 }, loop: { yOffset: 0 } },
            connectedHandles,
            pendingEdge,
            nodes,
            loopHandlesNeedingButtonEdgesRef.current,
            placeholderNodesToAddRef.current
          )
          return
        }

        const sourceHandleConnected = connectedHandles.get(node.id)?.has('source') ?? false
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
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              type: 'placeholder' as any,
              position: { x: node.position.x + 200, y: node.position.y },
              data: {},
              draggable: false,
              selectable: false,
            } as NodeType)
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
      setEdges((currentEdges) => {
        // Separate existing edges
        const nonButtonEdges = currentEdges.filter((edge) => {
          return edge.type !== 'buttonEdge' && !edge.id.startsWith('button-')
        })
        const existingButtonEdges = currentEdges.filter((edge) => {
          return edge.type === 'buttonEdge' || edge.id.startsWith('button-')
        })

        // Track which nodes already have ButtonEdges (for regular nodes)
        const nodesWithButtonEdges = new Set(existingButtonEdges.map((edge) => edge.source))

        // Track which condition handles already have ButtonEdges (nodeId-handleId format)
        const conditionHandlesWithButtonEdges = new Set(
          existingButtonEdges
            .filter((edge) => edge.sourceHandle === 'true' || edge.sourceHandle === 'false')
            .map((edge) => `${edge.source}-${edge.sourceHandle}`)
        )

        // Track which loop handles (both 'done' and 'loop') already have ButtonEdges
        const loopHandlesWithButtonEdges = new Set(
          existingButtonEdges
            .filter((edge) => edge.sourceHandle === 'done' || edge.sourceHandle === 'loop')
            .map((edge) => `${edge.source}-${edge.sourceHandle}`)
        )

        // Track which approval handles already have ButtonEdges (nodeId-handleId format)
        const approvalHandlesWithButtonEdges = new Set(
          existingButtonEdges
            .filter(
              (edge) => edge.sourceHandle === EdgeHandleEnum.APPROVED || edge.sourceHandle === EdgeHandleEnum.REJECTED
            )
            .map((edge) => `${edge.source}-${edge.sourceHandle}`)
        )

        // Determine which ButtonEdges to keep, remove, and add
        const buttonEdgesToKeep: EdgeType[] = []
        const buttonEdgesToAdd: EdgeType[] = []

        // Keep ButtonEdges that are still needed and update their active state
        const buttonEdgeCtx: ButtonEdgeFilterContext = {
          conditionHandles: conditionHandlesNeedingButtonEdgesRef.current,
          loopHandles: loopHandlesNeedingButtonEdgesRef.current,
          approvalHandles: approvalHandlesNeedingButtonEdgesRef.current,
          regularNodeIds: nodesNeedingButtonEdgesRef.current,
          activeNodeId: activeEdgeButtonNodeId,
          activeHandle: activeEdgeButtonHandle,
        }

        existingButtonEdges.forEach((edge) => {
          const kept = getKeptButtonEdge(edge, buttonEdgeCtx)
          if (kept) {
            buttonEdgesToKeep.push(kept)
          }
        })

        const makeOnButtonClick = (nodeId: string, handleId: string) => (pos: FlowPosition | undefined) =>
          onAddNodeFromEdge?.(nodeId, undefined, undefined, handleId, pos)

        // Add missing ButtonEdges for regular nodes
        nodesNeedingButtonEdgesRef.current.forEach((nodeId) => {
          if (!nodesWithButtonEdges.has(nodeId)) {
            const buttonEdgeId = `button-${nodeId}`
            const placeholderId = `placeholder-${nodeId}`

            const newEdge = {
              id: buttonEdgeId,
              source: nodeId,
              sourceHandle: EdgeHandleEnum.SOURCE,
              target: placeholderId,
              targetHandle: EdgeHandleEnum.TARGET,
              type: 'buttonEdge',
              selectable: false,
              data: {
                sourceNodeId: nodeId,
                sourceHandle: EdgeHandleEnum.SOURCE,
                onButtonClick: makeOnButtonClick(nodeId, EdgeHandleEnum.SOURCE),
                // For regular nodes, active when nodeId matches and handle is 'source' or not specified
                isActive:
                  activeEdgeButtonNodeId === nodeId &&
                  (activeEdgeButtonHandle === EdgeHandleEnum.SOURCE || !activeEdgeButtonHandle),
              },
            } as unknown
            buttonEdgesToAdd.push(newEdge as EdgeType)
          }
        })

        // Add missing ButtonEdges for condition node handles
        conditionHandlesNeedingButtonEdgesRef.current.forEach(({ nodeId, handleId }) => {
          const key = `${nodeId}-${handleId}`
          if (!conditionHandlesWithButtonEdges.has(key)) {
            const buttonEdgeId = `button-${nodeId}-${handleId}`
            const placeholderId = `placeholder-${nodeId}-${handleId}`

            const newEdge = {
              id: buttonEdgeId,
              source: nodeId,
              sourceHandle: handleId,
              target: placeholderId,
              targetHandle: 'target',
              type: 'buttonEdge',
              selectable: false,
              data: {
                sourceNodeId: nodeId,
                sourceHandle: handleId,
                onButtonClick: makeOnButtonClick(nodeId, handleId),
                // For condition nodes, active only when both nodeId AND handleId match
                isActive: activeEdgeButtonNodeId === nodeId && activeEdgeButtonHandle === handleId,
              },
            } as unknown
            buttonEdgesToAdd.push(newEdge as EdgeType)
          }
        })

        // Add missing ButtonEdges for loop node handles ('done' and 'loop')
        loopHandlesNeedingButtonEdgesRef.current.forEach(({ nodeId, handleId }) => {
          const key = `${nodeId}-${handleId}`
          if (!loopHandlesWithButtonEdges.has(key)) {
            const buttonEdgeId = `button-${nodeId}-${handleId}`
            const placeholderId = `placeholder-${nodeId}-${handleId}`

            const newEdge = {
              id: buttonEdgeId,
              source: nodeId,
              sourceHandle: handleId,
              target: placeholderId,
              targetHandle: 'target',
              type: 'buttonEdge',
              selectable: false,
              data: {
                sourceNodeId: nodeId,
                sourceHandle: handleId,
                onButtonClick: makeOnButtonClick(nodeId, handleId),
                // For loop nodes, active only when both nodeId AND handleId match
                isActive: activeEdgeButtonNodeId === nodeId && activeEdgeButtonHandle === handleId,
              },
            } as unknown
            buttonEdgesToAdd.push(newEdge as EdgeType)
          }
        })

        // Add missing ButtonEdges for approval node handles ('approved' and 'rejected')
        approvalHandlesNeedingButtonEdgesRef.current.forEach(({ nodeId, handleId }) => {
          const key = `${nodeId}-${handleId}`
          if (!approvalHandlesWithButtonEdges.has(key)) {
            const buttonEdgeId = `button-${nodeId}-${handleId}`
            const placeholderId = `placeholder-${nodeId}-${handleId}`

            const newEdge = {
              id: buttonEdgeId,
              source: nodeId,
              sourceHandle: handleId,
              target: placeholderId,
              targetHandle: 'target',
              type: 'buttonEdge',
              selectable: false,
              data: {
                sourceNodeId: nodeId,
                sourceHandle: handleId,
                onButtonClick: makeOnButtonClick(nodeId, handleId),
                // For approval nodes, active only when both nodeId AND handleId match
                isActive: activeEdgeButtonNodeId === nodeId && activeEdgeButtonHandle === handleId,
              },
            } as unknown
            buttonEdgesToAdd.push(newEdge as EdgeType)
          }
        })

        // Combine all edges
        const allButtonEdges = [...buttonEdgesToKeep, ...buttonEdgesToAdd]
        const result = [...nonButtonEdges, ...allButtonEdges]

        // Detect active state changes on kept button edges
        const existingById = new Map(existingButtonEdges.map((e) => [e.id, e]))
        const activeStateChanged = buttonEdgesToKeep.some((edge) => {
          const previous = existingById.get(edge.id)
          return (
            (previous?.data as { isActive?: boolean })?.isActive !== (edge.data as { isActive?: boolean })?.isActive
          )
        })

        // Check if anything changed (length, additions, or active state)
        if (result.length !== currentEdges.length || buttonEdgesToAdd.length > 0 || activeStateChanged) {
          return result
        }

        // No changes needed
        return currentEdges
      })

      // Step 5: Update node classes and placeholder positions (AFTER setEdges to avoid nested state updates)
      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          if (node.id.startsWith('pending-target-')) return node

          // Check if this is a condition node with any button edges
          const isConditionNode = node.type === FlowNodeType.CONDITION
          const conditionHasButtonEdge = isConditionNode
            ? conditionHandlesNeedingButtonEdgesRef.current.some((h) => h.nodeId === node.id)
            : false

          // Check if this is a loop node with any button edges
          const isLoopNode = node.type === FlowNodeType.LOOP
          const loopHasButtonEdge = isLoopNode
            ? loopHandlesNeedingButtonEdgesRef.current.some((h) => h.nodeId === node.id)
            : false

          // Check if this is an approval node with any button edges
          const isApprovalNode = node.type === FlowNodeType.APPROVAL
          const approvalHasButtonEdge = isApprovalNode
            ? approvalHandlesNeedingButtonEdgesRef.current.some((h) => h.nodeId === node.id)
            : false

          const shouldHaveButtonEdge =
            nodesNeedingButtonEdgesRef.current.includes(node.id) ||
            conditionHasButtonEdge ||
            loopHasButtonEdge ||
            approvalHasButtonEdge
          const currentClassName = node.className ?? ''

          // Build new className with button edge class and connected handle classes
          let newClassName = currentClassName
            .replaceAll(/\bhas-button-edge\b/g, '')
            .replaceAll(/\bhandle-\w+-connected\b/g, '')
            .trim()

          if (shouldHaveButtonEdge) {
            newClassName = `${newClassName} has-button-edge`.trim()
          }

          // Add classes for connected handles (handles that have real edges, not button edges)
          const connectedHandlesForNode = connectedHandles.get(node.id)
          if (connectedHandlesForNode && connectedHandlesForNode.size > 0) {
            connectedHandlesForNode.forEach((handleId) => {
              newClassName = `${newClassName} handle-${handleId}-connected`.trim()
            })
          }

          if (newClassName !== currentClassName) {
            return { ...node, className: newClassName }
          }
          return node
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
