import { useReactFlow } from '@xyflow/react'
import { useCallback } from 'react'

import { MenuNodeType, type MenuNodeTypeValue } from '../../../../../constants'

// Re-export for convenience
export { MenuNodeType, type MenuNodeTypeValue } from '../../../../../constants'

export interface NodeMenuAction {
  id: string
  label: string
  onClick: () => void
  icon?: React.ReactNode
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

  const handleDelete = useCallback(() => {
    // Use React Flow's deleteElements to trigger proper cleanup via onNodesDelete
    // This ensures edges are removed and ButtonEdges are recreated correctly
    const flowNodeId = nodeType === MenuNodeType.TRIGGER ? `trigger-${triggerIndex}` : nodeId
    void deleteElements({ nodes: [{ id: flowNodeId }] })
  }, [nodeType, nodeId, triggerIndex, deleteElements])

  // Build the menu actions array
  const deleteAction: NodeMenuAction = {
    id: 'delete',
    label: 'Delete',
    onClick: handleDelete,
    variant: 'danger',
  }

  // If there are additional actions, include them with a separator before delete
  if (additionalActions.length > 0) {
    const separator: NodeMenuAction = {
      id: 'separator-before-delete',
      label: '',
      onClick: () => {},
      separator: true,
    }
    return [...additionalActions, separator, deleteAction]
  }

  return [deleteAction]
}
