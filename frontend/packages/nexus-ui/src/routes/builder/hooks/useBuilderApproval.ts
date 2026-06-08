import type { Approval } from '@ansible/nexus-contracts'
import type { Node } from '@xyflow/react'
import { useCallback, useMemo, useState } from 'react'

import type { WorkflowDefinition } from '../../../stores/workflowStoreTypes'
import {
  type ExecutionNode,
  isWaitingApprovalNode,
  useExecutionApproval,
} from '../../executions/hooks/useExecutionApproval'
import type { NodeType } from '../../workflows/canvas/nodes/NodeType'
import { EXECUTION_BADGE_SELECTOR } from '../components/ExecutionStatusBadge'

type UseBuilderApprovalParams = {
  mostRecentExecutionId: string | null | undefined
  showMostRecentRunPanelInEditor: boolean
  currentWorkflow: WorkflowDefinition | null
  handleNodeClick: (event: React.MouseEvent, node: Node<NodeType['data']>) => void
  isLiveRunActive: boolean
}

type UseBuilderApprovalResult = {
  pendingApproval: Approval | null
  isApprovalLoading: boolean
  approvalViewOpen: boolean
  activityNameMap: Map<string, string>
  wrappedHandleNodeClick: (event: React.MouseEvent, node: Node<NodeType['data']>) => void
  handleApprovalClose: () => void
  openApprovalView: () => void
}

export function useBuilderApproval({
  mostRecentExecutionId,
  showMostRecentRunPanelInEditor,
  currentWorkflow,
  handleNodeClick,
  isLiveRunActive,
}: UseBuilderApprovalParams): UseBuilderApprovalResult {
  const {
    pendingApproval,
    isLoading: isApprovalLoading,
    handleNodeClick: handleApprovalNodeClick,
    clearPendingApproval,
  } = useExecutionApproval(mostRecentExecutionId ?? undefined)

  const [approvalViewOpen, setApprovalViewOpen] = useState(false)

  const handleApprovalClose = useCallback(() => {
    setApprovalViewOpen(false)
    clearPendingApproval()
  }, [clearPendingApproval])

  const openApprovalView = useCallback(() => {
    setApprovalViewOpen(true)
  }, [])

  const activityNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const activity of currentWorkflow?.workflow?.activities ?? []) {
      if (activity.id && activity.name) {
        map.set(activity.id, activity.name)
      }
    }
    return map
  }, [currentWorkflow])

  const wrappedHandleNodeClick = useCallback(
    (event: React.MouseEvent, node: Node<NodeType['data']>) => {
      if (showMostRecentRunPanelInEditor) {
        const target = event.target as HTMLElement | null
        const clickedBadge = target?.closest?.(EXECUTION_BADGE_SELECTOR) != null
        const execNode: ExecutionNode = { id: node.id, type: node.type, data: node.data as Record<string, unknown> }
        if (clickedBadge && isWaitingApprovalNode(execNode)) {
          handleApprovalNodeClick(event, execNode)
          return
        }
      }
      // During live run, only approval clicks are allowed (handled above)
      // Other clicks are blocked to prevent opening node editor
      if (!isLiveRunActive) {
        handleNodeClick(event, node)
      }
    },
    [showMostRecentRunPanelInEditor, handleApprovalNodeClick, handleNodeClick, isLiveRunActive]
  )

  return {
    pendingApproval,
    isApprovalLoading,
    approvalViewOpen,
    activityNameMap,
    wrappedHandleNodeClick,
    handleApprovalClose,
    openApprovalView,
  }
}
