import { MenuNodeType, type MenuNodeTypeValue } from '../constants'

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

export function resolveFlowNodeId(params: {
  nodeId: string
  nodeType: MenuNodeTypeValue
  triggerIndex?: number
}): string {
  const { nodeId, nodeType, triggerIndex } = params
  return nodeType === MenuNodeType.TRIGGER ? buildTriggerNodeId(triggerIndex ?? 0) : nodeId
}
