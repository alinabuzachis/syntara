import type { ReactFlowInstance } from '@xyflow/react'
import { useCallback } from 'react'

import { useWorkflowStore } from '../../../stores/useWorkflowStore'
import { getAncestorNodes } from '../../../utils/graphTraversal'
import type { RunStepDialogData as TestStepDialogData } from '../components/RunStepDialog'

type UseRunStepParams = {
  reactFlowInstance: ReactFlowInstance
  openTestStepDialog: (data: TestStepDialogData) => void
  handleSaveWorkflow: () => Promise<boolean>
}

export function useRunStep({ reactFlowInstance, openTestStepDialog, handleSaveWorkflow }: UseRunStepParams) {
  return useCallback(
    async (nodeId: string) => {
      const node = reactFlowInstance.getNode(nodeId)
      if (!node?.data) return

      if (useWorkflowStore.getState().isDirty) {
        const saved = await handleSaveWorkflow()
        if (!saved) return
      }

      const ancestors = getAncestorNodes(nodeId, reactFlowInstance.getEdges(), reactFlowInstance.getNodes())

      openTestStepDialog({
        nodeId,
        nodeName: (node.data as { name?: string }).name ?? nodeId,
        predecessors: ancestors,
      })
    },
    [reactFlowInstance, openTestStepDialog, handleSaveWorkflow]
  )
}
