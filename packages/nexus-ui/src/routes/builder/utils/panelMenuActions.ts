import type { Node } from '@xyflow/react'

import type { useNodeMenuActions } from '../../automations/canvas/nodes/hooks/useNodeMenuActions'
import type { NodeType } from '../../automations/canvas/nodes/NodeType'

type MenuActions = ReturnType<typeof useNodeMenuActions>

export function buildPanelMenuActions(
  mode: 'add' | 'edit',
  node: Node<NodeType['data']> | undefined,
  menuActions: MenuActions,
  onClose: () => void
) {
  if (mode !== 'edit' || !node) return []

  return menuActions.map((action) => {
    if (action.separator || action.id !== 'delete') {
      return action
    }
    return {
      ...action,
      onClick: () => {
        action.onClick()
        onClose()
      },
    }
  })
}
