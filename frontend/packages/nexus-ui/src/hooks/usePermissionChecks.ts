import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'

import { accessFetchClient } from '../routes/access/accessClient'

import type { PermissionRequirement } from './permissionUtils'
import { permissionKey } from './permissionUtils'

type UsePermissionChecksResult = {
  /** Map from `resourceType:action` key to whether the permission is allowed. */
  permissions: Record<string, boolean>
  /** `true` while any permission check is still in flight. */
  isLoading: boolean
}

/**
 * Checks multiple permissions in parallel via `POST /authz/can_i`.
 *
 * Uses TanStack Query (`useQueries`) for caching and deduplication — queries
 * share the same cache entries as `useCanI` calls with matching parameters.
 * Safe-false defaults: every permission is `false` until its check resolves.
 *
 * The `checks` array should be referentially stable (module-level constant or
 * wrapped in `useMemo`) to avoid redundant API calls.
 *
 * @example
 * ```ts
 * const CHECKS = [
 *   { action: 'read', resourceType: 'setting' },
 *   { action: 'read', resourceType: 'audit' },
 * ] as const
 *
 * const { permissions } = usePermissionChecks(CHECKS)
 * // permissions['setting:read'] → boolean
 * // permissions['audit:read']   → boolean
 * ```
 */
export function usePermissionChecks(checks: readonly PermissionRequirement[]): UsePermissionChecksResult {
  const results = useQueries({
    queries: checks.map((check) => ({
      queryKey: ['authz', 'can_i', { action: check.action, resource_type: check.resourceType }] as const,
      queryFn: () =>
        accessFetchClient.POST('/authz/can_i', {
          body: { action: check.action, resource_type: check.resourceType },
        }),
      staleTime: Infinity,
      retry: false,
    })),
  })

  const isLoading = results.some((r) => r.isLoading)

  const fingerprint = results.map((r) => r.data?.data?.allowed).join(',')

  const permissions = useMemo(() => {
    const perms: Record<string, boolean> = {}
    for (let i = 0; i < checks.length; i++) {
      perms[permissionKey(checks[i])] = results[i]?.data?.data?.allowed === true
    }
    return perms
    // eslint-disable-next-line react-hooks/exhaustive-deps -- values tracked via fingerprint
  }, [fingerprint, checks])

  return { permissions, isLoading }
}
