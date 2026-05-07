import type { Edge, Node } from '@xyflow/react'

import { parseTriggerIndex } from './triggerNodeIds'

type AncestorNode = { id: string; name: string }

function buildParentMap(edges: Edge[]): Map<string, string[]> {
  const parentMap = new Map<string, string[]>()
  for (const edge of edges) {
    const sources = parentMap.get(edge.target)
    if (sources) {
      sources.push(edge.source)
    } else {
      parentMap.set(edge.target, [edge.source])
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
    for (const sourceId of sources) {
      if (!visited.has(sourceId)) {
        visited.add(sourceId)
        queue.push(sourceId)
        if (parseTriggerIndex(sourceId) !== undefined) continue
        const predNode = nodeMap.get(sourceId)
        ancestors.push({
          id: sourceId,
          name: (predNode?.data as { name?: string } | undefined)?.name ?? sourceId,
        })
      }
    }
  }

  return ancestors
}
