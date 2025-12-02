import { useEffect, useMemo, useRef } from 'react'
import { flushSync } from 'react-dom'

import type { NodeType } from '../../automations/canvas/nodes/NodeType'
import { filterButtonEdges, filterRealNodes } from '../utils/filterHelpers'
import type { EdgeType } from '../utils/workflowToGraph'

interface UseButtonEdgeMaintenanceOptions {
  nodes: NodeType[]
  edges: EdgeType[]
  isInitialized: boolean
  activeEdgeButtonNodeId: string | null
  activeEdgeButtonHandle: string | null
  onAddNodeFromEdge?: (sourceNodeId: string, targetNodeId?: string, edgeId?: string, sourceHandle?: string) => void
  pendingEdge: { sourceNodeId: string; sourceHandle?: string; x: number; y: number } | null
  setNodes: React.Dispatch<React.SetStateAction<NodeType[]>>
  setEdges: React.Dispatch<React.SetStateAction<EdgeType[]>>
}

/**
 * Custom hook that maintains button edges on nodes.
 * - Adds button edges to nodes without outgoing edges
 * - Removes button edges from nodes with outgoing edges
 * - Manages placeholder nodes for button edge targets
 * - Updates node classes for proper styling
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
    if (!isInitialized) {
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
          const handle = edge.sourceHandle || 'source'
          if (!connectedHandles.has(edge.source)) {
            connectedHandles.set(edge.source, new Set())
          }
          connectedHandles.get(edge.source)!.add(handle)
        }
      })

      // Track condition node handles that need button edges (nodeId-handleId format)
      const conditionHandlesNeedingButtonEdgesRef = { current: [] as { nodeId: string; handleId: string }[] }

      // Step 2: Determine which nodes need ButtonEdges and which placeholders to add
      realNodes.forEach((node) => {
        const isConditionNode = node.type === 'condition'

        if (isConditionNode) {
          // Handle condition nodes specially - they have 'true' and 'false' handles
          const handles = ['true', 'false']
          handles.forEach((handleId) => {
            const handleConnected = connectedHandles.get(node.id)?.has(handleId) || false
            // For condition nodes, only consider this handle as having a pending edge if both nodeId AND handleId match
            const hasPendingEdge = pendingEdge?.sourceNodeId === node.id && pendingEdge?.sourceHandle === handleId

            if (!handleConnected && !hasPendingEdge) {
              conditionHandlesNeedingButtonEdgesRef.current.push({ nodeId: node.id, handleId })

              // Create placeholder for this handle
              const placeholderId = `placeholder-${node.id}-${handleId}`
              const placeholderExists = nodes.some((n) => n.id === placeholderId)

              if (!placeholderExists) {
                // Position true handle placeholder above, false handle placeholder below
                const yOffset = handleId === 'true' ? -30 : 30
                placeholderNodesToAddRef.current.push({
                  id: placeholderId,
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  type: 'placeholder' as any,
                  position: { x: node.position.x + 200, y: node.position.y + yOffset },
                  data: {},
                  draggable: false,
                  selectable: false,
                } as NodeType)
              }
            }
          })
          return
        }

        const sourceHandleConnected = connectedHandles.get(node.id)?.has('source') || false
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
        flushSync(() => {
          setNodes((currentNodes) => {
            const existingIds = new Set(currentNodes.map((n) => n.id))
            const nodesToAdd = placeholderNodesToAddRef.current.filter((n) => !existingIds.has(n.id))
            if (nodesToAdd.length > 0) {
              return [...currentNodes, ...nodesToAdd]
            }
            return currentNodes
          })
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
            .filter((edge) => edge.id.includes('-true') || edge.id.includes('-false'))
            .map((edge) => {
              const handleId = edge.id.endsWith('-true') ? 'true' : 'false'
              return `${edge.source}-${handleId}`
            })
        )

        // Determine which ButtonEdges to keep, remove, and add
        const buttonEdgesToKeep: EdgeType[] = []
        const buttonEdgesToAdd: EdgeType[] = []

        // Keep ButtonEdges that are still needed
        existingButtonEdges.forEach((edge) => {
          // Check if it's a condition handle button edge
          if (edge.id.includes('-true') || edge.id.includes('-false')) {
            const handleId = edge.id.endsWith('-true') ? 'true' : 'false'
            const isNeeded = conditionHandlesNeedingButtonEdgesRef.current.some(
              (h) => h.nodeId === edge.source && h.handleId === handleId
            )
            if (isNeeded) {
              buttonEdgesToKeep.push(edge)
            }
          } else if (nodesNeedingButtonEdgesRef.current.includes(edge.source)) {
            buttonEdgesToKeep.push(edge)
          }
        })

        // Add missing ButtonEdges for regular nodes
        nodesNeedingButtonEdgesRef.current.forEach((nodeId) => {
          if (!nodesWithButtonEdges.has(nodeId)) {
            const buttonEdgeId = `button-${nodeId}`
            const placeholderId = `placeholder-${nodeId}`

            const newEdge = {
              id: buttonEdgeId,
              source: nodeId,
              sourceHandle: 'source',
              target: placeholderId,
              targetHandle: 'target',
              type: 'buttonEdge',
              selectable: false,
              data: {
                sourceNodeId: nodeId,
                sourceHandle: 'source',
                onButtonClick: () => onAddNodeFromEdge?.(nodeId, undefined, undefined, 'source'),
                // For regular nodes, active when nodeId matches and handle is 'source' or not specified
                isActive:
                  activeEdgeButtonNodeId === nodeId && (activeEdgeButtonHandle === 'source' || !activeEdgeButtonHandle),
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
                onButtonClick: () => onAddNodeFromEdge?.(nodeId, undefined, undefined, handleId),
                // For condition nodes, active only when both nodeId AND handleId match
                isActive: activeEdgeButtonNodeId === nodeId && activeEdgeButtonHandle === handleId,
              },
            } as unknown
            buttonEdgesToAdd.push(newEdge as EdgeType)
          }
        })

        // Combine all edges
        const allButtonEdges = [...buttonEdgesToKeep, ...buttonEdgesToAdd]
        const result = [...nonButtonEdges, ...allButtonEdges]

        // Check if anything changed
        if (result.length !== currentEdges.length || buttonEdgesToAdd.length > 0) {
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
          const isConditionNode = node.type === 'condition'
          const conditionHasButtonEdge = isConditionNode
            ? conditionHandlesNeedingButtonEdgesRef.current.some((h) => h.nodeId === node.id)
            : false

          const shouldHaveButtonEdge = nodesNeedingButtonEdgesRef.current.includes(node.id) || conditionHasButtonEdge
          const currentClassName = node.className || ''
          const hasClass = currentClassName.includes('has-button-edge')

          if (shouldHaveButtonEdge && !hasClass) {
            return { ...node, className: `${currentClassName} has-button-edge`.trim() }
          } else if (!shouldHaveButtonEdge && hasClass) {
            return { ...node, className: currentClassName.replace('has-button-edge', '').trim() }
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
  ])

  // Return memoized values that might be useful
  return { realNodeIds, realEdgesSignature, buttonEdgesSignature }
}
