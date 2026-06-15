import { useLocation as useWouterLocation } from 'wouter'

/**
 * Routing bridge: returns `[currentPath, navigate]`.
 *
 * Delegates to wouter today; the implementation will be replaced with TanStack Router
 * during migration without requiring changes to consumers.
 */
export function useLocation() {
  return useWouterLocation()
}
