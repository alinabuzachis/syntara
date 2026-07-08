import { useReactFlow } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef } from 'react'

import { useDialogState } from '../../../hooks/useDialogState'
import { useMockDataStore } from '../../../stores/useMockDataStore'
import { useWorkflowStore } from '../../../stores/useWorkflowStore'
import { getAncestorNodes } from '../../../utils/graphTraversal'
import type { RunStepDialogData } from '../components/RunStepDialog'

export function useRunStepDialog(handleSaveWorkflow: () => Promise<boolean>, isTerminalStatus: boolean) {
  const reactFlowInstance = useReactFlow()
  const runStepDialog = useDialogState<RunStepDialogData>()
  const openRunStepDialog = runStepDialog.open
  const lastRunStepNodeIdRef = useRef<string | null>(null)

  const itemNodeId = runStepDialog.item?.nodeId
  const predecessors = runStepDialog.item?.predecessors

  const inputMocks = useMockDataStore((s) => (itemNodeId ? s.pinnedData[itemNodeId]?.inputMocks : undefined))
  const pinnedData = useMockDataStore((s) => s.pinnedData)

  const pinnedMockDataForDialog = useMemo(() => {
    if (!itemNodeId) return undefined
    const merged: Record<string, Record<string, unknown>> = inputMocks ? { ...inputMocks } : {}
    for (const pred of predecessors ?? []) {
      if (!merged[pred.id]) {
        const outputMock = pinnedData[pred.id]?.outputMock
        if (outputMock) merged[pred.id] = outputMock
      }
    }
    return Object.keys(merged).length > 0 ? merged : undefined
  }, [itemNodeId, predecessors, inputMocks, pinnedData])

  const handleRunStep = useCallback(
    async (nodeId: string) => {
      const node = reactFlowInstance.getNode(nodeId)
      if (!node?.data) return
      if (useWorkflowStore.getState().isDirty && !(await handleSaveWorkflow())) return
      const ancestors = getAncestorNodes(nodeId, reactFlowInstance.getEdges(), reactFlowInstance.getNodes())
      openRunStepDialog({ nodeId, nodeName: (node.data as { name?: string }).name ?? nodeId, predecessors: ancestors })
    },
    [reactFlowInstance, openRunStepDialog, handleSaveWorkflow]
  )

  const hasCleanedUpRef = useRef(false)
  useEffect(() => {
    if (isTerminalStatus && lastRunStepNodeIdRef.current && !hasCleanedUpRef.current) {
      useMockDataStore.getState().unpinAllInputMocks(lastRunStepNodeIdRef.current)
      lastRunStepNodeIdRef.current = null
      hasCleanedUpRef.current = true
    }
    if (!isTerminalStatus) hasCleanedUpRef.current = false
  }, [isTerminalStatus])

  return { runStepDialog, lastRunStepNodeIdRef, pinnedMockDataForDialog, handleRunStep }
}
