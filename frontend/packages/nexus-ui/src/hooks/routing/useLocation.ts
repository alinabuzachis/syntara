import { useRouterState } from '@tanstack/react-router'

/**
 * @deprecated Use `useRouterState` from `@tanstack/react-router` directly.
 */
export function useLocation(): string {
  return useRouterState({ select: (s) => s.location.pathname })
}
