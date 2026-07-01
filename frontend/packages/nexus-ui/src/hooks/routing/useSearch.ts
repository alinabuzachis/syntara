import { useRouterState } from '@tanstack/react-router'

/**
 * Routing bridge: returns the raw URL search string (e.g. `"status=running"`).
 *
 * TanStack's `searchStr` includes the leading `?`; it is stripped here to
 * preserve the wouter-compatible shape expected by all consumers.
 */
export function useSearch(): string {
  return useRouterState({ select: (s) => s.location.searchStr.replace(/^\?/, '') })
}
