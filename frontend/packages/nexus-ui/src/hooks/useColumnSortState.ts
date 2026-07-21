import type { ThProps } from '@patternfly/react-table'
import { SortByDirection } from '@patternfly/react-table'
import { useMemo } from 'react'

import { useSearchParams } from './routing/useSearchParams'

export type UseColumnSortStateResult = {
  activeSortIndex: number | undefined
  sortDirection: 'asc' | 'desc'
  sortParam: string | undefined
  getSortParams: (columnIndex: number) => ThProps['sort']
}

/**
 * URL-synced PatternFly table column sort state.
 *
 * Maps column indexes to API field names and reads/writes the `sort` query
 * parameter (`field` / `-field`). Prefer {@link useSortState} when you need
 * `SortConfig`-based URL state without PatternFly column wiring.
 */
export function useColumnSortState(
  sortFieldByColumn: Record<number, string>,
  onSortChange?: () => void
): UseColumnSortStateResult {
  const [searchParams, setSearchParams] = useSearchParams()

  const { activeSortIndex, sortDirection } = useMemo(() => {
    const raw = searchParams.get('sort')
    if (raw === null || raw === '') {
      return { activeSortIndex: undefined, sortDirection: 'asc' as const }
    }

    const desc = raw.startsWith('-')
    const field = desc ? raw.slice(1) : raw
    const matchedEntry = Object.entries(sortFieldByColumn).find(([, f]) => f === field)
    if (matchedEntry === undefined) {
      return { activeSortIndex: undefined, sortDirection: 'asc' as const }
    }

    return {
      activeSortIndex: Number(matchedEntry[0]),
      sortDirection: desc ? ('desc' as const) : ('asc' as const),
    }
  }, [searchParams, sortFieldByColumn])

  let sortParam: string | undefined
  if (activeSortIndex === undefined) {
    sortParam = undefined
  } else if (sortDirection === 'desc') {
    sortParam = `-${sortFieldByColumn[activeSortIndex]}`
  } else {
    sortParam = sortFieldByColumn[activeSortIndex]
  }

  const getSortParams = (columnIndex: number): ThProps['sort'] => ({
    sortBy: {
      index: activeSortIndex,
      direction: sortDirection,
      defaultDirection: 'asc',
    },
    onSort: (_event, index, direction) => {
      const field = sortFieldByColumn[index]
      if (field === undefined) {
        return
      }

      const nextSort = direction === SortByDirection.desc ? `-${field}` : field
      const nextParams = new URLSearchParams(searchParams)
      nextParams.set('sort', nextSort)
      setSearchParams(nextParams)
      if (onSortChange !== undefined) {
        onSortChange()
      }
    },
    columnIndex,
  })

  return { activeSortIndex, sortDirection, sortParam, getSortParams }
}
