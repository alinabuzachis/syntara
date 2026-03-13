import { useReactFlow } from '@xyflow/react'
import { useCallback } from 'react'
import type { ReactNode } from 'react'

import { useAlerts } from '../../../../../components/alerts'
import { type MenuNodeTypeValue, MenuNodeType } from '../../../../../constants'
import { useNodeActions } from '../../../../../routes/builder/NodeActionsContext'
import { resolveFlowNodeId } from '../../../../../utils/triggerNodeIds'

// Re-export for convenience
export { MenuNodeType, type MenuNodeTypeValue } from '../../../../../constants'

export interface NodeMenuAction {
  id: string
  label: string
  onClick: () => void
  icon?: ReactNode
  variant?: 'default' | 'danger'
  separator?: boolean
}

interface UseNodeMenuActionsOptions {
  nodeId: string
  nodeType: MenuNodeTypeValue
  triggerIndex?: number
  additionalActions?: NodeMenuAction[]
}

/**
 * Custom hook for managing node menu actions in the workflow builder.
 * Provides a flexible, extensible way to define menu items for different node types.
 *
 * Uses React Flow's deleteElements API to ensure proper edge cleanup and ButtonEdge maintenance.
 *
 * When rendered inside a NodeActionsContext.Provider (i.e. within BuilderContent),
 * additional builder-specific actions are automatically included:
 * - View details (all node types)
 * - Run step (activity nodes only — currently a placeholder)
 * - Duplicate (activity nodes only)
 * - Replace (all node types)
 *
 * @param options Configuration options for the node menu
 * @returns Array of menu actions to display in the kebab menu
 *
 * @example
 * // For activity nodes (Task, Condition, Join, Loop, Parallel)
 * const menuActions = useNodeMenuActions({
 *   nodeId: props.data.id,
 *   nodeType: MenuNodeType.ACTIVITY,
 * })
 *
 * @example
 * // For trigger nodes
 * const triggerIndex = parseInt(props.id.split('-')[1])
 * const menuActions = useNodeMenuActions({
 *   nodeId: props.id,
 *   nodeType: MenuNodeType.TRIGGER,
 *   triggerIndex,
 * })
 *
 * @example
 * // With additional custom actions
 * const menuActions = useNodeMenuActions({
 *   nodeId: props.data.id,
 *   nodeType: MenuNodeType.ACTIVITY,
 *   additionalActions: [
 *     {
 *       id: 'duplicate',
 *       label: 'Duplicate',
 *       onClick: () => handleDuplicate(),
 *       icon: <CopyIcon />,
 *     },
 *   ],
 * })
 */
export function useNodeMenuActions(options: UseNodeMenuActionsOptions): NodeMenuAction[] {
  const { nodeId, nodeType, triggerIndex, additionalActions = [] } = options
  const { deleteElements } = useReactFlow()
  const { showInfo } = useAlerts()
  const nodeActions = useNodeActions()

  const handleDelete = useCallback(() => {
    // Use React Flow's deleteElements to trigger proper cleanup via onNodesDelete
    // This ensures edges are removed and ButtonEdges are recreated correctly
    const flowNodeId = resolveFlowNodeId({ nodeId, nodeType, triggerIndex })
    void deleteElements({ nodes: [{ id: flowNodeId }] })
  }, [nodeType, nodeId, triggerIndex, deleteElements])

  const handleViewDetails = useCallback(() => {
    nodeActions?.onViewDetails(nodeId)
  }, [nodeActions, nodeId])

  const handleRunStep = useCallback(() => {
    showInfo('Not yet implemented.')
  }, [showInfo])

  const handleDuplicate = useCallback(() => {
    nodeActions?.onDuplicate(nodeId)
  }, [nodeActions, nodeId])

  const handleReplace = useCallback(() => {
    nodeActions?.onReplace(nodeId)
  }, [nodeActions, nodeId])

  // Build the menu actions array
  const deleteAction: NodeMenuAction = {
    id: 'delete',
    label: 'Delete',
    onClick: handleDelete,
    variant: 'danger',
  }

  // Builder-specific actions — only present when NodeActionsContext is provided.
  // Omitted automatically in execution view and any other non-builder context.
  const builderActions: NodeMenuAction[] = nodeActions
    ? [
        {
          id: 'view-details',
          label: 'View node details',
          onClick: handleViewDetails,
        },
        ...(nodeType === MenuNodeType.ACTIVITY
          ? [
              {
                id: 'run-step',
                label: 'Run step',
                onClick: handleRunStep,
              },
              {
                id: 'duplicate',
                label: 'Duplicate',
                onClick: handleDuplicate,
              },
              {
                id: 'replace',
                label: 'Replace',
                onClick: handleReplace,
              },
            ]
          : []),
      ]
    : []

  const allAdditionalActions = [...builderActions, ...additionalActions]

  if (allAdditionalActions.length > 0) {
    return [...allAdditionalActions, deleteAction]
  }

  return [deleteAction]
}
