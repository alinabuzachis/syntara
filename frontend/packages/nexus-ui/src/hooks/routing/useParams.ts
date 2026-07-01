import { useParams as useTanStackParams } from '@tanstack/react-router'

type DefaultParams = Record<string, string | undefined>

/**
 * Routing bridge: returns typed route parameters from the closest matching route.
 *
 * Thin wrapper over TanStack Router's `useParams` with `strict: false` so it
 * works without a compile-time route type reference — compatible with the
 * wouter-shaped bridge signature used by all consumers.
 */
export function useParams<T extends DefaultParams = DefaultParams>(): T {
  return useTanStackParams({ strict: false }) as T
}
