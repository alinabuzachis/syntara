import { useCallback, useRef, useState } from 'react'

import { isWaitingApprovalNode, useExecutionApproval } from './useExecutionApproval'

type ExecutionNode = { id: string; type?: string; data: Record<string, unknown> }

type ExecutionState = {
  status?: string
}

function getExecutionState(node: ExecutionNode): ExecutionState | undefined {
  const value = node.data.__executionState
  if (typeof value === 'object' && value !== null) return value as ExecutionState
  return undefined
}

function getNodeDisplayName(node: ExecutionNode): string {
  const name = node.data.name
  return typeof name === 'string' ? name : node.id
}

function getNodeActivityId(node: ExecutionNode): string {
  const defId = node.data.definitionId
  if (typeof defId === 'string') return defId
  return node.id
}

/**
 * Composes node click handling for the execution view:
 * 1. Approval nodes in "waiting" status → delegates to useExecutionApproval
 * 2. Completed/failed nodes → toggles node details panel via selectedNodeId
 */
export function useExecutionNodeClick(executionId: string | undefined) {
  const {
    pendingApproval,
    isLoading: isApprovalLoading,
    handleNodeClick: handleApprovalNodeClick,
    clearPendingApproval,
    setPendingApproval,
    fetchForNode,
  } = useExecutionApproval(executionId)

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedNodeName, setSelectedNodeName] = useState<string | null>(null)
  // Ref mirrors selectedNodeId so the click callback never goes stale
  const selectedNodeIdRef = useRef<string | null>(null)

  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: ExecutionNode) => {
      if (isWaitingApprovalNode(node)) {
        handleApprovalNodeClick(event, node)
        return
      }

      const execState = getExecutionState(node)
      if (execState?.status === 'completed' || execState?.status === 'failed') {
        const activityId = getNodeActivityId(node)
        selectedNodeIdRef.current = activityId
        setSelectedNodeId(activityId)
        setSelectedNodeName(getNodeDisplayName(node))
      }
    },
    [handleApprovalNodeClick]
  )

  const selectNode = useCallback((nodeId: string, nodeName: string) => {
    selectedNodeIdRef.current = nodeId
    setSelectedNodeId(nodeId)
    setSelectedNodeName(nodeName)
  }, [])

  const deselectNode = useCallback(() => {
    selectedNodeIdRef.current = null
    setSelectedNodeId(null)
    setSelectedNodeName(null)
  }, [])

  return {
    pendingApproval,
    isApprovalLoading,
    clearPendingApproval,
    setPendingApproval,
    fetchForNode,
    selectedNodeId,
    selectedNodeName,
    selectNode,
    deselectNode,
    handleNodeClick,
  }
}
