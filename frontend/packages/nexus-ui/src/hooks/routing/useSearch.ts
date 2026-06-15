import { useSearch as useWouterSearch } from 'wouter'

/**
 * Routing bridge: returns the raw URL search string (e.g. `"?status=running"`).
 *
 * Delegates to wouter today; the implementation will be replaced with TanStack Router
 * during migration without requiring changes to consumers.
 */
export function useSearch() {
  return useWouterSearch()
}
