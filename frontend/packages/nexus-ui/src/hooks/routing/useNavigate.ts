import { useLocation } from 'wouter'

/**
 * Routing bridge: returns an imperative `navigate(path, options?)` function.
 *
 * Delegates to wouter today; the implementation will be replaced with TanStack Router
 * during migration without requiring changes to consumers.
 */
export function useNavigate() {
  const [, navigate] = useLocation()
  return navigate
}
