import { useParams as useWouterParams } from 'wouter'

type DefaultParams = Record<string, string | undefined>

/**
 * Routing bridge: returns typed route parameters from the closest matching ancestor `<Route>`.
 *
 * Delegates to wouter today; the implementation will be replaced with TanStack Router
 * during migration without requiring changes to consumers.
 */
export function useParams<T extends DefaultParams = DefaultParams>() {
  // wouter returns `DefaultParams | T`; assert to T since a matched route guarantees the typed params are present
  return useWouterParams<T>() as T
}
