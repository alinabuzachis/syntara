import { type ExecutionStatus, ExecutionStatusEnum } from '@ansible/nexus-contracts'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'

import { detachPromise } from '../../../utils/detachPromise'
import { useExecutionWebSocket } from '../../workflows/hooks/useExecutionWebSocket'
import { useExecutionStore } from '../../workflows/stores/useExecutionStore'

type UseBuilderLiveRunPanelParams = {
  mostRecentExecutionId: string | null | undefined
  mostRecentRunPanelOpen: boolean
  executionStatus: ExecutionStatus | null | undefined
  isViewingExecution: boolean
}

type UseBuilderLiveRunPanelResult = {
  showMostRecentRunPanelInEditor: boolean
  canvasExecutionStatus: ExecutionStatus | null
  mostRecentSelectedNodeId: string | null
  mostRecentSelectedNodeName: string | null
  mostRecentPanelHeight: number
  handleMostRecentResize: (deltaY: number) => void
  handleMostRecentNodeSelect: (nodeId: string, nodeName: string) => void
  handleMostRecentDeselectNode: () => void
}

const MIN_PANEL_HEIGHT = 100
const MAX_PANEL_HEIGHT = 600

export function useBuilderLiveRunPanel({
  mostRecentExecutionId,
  mostRecentRunPanelOpen,
  executionStatus,
  isViewingExecution,
}: UseBuilderLiveRunPanelParams): UseBuilderLiveRunPanelResult {
  const queryClient = useQueryClient()

  const [mostRecentSelectedNodeId, setMostRecentSelectedNodeId] = useState<string | null>(null)
  const [mostRecentSelectedNodeName, setMostRecentSelectedNodeName] = useState<string | null>(null)
  const [mostRecentPanelHeight, setMostRecentPanelHeight] = useState(300)

  useEffect(() => {
    if (mostRecentExecutionId) {
      useExecutionStore.getState().reset()
    }
  }, [mostRecentExecutionId])

  const isActive = mostRecentRunPanelOpen && !!mostRecentExecutionId
  const isRunningOrPending =
    executionStatus === ExecutionStatusEnum.RUNNING || executionStatus === ExecutionStatusEnum.PENDING
  const canvasExecutionStatus = isActive ? (executionStatus ?? null) : null
  const showMostRecentRunPanelInEditor = isActive && !isViewingExecution

  useExecutionWebSocket(mostRecentExecutionId ?? '', {
    enabled: isActive && isRunningOrPending,
    onExecutionComplete: () => {
      detachPromise(
        Promise.all([
          queryClient.invalidateQueries({ queryKey: ['get', '/executions/{execution_id}'] }),
          queryClient.invalidateQueries({ queryKey: ['get', '/executions'] }),
        ])
      )
    },
  })

  const handleMostRecentResize = useCallback((deltaY: number) => {
    setMostRecentPanelHeight((prev) => Math.min(MAX_PANEL_HEIGHT, Math.max(MIN_PANEL_HEIGHT, prev - deltaY)))
  }, [])

  const handleMostRecentNodeSelect = useCallback((nodeId: string, nodeName: string) => {
    setMostRecentSelectedNodeId(nodeId)
    setMostRecentSelectedNodeName(nodeName)
  }, [])

  const handleMostRecentDeselectNode = useCallback(() => {
    setMostRecentSelectedNodeId(null)
    setMostRecentSelectedNodeName(null)
  }, [])

  return {
    showMostRecentRunPanelInEditor,
    canvasExecutionStatus,
    mostRecentSelectedNodeId,
    mostRecentSelectedNodeName,
    mostRecentPanelHeight,
    handleMostRecentResize,
    handleMostRecentNodeSelect,
    handleMostRecentDeselectNode,
  }
}
