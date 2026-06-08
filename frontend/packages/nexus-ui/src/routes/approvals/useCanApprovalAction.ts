import { useEffect, useState } from 'react'

import { detachPromise } from '../../utils/detachPromise'
import { accessFetchClient } from '../access/accessClient'

type ApprovalAction = 'decide' | 'read'

/**
 * Checks whether the current user has permission to perform an action on approvals.
 *
 * Returns `{ canPerformAction, isChecking }`:
 * - `isChecking` is `true` while the API call is in flight
 * - `canPerformAction` is the resolved permission (`false` until check completes)
 *
 * @param action - The action to check permission for ('decide' for approve/reject, 'read' for viewing)
 * @param projectId - Optional project ID to scope the permission check
 */
export function useCanApprovalAction(
  action: ApprovalAction,
  projectId?: string | null
): { canPerformAction: boolean; isChecking: boolean } {
  const [canPerformAction, setCanPerformAction] = useState(false)
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    let cancelled = false

    const body = projectId
      ? {
          action,
          resource_type: 'approval',
          resource_id: `project:${projectId}`,
        }
      : {
          action,
          resource_type: 'approval',
        }

    detachPromise(
      accessFetchClient
        .POST('/authz/can_i', { body })
        .then(({ data }) => {
          if (!cancelled) {
            setCanPerformAction(data?.allowed ?? false)
            setIsChecking(false)
          }
        })
        .catch(() => {
          if (!cancelled) {
            setIsChecking(false)
          }
        })
    )

    return () => {
      cancelled = true
    }
  }, [action, projectId])

  return { canPerformAction, isChecking }
}
