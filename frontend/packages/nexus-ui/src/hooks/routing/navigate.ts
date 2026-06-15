import { navigate as wouterNavigate } from 'wouter/use-browser-location'

/**
 * Routing bridge: imperative `navigate(path, options?)` for use outside React components.
 *
 * Delegates to wouter today; the implementation will be replaced with TanStack Router
 * during migration without requiring changes to consumers.
 */
export function navigate(...args: Parameters<typeof wouterNavigate>) {
  return wouterNavigate(...args)
}
