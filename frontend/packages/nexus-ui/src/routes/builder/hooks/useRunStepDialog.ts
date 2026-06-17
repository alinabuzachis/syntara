import { useReactFlow } from '@xyflow/react'
import { useCallback, useEffect, useRef } from 'react'

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
  const pinnedMockDataForDialog = useMockDataStore((s) =>
    runStepDialog.item?.nodeId ? s.getInputMocks(runStepDialog.item.nodeId) : undefined
  )

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
