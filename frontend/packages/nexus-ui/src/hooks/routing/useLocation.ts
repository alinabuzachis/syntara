import { useLocation as useWouterLocation } from 'wouter'

/**
 * Routing bridge: returns the current pathname string.
 *
 * Delegates to wouter today; the implementation will be replaced with TanStack Router
 * during migration without requiring changes to consumers.
 *
 * For navigation, use `useNavigate()` instead.
 */
export function useLocation(): string {
  const [path] = useWouterLocation()
  return path
}
