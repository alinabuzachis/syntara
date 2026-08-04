import { useCanI } from '../../hooks/useCanI'

/**
 * Checks whether the current user has permission to query authz
 * (i.e. use the "Who Can" tab).
 *
 * Returns `{ canQuery, isChecking }`:
 * - `isChecking` is `true` while the API call is in flight
 * - `canQuery` is the resolved permission (`false` until check completes)
 */
export function useCanQueryAuthz(): { canQuery: boolean; isChecking: boolean } {
  const { allowed, isChecking } = useCanI('query', 'authz')
  return { canQuery: allowed, isChecking }
}
