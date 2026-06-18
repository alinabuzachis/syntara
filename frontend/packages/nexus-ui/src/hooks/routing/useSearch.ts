import { useRouterState } from '@tanstack/react-router'
import { useSearch as useWouterSearch } from 'wouter'

import { isTanStackRouter } from '../../app/routerFlag'

function useSearchWouter(): string {
  return useWouterSearch()
}

function useSearchTanStack(): string {
  // TanStack's searchStr includes the leading '?'; strip it to match wouter's shape.
  return useRouterState({ select: (s) => s.location.searchStr.replace(/^\?/, '') })
}

/**
 * Routing bridge: returns the raw URL search string (e.g. `"status=running"`).
 *
 * Delegates to wouter or TanStack Router depending on the `nexus-ui-router`
 * localStorage flag. The implementation never changes at runtime — a page
 * reload is required to switch routers.
 */
export const useSearch = isTanStackRouter() ? useSearchTanStack : useSearchWouter
