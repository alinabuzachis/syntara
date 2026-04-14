import { useEffect, useState } from 'react'

import { detachPromise } from '../../utils/detachPromise'

import { accessFetchClient } from './accessClient'

/**
 * Checks whether the current user has permission to query authz
 * (i.e. use the "Who Can" tab). Returns `true` if allowed, `false` otherwise.
 * Defaults to `false` while the check is in flight.
 */
export function useCanQueryAuthz(): boolean {
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    let cancelled = false

    detachPromise(
      accessFetchClient
        .POST('/authz/can-i', {
          body: { action: 'query', resource_type: 'authz' },
        })
        .then(({ data }) => {
          if (!cancelled && data?.allowed) {
            setAllowed(true)
          }
        })
    )

    return () => {
      cancelled = true
    }
  }, [])

  return allowed
}
