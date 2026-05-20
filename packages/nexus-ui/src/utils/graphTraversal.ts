import type { Edge, Node } from '@xyflow/react'

import { parseTriggerIndex } from './triggerNodeIds'

export type AncestorNode = {
  id: string;
  name: string;
  type?: string;
  portTowardTarget?: string;
}

type ParentInfo = { sourceId: string; sourceHandle?: string }

function buildParentMap(edges: Edge[]): Map<string, ParentInfo[]> {
  const parentMap = new Map<string, ParentInfo[]>()
  for (const edge of edges) {
    const parentInfo: ParentInfo = {
      sourceId: edge.source,
      sourceHandle: edge.sourceHandle || undefined,
    }
    const sources = parentMap.get(edge.target)
    if (sources) {
      sources.push(parentInfo)
    } else {
      parentMap.set(edge.target, [parentInfo])
    }
  }
  return parentMap
}

/**
 * Walk backwards from a target node to collect all ancestor nodes via BFS.
 * Handles cycles via a visited set. Excludes the target node itself and trigger nodes.
 */
export function getAncestorNodes(targetNodeId: string, edges: Edge[], allNodes: Node[]): AncestorNode[] {
  const ancestors: AncestorNode[] = []
  const visited = new Set<string>([targetNodeId])
  const queue = [targetNodeId]
  const parentMap = buildParentMap(edges)
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]))

  while (queue.length > 0) {
    const current = queue.shift()!
    const sources = parentMap.get(current)
    if (!sources) continue
    for (const parentInfo of sources) {
      const { sourceId, sourceHandle } = parentInfo
      if (!visited.has(sourceId)) {
        visited.add(sourceId)
        queue.push(sourceId)
        if (parseTriggerIndex(sourceId) !== undefined) continue
        const predNode = nodeMap.get(sourceId)
        ancestors.push({
          id: sourceId,
          name: (predNode?.data as { name?: string } | undefined)?.name ?? sourceId,
          type: (predNode?.data as { type?: string } | undefined)?.type ?? predNode?.type,
          portTowardTarget: sourceHandle,
        })
      }
    }
  }

  return ancestors
}
