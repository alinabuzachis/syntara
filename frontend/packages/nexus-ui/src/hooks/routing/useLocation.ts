import { useRouterState } from '@tanstack/react-router'

/**
 * Routing bridge: returns the current pathname string.
 *
 * For navigation, use `useNavigate()` instead.
 */
export function useLocation(): string {
  return useRouterState({ select: (s) => s.location.pathname })
}
