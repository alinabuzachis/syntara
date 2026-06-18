import type { Approval } from '@ansible/nexus-contracts'

import { approvalsClient } from '../../../client'

function isApproval(data: unknown): data is Approval {
  return typeof data === 'object' && data !== null && 'id' in data && typeof data.id === 'string'
}

/**
 * Reads a `?approval=<approvalId>` URL search param and fetches the approval.
 * Returns the fetched approval so the caller can react to it.
 *
 * Used when deep-linking from the approvals list page to the execution viewer.
 */
export function useFetchApprovalForUrlParam(searchParams: string): Approval | undefined {
  const approvalId = new URLSearchParams(searchParams).get('approval')

  const approvalQuery = approvalsClient.useQuery(
    'get',
    '/approvals/{approval_id}',
    { params: { path: { approval_id: approvalId ?? '' } } },
    { enabled: !!approvalId }
  )

  return isApproval(approvalQuery.data) ? approvalQuery.data : undefined
}
