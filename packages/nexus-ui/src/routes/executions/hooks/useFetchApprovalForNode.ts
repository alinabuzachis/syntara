import type { Approval } from '@ansible/nexus-contracts'
import { useCallback, useState } from 'react'

import { approvalsClient } from '../../../client'

type UseFetchApprovalForNodeResult = {
  /** The matching approval for the clicked node, or null if not found / not yet fetched. */
  approval: Approval | null
  /** Whether a fetch is currently in progress. */
  isLoading: boolean
  /** Fetch the pending approval for the given node. Returns the approval if found. */
  fetchForNode: (approvalNodeId: string) => Promise<Approval | null>
  /** Clear the current approval (e.g., when closing the review view). */
  clear: () => void
}

/**
 * Hook that lazily fetches pending approvals for a specific execution,
 * then filters client-side by approval_node_id to find the matching approval.
 *
 * This avoids polling — the fetch is triggered on demand when the user clicks
 * a waiting approval node on the canvas.
 */
export function useFetchApprovalForNode(executionId: string): UseFetchApprovalForNodeResult {
  const [approval, setApproval] = useState<Approval | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const { refetch } = approvalsClient.useQuery('get', '/approvals', {
    params: {
      query: {
        execution_id: executionId,
        status: 'pending',
      },
    },
    enabled: false, // Only fetch on demand
  })

  const fetchForNode = useCallback(
    async (approvalNodeId: string): Promise<Approval | null> => {
      setIsLoading(true)
      try {
        const result = await refetch()
        const approvals = result.data?.resources ?? []
        const match = approvals.find((a) => a.approval_node_id === approvalNodeId)
        const resolved = (match?.id ? match : null) as Approval | null
        setApproval(resolved)
        return resolved
      } finally {
        setIsLoading(false)
      }
    },
    [refetch]
  )

  const clear = useCallback(() => {
    setApproval(null)
  }, [])

  return { approval, isLoading, fetchForNode, clear }
}
