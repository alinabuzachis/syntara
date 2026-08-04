import { useRouterState } from '@tanstack/react-router'

/**
 * @deprecated Use `useSearch` from `@tanstack/react-router` with route-specific search validation.
 */
export function useSearch(): string {
  return useRouterState({ select: (s) => s.location.searchStr.replace(/^\?/, '') })
}
