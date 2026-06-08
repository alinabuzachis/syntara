import { MenuNodeType, type MenuNodeTypeUnion } from '../constants'

export function buildTriggerNodeId(index: number): string {
  return `trigger-${index}`
}

export function parseTriggerIndex(nodeId: string): number | undefined {
  if (!nodeId.startsWith('trigger-')) return undefined
  const parts = nodeId.split('-')
  if (parts.length < 2) return undefined
  const index = Number.parseInt(parts[1], 10)
  return Number.isNaN(index) ? undefined : index
}

/**
 * Resolve a React Flow node ID to the key used in the nodePositions store.
 * Trigger display IDs (trigger-0) are mapped to definition IDs (e.g. trigger_manual)
 * so positions round-trip through save/load.
 */
export function toPositionKey(nodeId: string, triggers: Array<{ id: string }>): string {
  const index = parseTriggerIndex(nodeId)
  if (index !== undefined) {
    const trigger = triggers[index]
    if (!trigger) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn(
          `toPositionKey: trigger index ${index} out of bounds (${triggers.length} triggers), falling back to display ID "${nodeId}"`
        )
      }
      return nodeId
    }
    return trigger.id
  }
  return nodeId
}

export function resolveFlowNodeId(params: {
  nodeId: string
  nodeType: MenuNodeTypeUnion
  triggerIndex?: number
}): string {
  const { nodeId, nodeType, triggerIndex } = params
  return nodeType === MenuNodeType.TRIGGER ? buildTriggerNodeId(triggerIndex ?? 0) : nodeId
}
