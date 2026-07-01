import { useRouter, useRouterState } from '@tanstack/react-router'
import { useCallback, useMemo } from 'react'

import type { tanstackRouter } from '../../app/tanstackRouter'

/**
 * Routing bridge: returns `[searchParams, setSearchParams]` backed by the current URL query string.
 *
 * Uses `router.history.push` directly to set arbitrary search params without
 * being constrained by the current route's `validateSearch` schema — necessary
 * for `useFilterState` and `useSortState` which pass through unstructured params.
 */
export function useSearchParams(): readonly [URLSearchParams, (params: URLSearchParams) => void] {
  const router = useRouter<typeof tanstackRouter>()
  const searchStr = useRouterState({ select: (s) => s.location.searchStr })

  const params = useMemo(() => new URLSearchParams(searchStr), [searchStr])

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
