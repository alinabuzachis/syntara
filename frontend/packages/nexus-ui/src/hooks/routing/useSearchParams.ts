import { useRouter, useRouterState } from '@tanstack/react-router'
import { useCallback, useMemo } from 'react'
import { useSearchParams as useWouterSearchParams } from 'wouter'

import { isTanStackRouter } from '../../app/routerFlag'
import type { tanstackRouter } from '../../app/tanstackRouter'

function useSearchParamsWouter() {
  return useWouterSearchParams()
}

function useSearchParamsTanStack(): readonly [URLSearchParams, (params: URLSearchParams) => void] {
  const router = useRouter<typeof tanstackRouter>()
  const searchStr = useRouterState({ select: (s) => s.location.searchStr })

  const params = useMemo(() => new URLSearchParams(searchStr), [searchStr])

  // Use history.push directly to avoid TanStack's route-typed navigate() constraints.
  // The bridge hook needs to set arbitrary search params regardless of the current route's schema.
  const setParams = useCallback(
    (newParams: URLSearchParams) => {
      const newSearch = newParams.toString()
      const search = newSearch ? `?${newSearch}` : ''
      router.history.push(`${router.state.location.pathname}${search}`)
    },
    [router]
  )

  return [params, setParams] as const
}

/**
 * Routing bridge: returns `[searchParams, setSearchParams]` backed by the current URL query string.
 *
 * Delegates to wouter or TanStack Router depending on the `nexus-ui-router`
 * localStorage flag. The implementation never changes at runtime — a page
 * reload is required to switch routers.
 */
export const useSearchParams = isTanStackRouter() ? useSearchParamsTanStack : useSearchParamsWouter
