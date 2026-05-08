import { useEffect, useState } from 'react'

import { detachPromise } from '../../utils/detachPromise'

import { accessFetchClient } from './accessClient'

/**
 * Checks whether the current user has permission to query authz
 * (i.e. use the "Who Can" tab).
 *
 * Returns `{ canQuery, isChecking }`:
 * - `isChecking` is `true` while the API call is in flight
 * - `canQuery` is the resolved permission (`false` until check completes)
 */
export function useCanQueryAuthz(): { canQuery: boolean; isChecking: boolean } {
  const [canQuery, setCanQuery] = useState(false)
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    let cancelled = false

    detachPromise(
      accessFetchClient
        .POST('/authz/can-i', {
          body: { action: 'query', resource_type: 'authz' },
        })
        .then(({ data }) => {
          if (!cancelled) {
            setCanQuery(data?.allowed ?? false)
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
  }, [])

  return { canQuery, isChecking }
}
