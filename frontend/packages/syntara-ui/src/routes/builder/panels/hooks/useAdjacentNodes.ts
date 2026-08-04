import { useStore } from '@xyflow/react'
import { useMemo } from 'react'

import { getAdjacentNodesFromFlow } from './getAdjacentNodesFromFlow'

export type { AdjacentNodes } from './getAdjacentNodesFromFlow'

/**
 * Returns the immediate upstream and downstream neighbors of `nodeId`
 * based on the live React Flow canvas graph (display IDs, same as Run/test-step).
 */
export function useAdjacentNodes(nodeId: string | undefined) {
  const edges = useStore((state) => state.edges)
  const nodes = useStore((state) => state.nodes)

  return useMemo(() => {
    if (!nodeId) {
      return { upstream: [], downstream: [] }
    }

    return getAdjacentNodesFromFlow(nodeId, edges, nodes)
  }, [nodeId, edges, nodes])
}
