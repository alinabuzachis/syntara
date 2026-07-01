import type { ThProps } from '@patternfly/react-table'
import { SortByDirection } from '@patternfly/react-table'
import { useCallback, useMemo } from 'react'

import { useSearchParams } from './routing/useSearchParams'

export type UseSortStateResult = {
  activeSortIndex: number | undefined
  sortDirection: 'asc' | 'desc'
  sortParam: string | undefined
  getSortParams: (columnIndex: number) => ThProps['sort']
}

export function useSortState(sortFieldByColumn: Record<number, string>, onSortChange?: () => void): UseSortStateResult {
  const [searchParams, setSearchParams] = useSearchParams()

  const { activeSortIndex, sortDirection } = useMemo(() => {
    const raw = searchParams.get('sort')
    if (!raw) return { activeSortIndex: undefined, sortDirection: 'asc' as const }

    const desc = raw.startsWith('-')
    const field = desc ? raw.slice(1) : raw
    const index = Object.entries(sortFieldByColumn).find(([, f]) => f === field)?.[0]

    if (index === undefined) return { activeSortIndex: undefined, sortDirection: 'asc' as const }
    return { activeSortIndex: Number(index), sortDirection: desc ? ('desc' as const) : ('asc' as const) }
  }, [searchParams, sortFieldByColumn])

  const sortField = activeSortIndex === undefined ? undefined : sortFieldByColumn[activeSortIndex]
  const prefix = sortDirection === 'desc' ? '-' : ''
  const sortParam = sortField ? `${prefix}${sortField}` : undefined

  const getSortParams = useCallback(
    (columnIndex: number): ThProps['sort'] => ({
      sortBy: {
        index: activeSortIndex,
        direction: sortDirection,
        defaultDirection: 'asc',
      },
      onSort: (_event, index, direction) => {
        const field = sortFieldByColumn[index]
        if (!field) return

        const prefix = direction === SortByDirection.desc ? '-' : ''
        const liveParams = new URLSearchParams(window.location.search)
        liveParams.set('sort', `${prefix}${field}`)
        setSearchParams(liveParams)
        onSortChange?.()
      },
      columnIndex,
    }),
    [activeSortIndex, sortDirection, sortFieldByColumn, setSearchParams, onSortChange]
  )

  return { activeSortIndex, sortDirection, sortParam, getSortParams }
}
