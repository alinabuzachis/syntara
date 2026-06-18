import { useRouterState } from '@tanstack/react-router'
import { useLocation as useWouterLocation } from 'wouter'

import { isTanStackRouter } from '../../app/routerFlag'

function useLocationWouter(): string {
  const [path] = useWouterLocation()
  return path
}

function useLocationTanStack(): string {
  return useRouterState({ select: (s) => s.location.pathname })
}

/**
 * Routing bridge: returns the current pathname string.
 *
 * Delegates to wouter or TanStack Router depending on the `nexus-ui-router`
 * localStorage flag. The implementation never changes at runtime — a page
 * reload is required to switch routers.
 *
 * For navigation, use `useNavigate()` instead.
 */
export const useLocation = isTanStackRouter() ? useLocationTanStack : useLocationWouter
