import { useQuery } from '@tanstack/react-query'

import { accessFetchClient } from '../routes/access/accessClient'

type UseCanIResult = {
  /** Whether the current user has the requested permission. `false` until the check resolves. */
  allowed: boolean
  /** `true` while the API call is in flight. */
  isChecking: boolean
}

type UseCanIOptions = {
  /** Scope the check to a specific resource instance (e.g. `project:my-project`). */
  resourceId?: string
  /** Skip the API call when `false`. Defaults to `true`. */
  enabled?: boolean
}

/**
 * Checks a single permission via `POST /authz/can_i`.
 *
 * Safe-false default: returns `{ allowed: false }` until the check completes
 * or if the request fails, so gated UI stays hidden/disabled until confirmed.
 *
 * Uses TanStack Query for caching and deduplication — two components calling
 * `useCanI('read', 'setting')` share a single API request. Invalidate all
 * permission caches after role changes with:
 * `queryClient.invalidateQueries({ queryKey: ['authz', 'can_i'] })`
 *
 * @example
 * ```ts
 * const { allowed: canDelete } = useCanI('delete', 'workflow')
 * ```
 */
export function useCanI(action: string, resourceType: string, options?: UseCanIOptions): UseCanIResult {
  const { data, isLoading } = useQuery({
    queryKey: [
      'authz',
      'can_i',
      {
        action,
        resource_type: resourceType,
        ...(options?.resourceId ? { resource_id: options.resourceId } : {}),
      },
    ],
    queryFn: () =>
      accessFetchClient.POST('/authz/can_i', {
        body: {
          action,
          resource_type: resourceType,
          ...(options?.resourceId ? { resource_id: options.resourceId } : {}),
        },
      }),
    enabled: options?.enabled !== false,
    select: (res) => res.data?.allowed === true,
    staleTime: Infinity,
    retry: false,
  })

  return { allowed: data ?? false, isChecking: isLoading }
}
