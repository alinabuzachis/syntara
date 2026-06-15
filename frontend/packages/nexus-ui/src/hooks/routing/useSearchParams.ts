import { useSearchParams as useWouterSearchParams } from 'wouter'

/**
 * Routing bridge: returns `[searchParams, setSearchParams]` backed by the current URL query string.
 *
 * Delegates to wouter today; the implementation will be replaced with TanStack Router
 * during migration without requiring changes to consumers.
 */
export function useSearchParams() {
  return useWouterSearchParams()
}
