import type { Approval } from '@ansible/nexus-contracts'
import { useCallback, useMemo, useState } from 'react'

import { useAutoApprovalDetection } from './useAutoApprovalDetection'
import type { useExecutionNodeClick } from './useExecutionNodeClick'
import { useFetchApprovalForUrlParam } from './useFetchApprovalForUrlParam'

type NodeClickResult = ReturnType<typeof useExecutionNodeClick>

export type WorkflowDefinitionLike = {
  nodes?: Array<Record<string, unknown>>
  workflow?: { activities?: Array<Record<string, unknown>> }
}

export function useExecutionApprovalPanel(
  executionId: string | undefined,
  searchParams: string,
  nodeClick: NodeClickResult,
  workflowDefinition: WorkflowDefinitionLike | undefined
) {
  const { clearPendingApproval, setPendingApproval, fetchForNode, pendingApproval } = nodeClick
  const [panelOpen, setPanelOpen] = useState(false)

  const approvalIdFromUrl = useMemo(() => {
    return new URLSearchParams(searchParams).get('approval')
  }, [searchParams])

  const urlApproval = useFetchApprovalForUrlParam(searchParams)
  const [handledApprovalId, setHandledApprovalId] = useState<string | null>(null)
  if (!approvalIdFromUrl && handledApprovalId !== null) {
    setHandledApprovalId(null)
  } else if (urlApproval?.id && urlApproval.id !== handledApprovalId) {
    setHandledApprovalId(urlApproval.id)
    setPendingApproval(urlApproval)
    setPanelOpen(true)
  }

  const open = useCallback(() => {
    setPanelOpen(true)
  }, [])

  const close = useCallback(() => {
    setPanelOpen(false)
  }, [])

  const dismiss = useCallback(() => {
    setPanelOpen(false)
    clearPendingApproval()
  }, [clearPendingApproval])

  const handleDetected = useCallback(
    (detected: Approval) => {
      setPendingApproval(detected)
      setPanelOpen(true)
    },
    [setPendingApproval]
  )

  useAutoApprovalDetection({
    executionId,
    fetchForNode,
    onApprovalDetected: handleDetected,
  })

  const approvalMessage = useMemo(() => {
    if (!pendingApproval || !workflowDefinition) return undefined
    const nodes = workflowDefinition.nodes ?? workflowDefinition.workflow?.activities ?? []
    const node = nodes.find((n) => n.id === pendingApproval.approval_node_id)
    if (!node) return undefined
    const config = node.config
    if (typeof config === 'object' && config !== null && 'prompt' in config && typeof config.prompt === 'string') {
      return config.prompt
    }
    return undefined
  }, [pendingApproval, workflowDefinition])

  return { panelOpen, approvalMessage, open, close, dismiss }
}
