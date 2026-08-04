import { useMemo } from 'react'

import type { WorkflowDefinition } from '../../../stores/workflowStoreTypes'

export function useBuilderDerivedUiFlags(
  currentWorkflow: WorkflowDefinition | null,
  addNodePanelOpen: boolean,
  nodeEditorMode: 'add' | 'edit' | null
) {
  const hasNoWorkflowNodes = useMemo(() => {
    if (!currentWorkflow) {
      return false
    }
    const triggers = currentWorkflow.triggers ?? []
    const activities = currentWorkflow.workflow?.activities ?? []
    return triggers.length === 0 && activities.length === 0
  }, [currentWorkflow])

  const isAddNodePanelOpen = addNodePanelOpen || hasNoWorkflowNodes
  const isNodeEditorOpen = nodeEditorMode !== null

  return { hasNoWorkflowNodes, isAddNodePanelOpen, isNodeEditorOpen }
}
