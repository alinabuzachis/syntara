import type { Node } from '@xyflow/react'

import type { IconDescriptor } from '../../automations/canvas/nodes/nodeIconResolver'
import { getCanvasNodeIconDescriptor } from '../../automations/canvas/nodes/nodeIconResolver'
import type { NodeType } from '../../automations/canvas/nodes/NodeType'
import { NodeRegistry } from '../registry/NodeRegistry'

/**
 * Use this when you only have a registry node type/subtype id (Add Node flow).
 */
export function resolveIconForType({
  nodeTypeId,
  nodeSubtypeId,
}: {
  nodeTypeId?: string | null
  nodeSubtypeId?: string | null
}): IconDescriptor {
  const iconId = nodeSubtypeId ?? nodeTypeId ?? undefined
  if (!iconId) return { icon: undefined, id: undefined }

  const nodes = NodeRegistry.getAll()
  for (const nodeDef of nodes) {
    if (nodeDef.id === iconId) return { icon: nodeDef.icon, id: iconId }
    const subtype = nodeDef.subtypes?.find((item) => item.id === iconId)
    if (subtype) return { icon: subtype.icon, id: iconId }
  }

  return { icon: undefined, id: iconId }
}

/**
 * Use this when you have a runtime node instance (Edit Node flow).
 */
export function resolveIconForNode(
  node: Node<NodeType['data']>,
  currentWorkflow?: { triggers?: Array<{ type?: string }> } | null
): IconDescriptor {
  return getCanvasNodeIconDescriptor(node, currentWorkflow)
}
